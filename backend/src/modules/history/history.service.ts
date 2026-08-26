import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, IsNull } from 'typeorm';
import { Order } from '../orders/order.entity';
import { TableSession } from '../tables/table-session.entity';
import { toCents, fromCents } from '../../common/utils/money';

const TERMINAL_ORDER_STATUSES = ['entregue', 'cancelado'];
const HISTORY_RETENTION_DAYS = 30;

@Injectable()
export class HistoryService {
  private readonly logger = new Logger(HistoryService.name);

  constructor(
    @InjectRepository(Order) private readonly ordersRepo: Repository<Order>,
    @InjectRepository(TableSession) private readonly sessionsRepo: Repository<TableSession>,
  ) {}

  // Roda a cada hora (não uma vez por dia num horário fixo) — um cron
  // diário só dispara se o servidor estiver de pé exatamente naquele
  // instante; num VPS pessoal que reinicia com frequência durante
  // desenvolvimento, isso pode passar dias sem rodar de verdade (foi
  // exatamente o que aconteceu: cupons de mais de 30 dias ainda
  // apareciam na tela). Rodando de hora em hora, o atraso máximo
  // possível pra esconder um cupom vencido é de ~1h, não ~1 dia+.
  // Continua nunca fazendo hard delete — dado de auditoria financeira é
  // preservado no banco, só escondido da UI.
  @Cron(CronExpression.EVERY_HOUR)
  async purgeExpiredHistory(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - HISTORY_RETENTION_DAYS);

    const ordersResult = await this.ordersRepo
      .createQueryBuilder()
      .softDelete()
      .where('deleted_at IS NULL')
      .andWhere('status IN (:...statuses)', { statuses: TERMINAL_ORDER_STATUSES })
      .andWhere('updated_at < :cutoff', { cutoff })
      .execute();

    const sessionsResult = await this.sessionsRepo
      .createQueryBuilder()
      .softDelete()
      .where('deleted_at IS NULL')
      .andWhere('status = :status', { status: 'fechada' })
      .andWhere('closed_at < :cutoff', { cutoff })
      .execute();

    this.logger.log(
      `Purge de histórico: ${ordersResult.affected ?? 0} pedidos e ${sessionsResult.affected ?? 0} sessões ocultados (mais de ${HISTORY_RETENTION_DAYS} dias).`,
    );
  }

  async findHistory(tenantId: string) {
    const sessions = await this.sessionsRepo.find({
      where: { tenantId, status: 'fechada' },
      relations: { table: true, orders: { items: true } },
      order: { closedAt: 'DESC' },
    });

    const standaloneOrders = await this.ordersRepo.find({
      where: {
        tenantId,
        tableSessionId: IsNull(),
        status: In(TERMINAL_ORDER_STATUSES),
      },
      relations: { items: true },
      order: { createdAt: 'DESC' },
    });

    return {
      sessions: sessions.map((session) => this.mapSession(session)),
      standaloneOrders: standaloneOrders.map((order) => this.mapOrder(order)),
    };
  }

  // Busca no ARQUIVO — inclui cupons já escondidos da tela normal pelo
  // cron de 30 dias (`withDeleted: true`, o soft-delete do TypeORM).
  // Nada é perdido de verdade: só a tela do dia a dia esconde pra não
  // acumular meses de pedidos numa lista só, mas se precisar achar um
  // cupom antigo (disputa de cliente, conferência, imposto), essa busca
  // encontra. Exige pelo menos um filtro (texto OU intervalo de datas)
  // pra nunca devolver "todo o histórico desde o início" de uma vez só.
  async searchArchive(
    tenantId: string,
    filters: { query?: string; dateFrom?: string; dateTo?: string },
  ) {
    const hasFilter = Boolean(filters.query?.trim() || filters.dateFrom || filters.dateTo);
    if (!hasFilter) {
      throw new BadRequestException(
        'Informe um texto de busca (nome do cliente) ou um intervalo de datas.',
      );
    }

    const dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : null;
    const dateTo = filters.dateTo ? new Date(filters.dateTo) : null;
    if (dateTo) dateTo.setHours(23, 59, 59, 999); // inclui o dia inteiro do "até"

    const sessionsQuery = this.sessionsRepo
      .createQueryBuilder('session')
      .withDeleted()
      .leftJoinAndSelect('session.table', 'table')
      .leftJoinAndSelect('session.orders', 'orders')
      .leftJoinAndSelect('orders.items', 'items')
      .where('session.tenantId = :tenantId', { tenantId })
      .andWhere('session.status = :status', { status: 'fechada' });
    if (filters.query?.trim()) {
      sessionsQuery.andWhere('orders.customerName ILIKE :query', { query: `%${filters.query.trim()}%` });
    }
    if (dateFrom) sessionsQuery.andWhere('session.closedAt >= :dateFrom', { dateFrom });
    if (dateTo) sessionsQuery.andWhere('session.closedAt <= :dateTo', { dateTo });

    const ordersQuery = this.ordersRepo
      .createQueryBuilder('order')
      .withDeleted()
      .leftJoinAndSelect('order.items', 'items')
      .where('order.tenantId = :tenantId', { tenantId })
      .andWhere('order.tableSessionId IS NULL')
      .andWhere('order.status IN (:...statuses)', { statuses: TERMINAL_ORDER_STATUSES });
    if (filters.query?.trim()) {
      ordersQuery.andWhere('order.customerName ILIKE :query', { query: `%${filters.query.trim()}%` });
    }
    if (dateFrom) ordersQuery.andWhere('order.createdAt >= :dateFrom', { dateFrom });
    if (dateTo) ordersQuery.andWhere('order.createdAt <= :dateTo', { dateTo });

    const [sessions, standaloneOrders] = await Promise.all([
      sessionsQuery.orderBy('session.closedAt', 'DESC').take(100).getMany(),
      ordersQuery.orderBy('order.createdAt', 'DESC').take(100).getMany(),
    ]);

    return {
      sessions: sessions.map((session) => this.mapSession(session)),
      standaloneOrders: standaloneOrders.map((order) => this.mapOrder(order)),
    };
  }

  // Marca/desmarca um cupom (mesa ou avulso) como "importante/requer
  // atenção" — só isso. Não existe exclusão manual de histórico: pedidos
  // e sessões só saem da tela pelo cron automático de 30 dias, exatamente
  // pra impedir que um funcionário apague um cupom pra encobrir fraude.
  async setSessionFlagged(
    tenantId: string,
    sessionId: string,
    flagged: boolean,
  ): Promise<void> {
    const session = await this.sessionsRepo.findOne({
      where: { id: sessionId, tenantId, status: 'fechada' },
    });
    if (!session) throw new NotFoundException('Sessão não encontrada no histórico');
    await this.sessionsRepo.update({ id: sessionId, tenantId }, { flagged });
  }

  async setOrderFlagged(tenantId: string, orderId: string, flagged: boolean): Promise<void> {
    const order = await this.ordersRepo.findOne({
      where: { id: orderId, tenantId, tableSessionId: IsNull() },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado no histórico');
    await this.ordersRepo.update({ id: orderId, tenantId }, { flagged });
  }

  private mapSession(session: TableSession) {
    const nonCancelledOrders = (session.orders ?? []).filter((o) => o.status !== 'cancelado');
    const totalCents = nonCancelledOrders.reduce(
      (sum, order) => sum + toCents(order.total),
      0,
    );
    const customerName = (session.orders ?? []).find((o) => o.customerName)?.customerName ?? null;

    return {
      type: 'mesa' as const,
      sessionId: session.id,
      tableNumber: session.table?.number ?? null,
      customerName,
      closedAt: session.closedAt,
      paymentMethod: session.paymentMethod,
      tipAmount: session.tipAmount,
      total: fromCents(totalCents),
      flagged: session.flagged,
      // Mesma referência usada pelo cron de purge (closed_at), pra bater
      // exatamente com quando o cupom vai realmente sumir da tela.
      expiresAt: this.calculateExpiresAt(session.closedAt),
      orders: (session.orders ?? []).map((o) => this.mapOrder(o)),
    };
  }

  private mapOrder(order: Order) {
    return {
      type: 'avulso' as const,
      orderId: order.id,
      orderType: order.orderType,
      customerName: order.customerName,
      status: order.status,
      createdAt: order.createdAt,
      total: order.total,
      discountAmount: order.discountAmount,
      promotionTitleSnapshot: order.promotionTitleSnapshot,
      flagged: order.flagged,
      deliveryAddress: order.deliveryAddress,
      deliveryReferencePoint: order.deliveryReferencePoint,
      deliveryDistanceKm: order.deliveryDistanceKm,
      deliveryAddressPrecise: order.deliveryAddressPrecise,
      paymentMethod: order.paymentMethod,
      tipAmount: order.tipAmount,
      amountReceived: order.amountReceived,
      // Mesma referência usada pelo cron de purge (updated_at) pra pedidos
      // avulsos.
      expiresAt: this.calculateExpiresAt(order.updatedAt),
      items: (order.items ?? []).map((item) => ({
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
      })),
    };
  }

  private calculateExpiresAt(anchor: Date | null): Date | null {
    if (!anchor) return null;
    const expires = new Date(anchor);
    expires.setDate(expires.getDate() + HISTORY_RETENTION_DAYS);
    return expires;
  }
}
