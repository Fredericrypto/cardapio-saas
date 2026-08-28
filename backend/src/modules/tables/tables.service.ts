import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { RestaurantTable } from './restaurant-table.entity';
import { TableSession } from './table-session.entity';
import { WaiterCall } from './waiter-call.entity';
import { Order } from '../orders/order.entity';
import { Location } from '../locations/location.entity';
import { Tenant } from '../tenants/tenant.entity';
import { CreateTableDto } from './dto/create-table.dto';
import { CashbackService } from '../cashback/cashback.service';
import { PushService } from '../push/push.service';
import { toCents, fromCents } from '../../common/utils/money';
import { computeIsOpenNow } from '../../common/utils/schedule';
import { signReceipt, verifyReceiptSignature, formatVerificationCode, parseVerificationCode } from '../../common/utils/receipt-signature';

@Injectable()
export class TablesService {
  constructor(
    @InjectRepository(RestaurantTable)
    private readonly tableRepo: Repository<RestaurantTable>,
    @InjectRepository(TableSession)
    private readonly sessionRepo: Repository<TableSession>,
    @InjectRepository(WaiterCall)
    private readonly waiterCallRepo: Repository<WaiterCall>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
    private readonly cashbackService: CashbackService,
    private readonly pushService: PushService,
  ) {}

  // Mesma checagem usada na criação de pedido (OrdersService) — chamar
  // garçom e abrir/entrar numa sessão de mesa também são ações do
  // cliente que só fazem sentido com a LOJA (não a marca inteira) aberta.
  // Sem isso, dava pra escanear o QR e chamar garçom mesmo com a loja
  // fechada, o que confundia tanto cliente quanto o próprio dono.
  private async assertOpen(locationId: string): Promise<void> {
    const location = await this.locationRepo.findOne({ where: { id: locationId } });
    if (!location) {
      throw new NotFoundException('Loja não encontrada.');
    }
    if (!computeIsOpenNow(location.isOpen, location.openingHours)) {
      throw new BadRequestException('Esta loja não está aberta no momento.');
    }
  }

  // ---------- Gestão de mesas (painel admin) ----------

  async findAllForAdmin(tenantId: string): Promise<RestaurantTable[]> {
    return this.tableRepo.find({ where: { tenantId }, order: { number: 'ASC' } });
  }

  async create(tenantId: string, dto: CreateTableDto): Promise<RestaurantTable> {
    const location = await this.locationRepo.findOne({
      where: { id: dto.locationId, tenantId },
    });
    if (!location) {
      throw new NotFoundException('Loja não encontrada.');
    }
    const qrCodeToken = randomBytes(24).toString('hex');
    const table = this.tableRepo.create({ ...dto, tenantId, qrCodeToken });
    return this.tableRepo.save(table);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const table = await this.tableRepo.findOne({ where: { id, tenantId } });
    if (!table) {
      throw new NotFoundException('Mesa não encontrada.');
    }
    await this.tableRepo.softDelete(id);
  }

  // ---------- Fluxo do cliente (público, via QR code) ----------

  // Chamado quando o cliente escaneia o QR code. Se já existe uma sessão
  // "aberta" pra essa mesa, reaproveita (várias pessoas na mesma mesa
  // caem na mesma conta). Senão, abre uma nova.
  async openOrJoinSession(qrCodeToken: string): Promise<TableSession> {
    const table = await this.tableRepo.findOne({
      where: { qrCodeToken, isActive: true },
    });
    if (!table) {
      throw new NotFoundException('Mesa não encontrada ou QR code inválido.');
    }
    await this.assertOpen(table.locationId);

    // CRÍTICO: reaproveita a sessão tanto se estiver "aberta" quanto se já
    // tiver "fechamento_solicitado". Sem isso, um cliente que solicitasse o
    // fechamento e voltasse a escanear o QR (ou desse refresh) abriria uma
    // SEGUNDA sessão "por baixo" pra mesma mesa, deixando o garçom sem ver
    // pedidos novos que ficariam fora da conta que ele acha que vai fechar.
    // Só quando a sessão está "fechada" de fato é que uma nova é criada.
    const existingSession = await this.sessionRepo.findOne({
      where: [
        { tableId: table.id, status: 'aberta' },
        { tableId: table.id, status: 'fechamento_solicitado' },
      ],
      relations: { table: true },
      order: { openedAt: 'DESC' },
    });
    if (existingSession) {
      return existingSession;
    }

    const session = this.sessionRepo.create({
      tenantId: table.tenantId,
      tableId: table.id,
      status: 'aberta',
    });
    session.table = table;

    try {
      return await this.sessionRepo.save(session);
    } catch (err: any) {
      // Race condition: outra requisição concorrente (ex: duplo scan quase
      // simultâneo) já criou a sessão ativa dessa mesa entre o SELECT acima
      // e este INSERT. O índice único parcial em table_sessions barra a
      // segunda gravação (código 23505 do Postgres) — em vez de estourar
      // erro pro cliente, buscamos e devolvemos a sessão que "venceu".
      if (err?.code === '23505') {
        const winningSession = await this.sessionRepo.findOne({
          where: [
            { tableId: table.id, status: 'aberta' },
            { tableId: table.id, status: 'fechamento_solicitado' },
          ],
          relations: { table: true },
          order: { openedAt: 'DESC' },
        });
        if (winningSession) {
          return winningSession;
        }
      }
      throw err;
    }
  }

  async findSession(tenantId: string, sessionId: string): Promise<TableSession> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId, tenantId },
    });
    if (!session) {
      throw new NotFoundException('Sessão de mesa não encontrada.');
    }
    return session;
  }

  // "Minha Conta": todos os pedidos feitos nessa sessão + total acumulado.
  async getSessionSummary(tenantId: string, sessionId: string) {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId, tenantId },
      relations: { table: true },
    });
    if (!session) {
      throw new NotFoundException('Sessão de mesa não encontrada.');
    }

    const orders = await this.orderRepo.find({
      where: { tableSessionId: session.id },
      order: { createdAt: 'ASC' },
      relations: { items: true } as any,
    });

    // BUG CORRIGIDO: pedidos cancelados estavam entrando na soma do total.
    // Continuam aparecendo na lista (transparência pro cliente/garçom ver
    // que foi cancelado), mas não contam pra conta final.
    const totalCents = orders
      .filter((order) => order.status !== 'cancelado')
      .reduce((sum, order) => sum + toCents(order.total), 0);
    const total = fromCents(totalCents);
    const tipAmount = Number(session.tipAmount) || 0;
    const grandTotal = fromCents(totalCents + toCents(tipAmount));

    // Nome do cliente pro cupom: pega o primeiro nome preenchido entre os
    // pedidos da sessão (geralmente é o mesmo em todos, se preenchido).
    const customerName = orders.find((o) => o.customerName)?.customerName ?? null;

    // Código de autenticidade — só existe DEPOIS que a mesa fecha de
    // verdade (closedAt preenchido), porque antes disso o total ainda
    // pode mudar (mais pedidos podem entrar) e assinar um valor que
    // ainda vai mudar não faria sentido. Assina a SESSÃO inteira (não
    // cada pedido separado), já que o cupom de mesa mostra um total
    // combinado de vários pedidos + gorjeta — ver
    // OrdersService.attachReceiptCode pro equivalente de pedido avulso.
    const receiptVerificationCode = session.closedAt
      ? formatVerificationCode(
          session.id,
          signReceipt(session.id, tenantId, toCents(grandTotal), session.closedAt.toISOString()),
        )
      : null;

    return { session, orders, total, tipAmount, grandTotal, customerName, receiptVerificationCode };
  }

  // Painel admin: confere um código de autenticidade de cupom de MESA
  // (fechamento de sessão) — mesmo princípio do
  // OrdersService.verifyReceiptCode, só que assinando a SESSÃO inteira
  // em vez de um pedido avulso. Sempre recalcula a partir dos dados
  // ATUAIS da sessão no banco.
  async verifySessionReceiptCode(
    tenantId: string,
    code: string,
  ): Promise<{ valid: boolean; session: TableSession | null; grandTotal: number | null }> {
    const parsed = parseVerificationCode(code);
    if (!parsed) return { valid: false, session: null, grandTotal: null };

    const session = await this.sessionRepo.findOne({
      where: { id: parsed.orderId, tenantId },
      relations: { table: true },
    });
    if (!session || !session.closedAt) return { valid: false, session: null, grandTotal: null };

    const orders = await this.orderRepo.find({ where: { tableSessionId: session.id } });
    const totalCents = orders
      .filter((o) => o.status !== 'cancelado')
      .reduce((sum, o) => sum + toCents(o.total), 0);
    const grandTotalCents = totalCents + toCents(Number(session.tipAmount) || 0);

    const valid = verifyReceiptSignature(
      session.id,
      tenantId,
      grandTotalCents,
      session.closedAt.toISOString(),
      parsed.signature,
    );
    return {
      valid,
      session: valid ? session : null,
      grandTotal: valid ? fromCents(grandTotalCents) : null,
    };
  }

  async requestClosing(
    tenantId: string,
    sessionId: string,
    tipAmount?: number,
  ): Promise<TableSession> {
    const session = await this.findSession(tenantId, sessionId);
    if (session.status !== 'aberta') {
      throw new BadRequestException('Esta sessão já foi fechada ou já solicitou fechamento.');
    }
    session.status = 'fechamento_solicitado';
    session.tipAmount = tipAmount && tipAmount > 0 ? tipAmount : 0;
    return this.sessionRepo.save(session);
  }

  // Lista mesas aguardando o garçom confirmar o fechamento — usado pelo
  // painel admin pra saber quais mesas precisam de atenção pra fechar a conta.
  async findSessionsAwaitingClosing(tenantId: string): Promise<TableSession[]> {
    return this.sessionRepo.find({
      where: { tenantId, status: 'fechamento_solicitado' },
      relations: { table: true },
      order: { openedAt: 'ASC' },
    });
  }

  // Visão geral pro garçom: toda mesa com sessão em andamento, tempo desde
  // a abertura e total acumulado. Não impede fraude sozinho, mas dá
  // visibilidade imediata de qualquer mesa "ativa" que ninguém devia estar
  // usando — o garçom vê na hora, não só quando for fechar a conta.
  async findActiveOverview(tenantId: string) {
    const sessions = await this.sessionRepo.find({
      where: [
        { tenantId, status: 'aberta' },
        { tenantId, status: 'fechamento_solicitado' },
      ],
      relations: { table: true },
      order: { openedAt: 'ASC' },
    });

    const overview: Array<{
      table: RestaurantTable;
      session: TableSession;
      total: number;
      openedAt: Date;
    }> = [];
    for (const session of sessions) {
      const orders = await this.orderRepo.find({
        where: { tableSessionId: session.id },
      });
      const totalCents = orders
        .filter((o) => o.status !== 'cancelado')
        .reduce((sum, o) => sum + toCents(o.total), 0);
      overview.push({
        table: session.table,
        session,
        total: fromCents(totalCents),
        openedAt: session.openedAt,
      });
    }
    return overview;
  }

  // Usado pelo painel admin/garçom pra encerrar de fato a mesa, com o
  // pagamento já resolvido. Todo cálculo de troco é feito aqui, em
  // centavos, nunca confiando em nenhum valor pré-calculado do frontend.
  async closeSession(
    tenantId: string,
    sessionId: string,
    paymentMethod: string,
    amountReceived?: number,
  ): Promise<TableSession> {
    const { session, grandTotal } = await this.getSessionSummary(tenantId, sessionId);

    // BUG CORRIGIDO: sem essa guarda, um duplo-clique em "Confirmar
    // fechamento" (ou o garçom reenviando a requisição após um refresh)
    // reprocessava o pagamento por cima do que já tinha sido registrado —
    // podendo sobrescrever paymentMethod/amountReceived/changeGiven de uma
    // conta que já tinha sido paga corretamente.
    if (session.status === 'fechada') {
      throw new BadRequestException('Esta conta já foi fechada anteriormente.');
    }

    let changeGiven: number | null = null;
    if (paymentMethod === 'dinheiro') {
      if (amountReceived === undefined) {
        throw new BadRequestException(
          'Informe o valor recebido em dinheiro para calcular o troco.',
        );
      }
      const changeCents = toCents(amountReceived) - toCents(grandTotal);
      if (changeCents < 0) {
        throw new BadRequestException(
          'Valor recebido é menor que o total da conta (incluindo gorjeta).',
        );
      }
      changeGiven = fromCents(changeCents);
    }

    session.status = 'fechada';
    session.closedAt = new Date();
    session.paymentMethod = paymentMethod;
    session.amountReceived = amountReceived ?? null;
    session.changeGiven = changeGiven;
    const savedSession = await this.sessionRepo.save(session);

    // BUG CORRIGIDO (v2): a versão anterior forçava QUALQUER pedido não
    // finalizado (pendente/preparando/pronto) direto pra 'entregue' ao
    // fechar a conta. Isso fazia um pedido feito segundos antes de o
    // garçom confirmar o pagamento — que a cozinha nem chegou a ver —
    // sumir da fila de "Pedidos ativos" sem nunca ter sido preparado de
    // fato, mesmo o valor dele já entrando corretamente na conta paga
    // (grandTotal é sempre recalculado fresco no início desta função).
    // Agora só 'pronto' (comida já pronta, só esperando ser servida/levada)
    // é finalizado automaticamente. 'pendente'/'preparando' continuam
    // visíveis pra cozinha terminar, ainda que a sessão já esteja fechada.
    await this.orderRepo
      .createQueryBuilder()
      .update(Order)
      .set({ status: 'entregue' })
      .where('table_session_id = :sessionId', { sessionId })
      .andWhere('status = :readyStatus', { readyStatus: 'pronto' })
      .execute();

    // Cashback: cada pedido da mesa gera seu próprio crédito, calculado
    // sobre o valor dos itens já líquido de promoção — mesma base usada
    // em OrdersService.creditCashbackForPaidOrder. Diferente de
    // balcão/entrega (onde o crédito acontece no instante em que CADA
    // pedido é pago), aqui quem "paga" é a SESSÃO inteira de uma vez só,
    // então o ganho só acontece agora, ao fechar a conta — nunca antes,
    // pra não creditar cashback de um pedido que ainda pudesse ser
    // cancelado antes do fechamento. Pedidos cancelados e pedidos sem
    // cliente logado (convidado, sem carteira) são pulados.
    const sessionOrders = await this.orderRepo.find({ where: { tableSessionId: sessionId, tenantId } });
    const tenantForNotify = await this.orderRepo.manager
      .getRepository(Tenant)
      .findOne({ where: { id: tenantId }, select: { slug: true, logoUrl: true } });
    for (const order of sessionOrders) {
      if (order.status === 'cancelado' || !order.customerId) continue;
      // Trava definitiva já aqui, ANTES do `continue` de elegibilidade
      // abaixo — mesmo um pedido que não gera cashback (ex: muito
      // pequeno) pode ter USADO cashback, e a sessão fechando é o ponto
      // sem volta pra ele também (comida já servida). Sempre salva,
      // mesmo quando não há crédito a dar.
      order.cashbackLocked = true;
      // Notifica "avalie seu pedido" pra CADA pedido dessa sessão do
      // cliente logado — independente de ter gerado cashback ou não,
      // avaliar não depende disso. "Melhor esforço": PushService nunca
      // lança erro, então uma falha de envio nunca derruba o
      // fechamento da mesa.
      if (tenantForNotify) {
        await this.pushService.sendToCustomer(tenantId, order.customerId, {
          title: 'Como foi seu pedido?',
          body: 'Sua opinião ajuda outros clientes e o restaurante a melhorar. Toque pra avaliar.',
          url: `/${tenantForNotify.slug}/conta-cliente/pedidos/mesa/${sessionId}?avaliar=${order.id}`,
          tag: 'review_prompt',
          icon: tenantForNotify.logoUrl ?? undefined,
        });
        // Pagamento da mesa é por PEDIDO aqui de propósito (mesmo que a
        // conta feche de uma vez só) — cada pessoa na mesa pode ter
        // logado com sua própria conta, então cada uma recebe a
        // confirmação do que É DELA, não o total da mesa inteira.
        await this.pushService.sendToCustomer(tenantId, order.customerId, {
          title: 'Pagamento confirmado',
          body: `Recebemos o pagamento de R$ ${Number(order.total).toFixed(2).replace('.', ',')} do seu pedido.`,
          url: `/${tenantForNotify.slug}/conta-cliente/pedidos/mesa/${sessionId}`,
          tag: 'payment_completed',
          groupTag: `payment-${order.id}`,
          icon: tenantForNotify.logoUrl ?? undefined,
        });
      }
      // Mesmo raciocínio de OrdersService.creditCashbackForPaidOrder:
      // `order.total` já está líquido de cashback usado, então NUNCA
      // somar `cashbackUsed` de volta aqui — só tirar a entrega (que
      // pra mesa é sempre 0, mas mantido pela mesma fórmula por
      // consistência).
      const eligibleCents = toCents(order.total) - toCents(order.deliveryFee);
      if (eligibleCents <= 0) {
        await this.orderRepo.save(order);
        continue;
      }
      const result = await this.cashbackService.credit(
        this.orderRepo.manager,
        tenantId,
        order.customerId,
        order.locationId,
        eligibleCents,
        'order',
        order.id,
      );
      if (result.creditedCents > 0) {
        order.cashbackEarned = fromCents(result.creditedCents);
        if (tenantForNotify) {
          const amount = fromCents(result.creditedCents).toFixed(2).replace('.', ',');
          await this.pushService.sendToCustomer(tenantId, order.customerId, {
            title: 'Você ganhou cashback',
            body: `R$ ${amount} caíram na sua carteira desse restaurante. Toque pra ver o saldo.`,
            url: `/${tenantForNotify.slug}/conta-cliente/cashback`,
            tag: 'cashback',
            icon: tenantForNotify.logoUrl ?? undefined,
          });
        }
      }
      await this.orderRepo.save(order);
    }

    // Chamado de garçom pendente dessa mesa não faz mais sentido depois
    // que a conta foi paga e encerrada — fecha junto, pra não ficar
    // piscando pedindo atenção de uma mesa que já foi resolvida.
    await this.waiterCallRepo
      .createQueryBuilder()
      .update(WaiterCall)
      .set({ status: 'atendido', attendedAt: new Date() })
      .where('table_session_id = :sessionId', { sessionId })
      .andWhere('status = :status', { status: 'pendente' })
      .execute();

    return savedSession;
  }

  // Encerramento forçado, sem exigir pagamento — usado pelo garçom/admin
  // pra corrigir situações confusas (sessão presa, teste, engano), sem
  // precisar passar pelo fluxo normal de cobrança. Os pedidos continuam
  // no histórico normalmente, só a sessão é marcada como encerrada, e a
  // mesa fica livre pra uma sessão nova no próximo QR code escaneado.
  async forceResetSession(tenantId: string, sessionId: string): Promise<TableSession> {
    const session = await this.findSession(tenantId, sessionId);
    session.status = 'fechada';
    session.closedAt = new Date();
    session.paymentMethod = session.paymentMethod ?? 'nao_informado';
    const savedSession = await this.sessionRepo.save(session);

    await this.orderRepo
      .createQueryBuilder()
      .update(Order)
      .set({ status: 'cancelado' })
      .where('table_session_id = :sessionId', { sessionId })
      .andWhere('status NOT IN (:...finalStatuses)', {
        finalStatuses: ['entregue', 'cancelado'],
      })
      .execute();

    await this.waiterCallRepo
      .createQueryBuilder()
      .update(WaiterCall)
      .set({ status: 'atendido', attendedAt: new Date() })
      .where('table_session_id = :sessionId', { sessionId })
      .andWhere('status = :status', { status: 'pendente' })
      .execute();

    return savedSession;
  }

  // ---------- Chamar garçom ----------

  async callWaiter(tenantId: string, sessionId: string): Promise<WaiterCall> {
    const session = await this.findSession(tenantId, sessionId);
    const table = await this.tableRepo.findOne({ where: { id: session.tableId } });
    if (!table) {
      throw new NotFoundException('Mesa não encontrada.');
    }
    await this.assertOpen(table.locationId);
    const call = this.waiterCallRepo.create({
      tenantId,
      tableSessionId: session.id,
      status: 'pendente',
    });
    return this.waiterCallRepo.save(call);
  }

  async findPendingWaiterCalls(tenantId: string): Promise<WaiterCall[]> {
    return this.waiterCallRepo.find({
      where: { tenantId, status: 'pendente' },
      order: { createdAt: 'ASC' },
      relations: { tableSession: { table: true } } as any,
    });
  }

  // Usado pelo cliente pra saber quando o chamado dele foi atendido, sem
  // precisar de WebSocket — só pergunta "qual o status do meu último
  // chamado?" a cada poucos segundos e esconde a mensagem quando virar
  // 'atendido'.
  async getLatestWaiterCallStatus(
    tenantId: string,
    sessionId: string,
  ): Promise<{ status: 'pendente' | 'atendido' | 'cancelado' | null }> {
    const call = await this.waiterCallRepo.findOne({
      where: { tenantId, tableSessionId: sessionId },
      order: { createdAt: 'DESC' },
    });
    return {
      status: (call?.status as 'pendente' | 'atendido' | 'cancelado' | undefined) ?? null,
    };
  }

  // "Cancelar chamar garçom" — pro caso do cliente ter clicado sem
  // querer. Só cancela o chamado mais recente, e só se ainda estiver
  // 'pendente' (se o garçom já foi atender, não faz sentido desfazer).
  async cancelWaiterCall(tenantId: string, sessionId: string): Promise<{ cancelled: boolean }> {
    const call = await this.waiterCallRepo.findOne({
      where: { tenantId, tableSessionId: sessionId },
      order: { createdAt: 'DESC' },
    });
    if (!call || call.status !== 'pendente') {
      return { cancelled: false };
    }
    call.status = 'cancelado';
    await this.waiterCallRepo.save(call);
    return { cancelled: true };
  }

  async attendWaiterCall(tenantId: string, callId: string): Promise<WaiterCall> {
    const call = await this.waiterCallRepo.findOne({ where: { id: callId, tenantId } });
    if (!call) {
      throw new NotFoundException('Chamado não encontrado.');
    }
    call.status = 'atendido';
    call.attendedAt = new Date();
    return this.waiterCallRepo.save(call);
  }
}
