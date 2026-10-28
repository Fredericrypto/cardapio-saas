import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, In, LessThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Order } from './order.entity';
import { validateGuestName } from '../../common/utils/guest-name';
import { OrderItem } from './order-item.entity';
import { Product } from '../products/product.entity';
import { Tenant } from '../tenants/tenant.entity';
import { Location } from '../locations/location.entity';
import { Customer } from '../customers/customer.entity';
import { TableSession } from '../tables/table-session.entity';
import { TableSessionParticipant } from '../tables/table-session-participant.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { toCents, fromCents } from '../../common/utils/money';
import type { PushMessageKey } from '../../common/i18n/push-messages';
import { computeIsOpenNow } from '../../common/utils/schedule';
import { buildPixTxId, generatePixPayload } from '../../common/utils/pix';
import { signReceipt, verifyReceiptSignature, formatVerificationCode, parseVerificationCode } from '../../common/utils/receipt-signature';
import { decryptSecret } from '../../common/utils/encryption';
import { MercadoPagoService, MercadoPagoRequestError } from '../payments/mercadopago.service';
import { chargeCents } from '../payments/mp-money';
import {
  buildPaymentExpiredPush,
  buildPaymentPendingPush,
  orderPaymentGroupTag,
  PAYMENT_CONFIRMED_FLAGS,
} from '../../common/utils/payment-push';
import { classifyMpStatus, classifyRejection, rejectionMessage } from '../payments/mp-status';
import type { CardRejectionCode } from '../payments/mp-status';
import { cardIdempotencyKey, pixOrderIdempotencyKey, refundIdempotencyKey } from '../payments/mp-idempotency';
import {
  CARD_PAYMENT_WINDOW_MS,
  MAX_CARD_ATTEMPTS,
  decideAfterExistingPayment,
  decideCardAttempt,
  planPaymentEvent,
} from '../payments/mp-order-state';
import type { CardAttemptBlock, OrderPaymentSnapshot } from '../payments/mp-order-state';
import { isCardOnlineActive, isPixOnlineActive } from '../payments/mp-activation';
import { PayCardDto } from './dto/pay-card.dto';
import { DeliveryService, DeliveryQuoteWithCoordinates } from '../delivery/delivery.service';
import { PromotionsService } from '../promotions/promotions.service';
import type { CartLine } from '../promotions/promotions.service';
import { CashbackService } from '../cashback/cashback.service';
import { PushService } from '../push/push.service';
import { CustomerVerificationService } from '../customers/customer-verification.service';
import { TablesService } from '../tables/tables.service';
import { SIODEngineService } from '../siod/siod-engine.service';
import type { RouteResult } from '../siod/siod.types';
import { stampOrderLifecycle } from './order-lifecycle';
import { TenantCacheService } from '../tenant-cache/tenant-cache.service';
import { InvalidatesTenantCache } from '../tenant-cache/invalidates-tenant-cache.decorator';

// Janela pro cliente pagar o Pix antes do pedido expirar sozinho — mesmo
// tempo que o iFood usa (6 min). Com Mercado Pago configurado, a
// confirmação é automática (webhook + consulta direta); sem ele, é
// manual dos dois lados, então o admin precisa estar de olho no painel
// durante essa janela.
const PIX_PAYMENT_WINDOW_MS = 6 * 60 * 1000;

// Cache da listagem do painel (ver TenantCache): teto duro de 60 s, conferência
// barata (contagem + max(updated_at)) no máximo a cada 2 s por restaurante, e
// invalidação imediata em toda escrita feita por este processo.
const ADMIN_ORDERS_MAX_AGE_MS = 60_000;
const ADMIN_ORDERS_FINGERPRINT_EVERY_MS = 2_000;
// Histórico do cliente: dado só dele, invalidado por qualquer escrita de pedido.
const CUSTOMER_HISTORY_MAX_AGE_MS = 20_000;

// Resposta de POST /orders/public/:tenantId/:id/pay-card.
export interface PayCardResult {
  // approved: pago; processing: em análise ou 3DS pendente (o cliente continua
  // consultando o status); rejected: recusado (pode tentar de novo se sobrar tentativa).
  status: 'approved' | 'processing' | 'rejected';
  orderStatus: string;
  paymentStatus: string;
  rejectionCode: CardRejectionCode | null;
  message: string | null;
  threeDs: { externalResourceUrl: string; creq: string } | null;
  attemptsLeft: number;
  // true quando o pedido foi cancelado por esgotar as tentativas.
  orderCancelled: boolean;
}

const CARD_BLOCK_MESSAGES: Record<CardAttemptBlock, string> = {
  not_card: 'Este pedido não é de pagamento por cartão.',
  already_paid: 'Este pedido já foi pago.',
  not_awaiting: 'Este pedido não está mais aguardando pagamento.',
  expired: 'O tempo para pagar este pedido acabou. Faça um novo pedido.',
  in_flight: 'Já existe um pagamento sendo processado para este pedido. Aguarde alguns instantes.',
  too_many_attempts: 'Número máximo de tentativas atingido para este pedido.',
};

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly deliveryService: DeliveryService,
    private readonly mercadoPagoService: MercadoPagoService,
    private readonly promotionsService: PromotionsService,
    private readonly cashbackService: CashbackService,
    private readonly pushService: PushService,
    private readonly verificationService: CustomerVerificationService,
    private readonly tablesService: TablesService,
    private readonly siodEngine: SIODEngineService,
    // @Optional: testes que montam o service à mão continuam funcionando (sem cache).
    @Optional() private readonly tenantCache?: TenantCacheService,
  ) {}

  // Ponto ÚNICO por onde um pedido vira 'cancelado' — usado nos 4
  // lugares que podem cancelar um pedido (cliente, admin, Pix expirado
  // por polling, Mercado Pago recusado/webhook). Centralizado aqui pra
  // nunca esquecer de liberar a(s) vaga(s) de promoção em algum desses
  // caminhos: se o pedido usou uma ou mais promoções, devolve a vaga de
  // CADA UMA no teto global (ver PromotionsService.releaseRedemption).
  // `promotionIds` é a fonte de verdade (pedido pode ter usado mais de
  // um cupom); cai pra `[promotionId]` só em pedidos bem antigos, de
  // antes dessa coluna existir. Idempotente — se o pedido já estava
  // cancelado, não faz nada (evita liberar a vaga duas vezes por engano).
  // Cancela no Mercado Pago a cobrança Pix cujo prazo do app estourou (o
  // gateway aceita pagar por mais alguns minutos — ver
  // MP_PIX_MIN_EXPIRATION_MS). Best-effort: nunca derruba quem chamou.
  private async cancelGatewayPaymentQuietly(
    tenantId: string,
    mpPaymentId: string | null,
  ): Promise<void> {
    if (!mpPaymentId) return;
    try {
      const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
      if (!tenant?.mercadoPagoAccessTokenEncrypted) return;
      await this.mercadoPagoService.cancelPayment(
        decryptSecret(tenant.mercadoPagoAccessTokenEncrypted),
        mpPaymentId,
      );
    } catch (err) {
      this.logger.warn(`Não foi possível cancelar a cobrança ${mpPaymentId} no gateway: ${err}`);
    }
  }

  // Assento ATIVO de quem está pedindo numa mesa. Mesma regra do
  // TablesService.assertActiveSeat, aqui dentro da transação do pedido.
  private async resolveActiveSeat(
    manager: EntityManager,
    sessionId: string,
    seatToken: string | null,
    customerId: string | null,
  ): Promise<TableSessionParticipant> {
    const repo = manager.getRepository(TableSessionParticipant);
    let seat = seatToken
      ? await repo.findOne({ where: { seatToken, tableSessionId: sessionId } })
      : null;
    if (!seat && customerId) {
      seat = await repo.findOne({ where: { tableSessionId: sessionId, customerId } });
    }
    if (!seat || seat.leftAt) {
      throw new ForbiddenException(
        'Você saiu desta mesa. Escaneie o QR Code da mesa novamente para voltar.',
      );
    }
    // Convidado que fez login no meio da visita: o assento passa a ser do cliente.
    if (!seat.customerId && customerId) {
      const alreadyHasSeat = await repo.exists({ where: { tableSessionId: sessionId, customerId } });
      if (!alreadyHasSeat) {
        seat.customerId = customerId;
        await repo.save(seat);
      }
    }
    return seat;
  }

  // Devolve true só para quem GANHOU o cancelamento. `onlyIfAwaitingPayment` (expiração do Pix) restringe o
  // claim a pedidos AINDA aguardando pagamento: se o pagamento foi confirmado um instante antes, o pedido
  // pago NÃO é cancelado (antes, `status <> cancelado` deixava a expiração cancelar um pedido recém-pago).
  private async markCancelled(
    order: Order,
    reason?: string | null,
    canceledByUserId?: string | null,
    opts?: { onlyIfAwaitingPayment?: boolean },
  ): Promise<boolean> {
    if (order.status === 'cancelado') return false;
    // Análise de cancelamento (aba Análise): motivo, instante e operador.
    const cancelReason = reason?.trim() ? reason.trim().slice(0, 300) : null;
    const canceledAt = new Date();
    const promotionIds = order.promotionIds ?? (order.promotionId ? [order.promotionId] : []);
    // CLAIM ATÔMICO (auditoria P-03). Poll do cliente, poll do painel e webhook
    // podem cancelar o MESMO pedido ao mesmo tempo, cada um com a sua cópia em
    // memória ainda 'aguardando_pagamento'. A guarda acima não vê isso. O UPDATE
    // condicional abaixo só dá certo para UM concorrente (os outros esperam o
    // commit e veem affected=0); só quem ganha devolve promoção e cashback, tudo
    // na MESMA transação: se algo falhar, o pedido continua não cancelado e o
    // próximo caminho tenta de novo (mesmo comportamento de antes). Estorno no
    // gateway (rede) fica fora da transação, como sempre.
    const claimed = await this.dataSource.transaction(async (manager) => {
      const result = await manager
        .createQueryBuilder()
        .update(Order)
        .set({
          status: 'cancelado',
          cancelReason,
          canceledAt,
          canceledByUserId: canceledByUserId ?? null,
        })
        .where(
          opts?.onlyIfAwaitingPayment
            ? 'id = :id AND tenant_id = :tenantId AND status = :awaiting'
            : 'id = :id AND tenant_id = :tenantId AND status <> :cancelled',
          opts?.onlyIfAwaitingPayment
            ? { id: order.id, tenantId: order.tenantId, awaiting: 'aguardando_pagamento' }
            : { id: order.id, tenantId: order.tenantId, cancelled: 'cancelado' },
        )
        .execute();
      if ((result.affected ?? 0) !== 1) return false;
      // ORDEM DE LOCKS = a de create(): cashback (ledger) antes da linha da
      // promoção. Inverter isso criaria deadlock entre criar e cancelar pedidos.
      // Cashback: se o pedido tinha usado saldo (cashbackUsed > 0), devolve; se já
      // tinha GERADO cashback (cashbackEarned > 0), zera o que sobrou. Só se
      // `cashbackLocked` ainda for false (ver comentário abaixo).
      if (!order.cashbackLocked) {
        await this.cashbackService.reverseConsumptionForOrder(manager, order.tenantId, order.id);
        await this.cashbackService.reverseCreditForOrder(manager, order.tenantId, order.id);
      }
      // Promoções em ordem fixa (ids ordenados).
      for (const promotionId of [...promotionIds].sort()) {
        await this.promotionsService.releaseRedemption(manager, promotionId);
      }
      return true;
    });
    if (!claimed) {
      // Outro caminho já cancelou e cuidou das devoluções. Só alinha a cópia em
      // memória para o save() do chamador não regredir o estado.
      const fresh = await this.orderRepo.findOne({ where: { id: order.id, tenantId: order.tenantId } });
      if (fresh?.status === 'cancelado') {
        order.status = fresh.status;
        order.cancelReason = fresh.cancelReason;
        order.canceledAt = fresh.canceledAt;
        order.canceledByUserId = fresh.canceledByUserId;
      } else if (fresh && opts?.onlyIfAwaitingPayment) {
        // Perdeu a corrida para o pagamento: alinha a cópia em memória à verdade do banco
        // (senão um save() do chamador regrediria o pedido pago).
        order.status = fresh.status;
        order.paymentStatus = fresh.paymentStatus;
      }
      return false;
    }
    order.status = 'cancelado';
    order.cancelReason = cancelReason;
    order.canceledAt = canceledAt;
    order.canceledByUserId = canceledByUserId ?? null;
    // Mesma centralização vale pra cashback: se esse pedido tinha usado
    // saldo (cashbackUsed > 0), devolve; se já tinha GERADO cashback pro
    // cliente (cashbackEarned > 0, ou seja, foi cancelado depois de já
    // pago), zera o que sobrou desse crédito. As duas chamadas são
    // idempotentes e seguras mesmo que nenhuma das duas se aplique.
    //
    // MAS: só faz isso se `cashbackLocked` ainda for false. Uma vez que
    // o pagamento foi confirmado (ou a mesa fechou), cashbackLocked vira
    // true nos mesmos 4 pontos que creditam cashback — a partir daí, o
    // cliente já recebeu o produto de verdade, e cancelar o pedido
    // depois disso NUNCA deveria devolver saldo gasto nem tirar saldo
    // ganho (senão vira brecha de "recebe o produto e cancela depois
    // pra recuperar o cashback usado"). Cancelar ainda funciona
    // normalmente pra tudo o resto (status, liberar vaga de promoção) —
    // só o cashback fica intocado.
    // (devolução de cashback feita dentro da transação do claim, acima)
    // Estorno AUTOMÁTICO (Fase C): pedido pago online (Pix/cartão pelo Mercado
    // Pago) que é cancelado devolve o dinheiro ao cliente. Se o estorno falhar
    // (token revogado, MP fora do ar), fica `estorno_pendente` para o admin
    // resolver — nunca some em silêncio. O chamador salva o pedido em seguida.
    if (order.paymentStatus === 'pago' && order.mpPaymentId) {
      const refunded = await this.refundPaymentQuietly(
        order.tenantId,
        order.mpPaymentId,
        `pedido ${order.id} cancelado`,
      );
      order.paymentStatus = refunded ? 'estornado' : 'estorno_pendente';
    }
    return true;
  }

  // ÚNICO caminho de expiração de pedido online (polling do cliente, polling do painel e a varredura por
  // minuto). Expira SÓ se o pedido ainda aguarda pagamento (claim atômico) e, se ganhou, avisa o cliente:
  // pagamento confirmado antes => nada é cancelado e nenhum "Pix expirado" sai.
  private async expireOverdueOrder(order: Order): Promise<boolean> {
    const expired = await this.markCancelled(order, this.expiryReason(order), null, {
      onlyIfAwaitingPayment: true,
    });
    if (!expired) return false;
    order.paymentStatus = 'falhou';
    await this.orderRepo.update({ id: order.id, tenantId: order.tenantId }, { paymentStatus: 'falhou' });
    await this.cancelGatewayPaymentQuietly(order.tenantId, order.mpPaymentId);
    if (order.paymentMethod === 'pix') {
      void this.notifyPaymentExpired(order).catch((err) =>
        this.logger.warn(`Falha ao avisar Pix expirado do pedido ${order.id}: ${err}`),
      );
    }
    return true;
  }

  private async notifyPaymentExpired(order: Order): Promise<void> {
    if (!order.customerId) return;
    const tenant = await this.getTenantForNotify(order.tenantId);
    if (!tenant) return;
    await this.pushService.sendToCustomer(
      order.tenantId,
      order.customerId,
      buildPaymentExpiredPush({
        kind: 'order',
        url: `/${tenant.slug}/conta-cliente/pedidos/avulso/${order.id}`,
        groupTag: orderPaymentGroupTag(order.id),
        icon: tenant.logoUrl ?? undefined,
      }),
    );
  }

  // Varredura por minuto: antes a expiração só era percebida quando alguém consultava (app do cliente ou
  // painel aberto). Com o cliente no app do banco, ninguém consulta, e o aviso de "Pix expirado" não sairia.
  // Reaproveita checkPixStatus, que antes de expirar CONFERE o Mercado Pago (se pagou, confirma em vez de
  // expirar). Obs.: no plano grátis do Render o processo dorme sem requisições e o cron não roda.
  @Cron(CronExpression.EVERY_MINUTE)
  async sweepExpiredOnlineOrders(): Promise<void> {
    const overdue = await this.orderRepo.find({
      where: { status: 'aguardando_pagamento', pixExpiresAt: LessThan(new Date()) },
      select: { id: true, tenantId: true },
      take: 50,
    });
    for (const order of overdue) {
      try {
        await this.checkPixStatus(order.tenantId, order.id);
      } catch (err) {
        this.logger.warn(`Falha ao expirar o pedido ${order.id} na varredura: ${err}`);
      }
    }
  }

  // Estorno total no Mercado Pago, sem nunca lançar (devolve true se o
  // dinheiro foi devolvido). Idempotente: a chave de idempotência é fixa por
  // pagamento e, se a chamada falhar, confere se o pagamento já consta como
  // estornado (ex.: estornado antes no painel do MP) antes de desistir.
  private async refundPaymentQuietly(tenantId: string, mpPaymentId: string, context: string): Promise<boolean> {
    try {
      const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
      if (!tenant?.mercadoPagoAccessTokenEncrypted) {
        this.logger.error(`ESTORNO PENDENTE (${context}): restaurante sem access token do Mercado Pago.`);
        return false;
      }
      const accessToken = decryptSecret(tenant.mercadoPagoAccessTokenEncrypted);
      try {
        await this.mercadoPagoService.refundPayment(accessToken, mpPaymentId, refundIdempotencyKey(mpPaymentId));
        return true;
      } catch (refundErr) {
        const current = await this.mercadoPagoService.getPaymentStatus(accessToken, mpPaymentId);
        if (current.status === 'refunded') return true;
        throw refundErr;
      }
    } catch (err) {
      this.logger.error(`ESTORNO PENDENTE (${context}) do pagamento ${mpPaymentId}: ${err}`);
      return false;
    }
  }

  // Transição ATÔMICA aguardando_pagamento -> pendente/pago. Devolve true só
  // para UM concorrente (webhook, polling do cliente, polling do painel e o
  // botão do admin podem chegar juntos): quem ganha credita cashback e notifica;
  // quem perde não faz nada. É o mesmo padrão do fechamento de mesa.
  private async claimPaidTransition(orderId: string, tenantId: string): Promise<boolean> {
    const result = await this.orderRepo.update(
      { id: orderId, tenantId, status: 'aguardando_pagamento' },
      { status: 'pendente', paymentStatus: 'pago' },
    );
    return (result.affected ?? 0) === 1;
  }

  // Chamado nos 4 pontos onde um pedido vira "pago de verdade": aqui e
  // em applyMercadoPagoStatus/confirmPixPayment/concludeWithPayment (o
  // 4º ponto, TablesService.closeSession, credita direto por lá porque
  // ali quem "paga" é a SESSÃO inteira, não um pedido avulso). Base de
  // cálculo é sempre o valor dos ITENS já líquido de promoção E de
  // cashback usado — nunca inclui taxa de entrega, gorjeta, nem o
  // próprio cashback usado nesse pedido. Mesmo padrão que cartão de
  // crédito/Uber Cash usam: só o que saiu "do bolso" de verdade conta
  // como gasto elegível pra gerar mais cashback — pagar com saldo é
  // tratado como pagar com vale-presente, não gera cashback em cima de
  // cashback.
  // Convidado (sem customerId) nunca gera cashback — não tem carteira
  // pra creditar. Idempotente via o índice único do ledger
  // (CashbackService.credit trata recrédito da mesma origem como no-op).
  private async creditCashbackForPaidOrder(order: Order): Promise<void> {
    if (!order.customerId) return;
    // Trava definitiva ANTES de qualquer coisa: mesmo que esse pedido
    // não gere nenhum cashback (abaixo do mínimo, sem config ativa
    // etc), o pagamento já foi confirmado — a partir daqui, cancelar
    // não deve mais devolver o cashback USADO nesse pedido (ver
    // OrdersService.markCancelled).
    order.cashbackLocked = true;
    // `order.total` JÁ está líquido de promoção E de cashback usado
    // (os dois são subtraídos na criação do pedido — ver create()).
    // Então basta tirar a taxa de entrega pra chegar na base elegível;
    // NUNCA somar `cashbackUsed` de volta aqui (isso era o bug: somar
    // de volta reincluía na base o valor que o cliente pagou com
    // cashback, gerando cashback em cima de cashback).
    const eligibleCents = toCents(order.total) - toCents(order.deliveryFee);
    if (eligibleCents <= 0) return;
    const result = await this.cashbackService.credit(
      this.orderRepo.manager,
      order.tenantId,
      order.customerId,
      order.locationId,
      eligibleCents,
      'order',
      order.id,
    );
    if (result.creditedCents > 0) {
      order.cashbackEarned = fromCents(result.creditedCents);
      await this.notifyCashbackEarned(order, result.creditedCents);
    }
  }

  // Busca só o que as notificações abaixo precisam (slug + logo) —
  // repetido em vários pontos de notificação, centralizado aqui pra não
  // divergir a query em cada um.
  private async getTenantForNotify(tenantId: string): Promise<{ slug: string; logoUrl: string | null } | null> {
    return this.orderRepo.manager
      .getRepository(Tenant)
      .findOne({ where: { id: tenantId }, select: { slug: true, logoUrl: true } });
  }

  // Empurra o prompt "avalie seu pedido" só quando o pedido REALMENTE
  // terminou — status vira 'entregue' (chamado de updateStatus() lá
  // embaixo), nunca no momento do pagamento. São coisas diferentes:
  // pagamento confirmado só significa que o dinheiro entrou, o pedido
  // pode ainda estar sendo preparado. Isso já bateu como bug real:
  // pedido de balcão paga primeiro, então o push de avaliação estava
  // dessa forma disparando ainda com status 'preparando' — exatamente o
  // padrão do iFood (avaliação só libera depois que o pedido é marcado
  // como entregue/finalizado, nunca no pagamento).
  //
  // "Melhor esforço": nunca lança erro (PushService já engole falhas de
  // envio internamente), então nunca atrapalha a mudança de status se o
  // envio falhar.
  private async notifyReviewPrompt(order: Order): Promise<void> {
    if (!order.customerId) return;
    const tenant = await this.getTenantForNotify(order.tenantId);
    if (!tenant) return;
    // `?avaliar=<id>` é o que faz o modal de avaliação aparecer — ver
    // ReviewPromptProvider no frontend. Só essa notificação carrega
    // esse parâmetro; qualquer outra URL de notificação nunca dispara
    // o modal, mesmo que exista um pedido elegível por aí. Antes disso,
    // o modal reaparecia em QUALQUER navegação enquanto existisse
    // pedido elegível — clicar em qualquer outra notificação (ex:
    // "pagamento confirmado") acabava mostrando o modal de avaliação
    // de um pedido completamente diferente, sem relação com o que foi
    // clicado.
    await this.pushService.sendToCustomer(order.tenantId, order.customerId, {
      title: 'Como foi seu pedido?',
      body: 'Sua opinião ajuda outros clientes e o restaurante a melhorar. Toque pra avaliar.',
      i18n: { key: 'review_prompt' },
      url: `/${tenant.slug}/conta-cliente/pedidos/avulso/${order.id}?avaliar=${order.id}`,
      tag: 'review_prompt',
      icon: tenant.logoUrl ?? undefined,
    });
  }

  // Chamado junto de notifyReviewPrompt, nos mesmos 3 pontos de
  // "pagamento confirmado" (confirmPixPayment, applyMercadoPagoStatus,
  // concludeWithPayment) — Pix e Mercado Pago já são pagamentos que o
  // cliente fez fora de mãos, então a confirmação é a única
  // visibilidade real que ele tem de que o dinheiro realmente saiu. O
  // clique leva direto pro cupom do pedido (mesma URL de
  // notifyReviewPrompt).
  private async notifyPaymentCompleted(order: Order): Promise<void> {
    if (!order.customerId) return;
    const tenant = await this.getTenantForNotify(order.tenantId);
    if (!tenant) return;
    // Valor realmente cobrado: total + gorjeta (o mesmo que o Pix cobrou), não só o total.
    const paidCents = chargeCents(toCents(Number(order.total)), toCents(Number(order.tipAmount ?? 0)));
    const amount = `R$ ${(paidCents / 100).toFixed(2).replace('.', ',')}`;
    await this.pushService.sendToCustomer(order.tenantId, order.customerId, {
      title: 'Pagamento confirmado',
      body: `Recebemos o pagamento de ${amount} do seu pedido.`,
      i18n: {
        key: 'payment_confirmed_order',
        params: { amount },
      },
      url: `/${tenant.slug}/conta-cliente/pedidos/avulso/${order.id}`,
      tag: 'payment_completed',
      // MESMO groupTag do push de "aguardando pagamento" (notifyPaymentPending): este SUBSTITUI aquele.
      groupTag: orderPaymentGroupTag(order.id),
      ...PAYMENT_CONFIRMED_FLAGS,
      icon: tenant.logoUrl ?? undefined,
    });
  }

  // Push "Aguardando pagamento · Pague até HH:MM", enviado pelo SERVIDOR ao criar o pedido Pix
  // (funciona com o app fechado, ao contrário da antiga notificação local com contagem, que o
  // navegador congelava em segundo plano). Horário-limite FIXO: a contagem regressiva em tempo
  // real continua dentro do app (PixWaitingPanel). Quando o pagamento é confirmado,
  // notifyPaymentCompleted usa o mesmo groupTag e substitui esta notificação.
  //
  // NOTA PARA O APP NATIVO (pedido explícito do Felipe): quando o app nativo estiver pronto, ele quer
  // o COUNTDOWN em tempo real no próprio push (como o iFood). Em PWA isso é impossível com o app
  // fechado: a notificação web não se atualiza sozinha. Por isso hoje o push traz o horário-limite
  // fixo e a contagem fica dentro do app.
  private async notifyPaymentPending(order: Order): Promise<void> {
    if (!order.customerId || !order.pixExpiresAt) return;
    const tenant = await this.getTenantForNotify(order.tenantId);
    if (!tenant) return;
    await this.pushService.sendToCustomer(
      order.tenantId,
      order.customerId,
      buildPaymentPendingPush({
        kind: 'order',
        amountCents: chargeCents(toCents(Number(order.total)), toCents(Number(order.tipAmount ?? 0))),
        expiresAt: order.pixExpiresAt,
        url: `/${tenant.slug}/conta-cliente/pedidos/avulso/${order.id}`,
        groupTag: orderPaymentGroupTag(order.id),
        icon: tenant.logoUrl ?? undefined,
      }),
    );
  }

  // Chamado de dentro de creditCashbackForPaidOrder, só quando algo foi
  // realmente creditado (CashbackService.credit pode devolver 0 — sem
  // config ativa, abaixo do teto etc). `creditedCents` vem de lá pra
  // nunca divergir do valor de verdade creditado no ledger.
  private async notifyCashbackEarned(order: Order, creditedCents: number): Promise<void> {
    if (!order.customerId) return;
    const tenant = await this.getTenantForNotify(order.tenantId);
    if (!tenant) return;
    const amount = fromCents(creditedCents).toFixed(2).replace('.', ',');
    await this.pushService.sendToCustomer(order.tenantId, order.customerId, {
      title: 'Você ganhou cashback',
      body: `R$ ${amount} caíram na sua carteira desse restaurante. Toque pra ver o saldo.`,
      i18n: { key: 'cashback_earned', params: { amount: `R$ ${amount}` } },
      url: `/${tenant.slug}/conta-cliente/cashback`,
      tag: 'cashback',
      icon: tenant.logoUrl ?? undefined,
    });
  }

  // Progressão de status visível pro cliente (preparando/pronto/
  // entregue) — chamado de updateStatus() só nesses 3 status; os outros
  // (pendente, confirmado, cancelado) não geram notificação de
  // progresso. `groupTag` único por PEDIDO (não por categoria) — assim
  // "pronto" substitui "preparando" na tela pra ESSE pedido, sem
  // empilhar, e sem interferir na notificação de outro pedido em
  // andamento ao mesmo tempo (ver comentário de `groupTag` em
  // PushPayload).
  private async notifyOrderStatusChange(order: Order): Promise<void> {
    if (!order.customerId) return;
    const copy = this.orderStatusNotificationCopy(order.orderType, order.status);
    if (!copy) return;
    const tenant = await this.getTenantForNotify(order.tenantId);
    if (!tenant) return;
    // Mesa não tem cupom por pedido individual — só por sessão (a conta
    // inteira da mesa). Avulso (balcão/entrega) tem cupom próprio.
    const url =
      order.orderType === 'mesa' && order.tableSessionId
        ? `/${tenant.slug}/conta-cliente/pedidos/mesa/${order.tableSessionId}`
        : `/${tenant.slug}/conta-cliente/pedidos/avulso/${order.id}`;
    await this.pushService.sendToCustomer(order.tenantId, order.customerId, {
      title: copy.title,
      body: copy.body,
      i18n: { key: copy.key },
      url,
      tag: 'order_delivered',
      groupTag: `order-status-${order.id}`,
      icon: tenant.logoUrl ?? undefined,
    });
  }

  private orderStatusNotificationCopy(
    orderType: string,
    status: string,
  ): { key: PushMessageKey; title: string; body: string } | null {
    if (status === 'preparando') {
      return {
        key: 'order_preparing',
        title: 'Seu pedido está sendo preparado',
        body: 'A cozinha já começou a preparar seu pedido.',
      };
    }
    if (status === 'pronto') {
      if (orderType === 'entrega') {
        return {
          key: 'order_ready_delivery',
          title: 'Seu pedido está pronto',
          body: 'Já vai sair para entrega a qualquer momento.',
        };
      }
      if (orderType === 'mesa') {
        return {
          key: 'order_ready_table',
          title: 'Seu pedido está pronto',
          body: 'O garçom já está levando pra sua mesa.',
        };
      }
      return { key: 'order_ready_pickup', title: 'Seu pedido está pronto', body: 'Pode vir buscar no balcão.' };
    }
    if (status === 'entregue') {
      if (orderType === 'entrega') {
        return {
          key: 'order_done_delivery',
          title: 'Seu pedido foi entregue',
          body: 'Bom apetite! Toque para ver o cupom.',
        };
      }
      if (orderType === 'mesa') {
        return { key: 'order_done_table', title: 'Pedido servido', body: 'Bom apetite! Toque para ver o cupom.' };
      }
      return { key: 'order_done_pickup', title: 'Pedido retirado', body: 'Bom apetite! Toque para ver o cupom.' };
    }
    return null;
  }

  // `customer: true` traz avatar/nome de quem fez o pedido, SE ele
  // estava logado — visível só aqui, pro admin DESSE restaurante (nunca
  // pra outro tenant, nem publicamente). Pedido de convidado (sem login)
  // simplesmente não tem customer nenhum vinculado.
  //
  // IMPORTANTE: `select` limita os campos do relacionamento aos
  // estritamente necessários pra exibir no painel — sem isso, o
  // `passwordHash` do cliente (entidade inteira) vazaria pra dentro da
  // resposta JSON do admin. Nunca remover esse `select` sem substituir
  // por outra forma de excluir campos sensíveis.
  // Consulta única da listagem do painel. `ids` restringe a poucos pedidos
  // (usado só para processar Pix pendente/expirado) mantendo EXATAMENTE os
  // mesmos relations/select — inclusive o `select` do cliente, que impede o
  // `passwordHash` de vazar.
  private queryAdminOrders(tenantId: string, ids?: string[]): Promise<Order[]> {
    return this.orderRepo.find({
      where: ids ? { tenantId, id: In(ids) } : { tenantId },
      order: { createdAt: 'DESC' },
      relations: { items: true, customer: true },
      select: {
        customer: {
          id: true,
          name: true,
          avatarUrl: true,
          isVerified: true,
          tenantId: true,
          verificationDecidedAt: true,
          verificationReviewedByAdminId: true,
          verificationIntegritySignature: true,
        },
      },
    });
  }

  // Nunca confia no `isVerified` cru vindo do banco pro card do
  // admin — recalcula a prova de integridade (ver
  // verification-signature.ts) antes de expor. Ver mesmo raciocínio
  // em TablesService.findActiveOverview.
  //
  // BUG REAL CORRIGIDO (17/09): `avatarUrl` do cliente vem gravado no
  // banco como caminho RELATIVO (ex: "/uploads/avatars/xyz.jpg"),
  // servido pelo app do cliente (frontend-cardapio) — nunca pelo
  // painel admin. Sem resolver pra URL absoluta aqui, o navegador do
  // admin tentava carregar essa imagem contra o PRÓPRIO domínio do
  // admin (onde esse arquivo não existe) e mostrava um círculo cinza
  // vazio, sem foto nem inicial — só nos cards de Balcão/Entrega
  // (avulsos), porque o card de Mesa já resolvia isso corretamente
  // (`resolveAvatarUrl` em TablesService.findActiveOverview). Mesma
  // lógica replicada aqui: só mexe em caminho relativo (começa com
  // "/"); uma URL já absoluta (ex: login social) passa direto.
  private decorateAdminOrders(orders: Order[]): void {
    const customerAppUrl = (process.env.CUSTOMER_APP_URL ?? '').replace(/\/$/, '');
    for (const order of orders) {
      if (order.customer) {
        order.customer.isVerified = this.verificationService.verifyIntegritySync(order.customer);
        if (order.customer.avatarUrl?.startsWith('/')) {
          order.customer.avatarUrl = customerAppUrl
            ? `${customerAppUrl}${order.customer.avatarUrl}`
            : null;
        }
      }
    }
  }

  // Efeitos colaterais que a listagem do painel sempre teve (e que NÃO podem
  // depender de cache): confirma Pix pendente no Mercado Pago e expira pedido
  // cujo prazo estourou. Devolve true se algum pedido mudou.
  private async syncPendingAdminOrders(tenantId: string, orders: Order[]): Promise<boolean> {
    let changed = false;

    // Consulta o Mercado Pago pros pedidos ainda aguardando confirmação —
    // assim o painel do admin reflete "pagamento confirmado" sozinho, a
    // cada 5s, sem depender do cliente estar com a aba aberta nem do
    // webhook ter chegado (essencial em dev local; rede de segurança em
    // produção).
    const pendingMpOrders = orders.filter(
      (o) => o.status === 'aguardando_pagamento' && o.mpPaymentId && o.paymentStatus !== 'recusado',
    );
    if (pendingMpOrders.length > 0) {
      const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
      if (tenant?.mercadoPagoAccessTokenEncrypted) {
        const accessToken = decryptSecret(tenant.mercadoPagoAccessTokenEncrypted);
        const changedOrders: Order[] = [];
        for (const order of pendingMpOrders) {
          try {
            const { status } = await this.mercadoPagoService.getPaymentStatus(
              accessToken,
              order.mpPaymentId!,
            );
            await this.applyMercadoPagoStatus(order, status, order.mpPaymentId);
            if (order.status !== 'aguardando_pagamento') {
              changedOrders.push(order);
            }
          } catch {
            // Falha pontual — tenta de novo no próximo poll do painel.
          }
        }
        if (changedOrders.length > 0) {
          await this.orderRepo.save(changedOrders);
          changed = true;
        }
      }
    }

    // Expira sozinho aqui também (não só no polling do cliente) — se o
    // cliente fechar a aba antes do prazo acabar, ninguém mais chamaria
    // checkPixStatus, e o pedido ficaria "aguardando Pix" pra sempre na
    // visão do admin mesmo já tendo estourado o prazo. Assim, o próprio
    // polling do painel (a cada 5s) já resolve isso sozinho.
    const now = Date.now();
    const expiredOrders = orders.filter(
      (o) =>
        o.status === 'aguardando_pagamento' && o.pixExpiresAt && o.pixExpiresAt.getTime() < now,
    );
    if (expiredOrders.length > 0) {
      for (const order of expiredOrders) {
        if (await this.expireOverdueOrder(order)) changed = true;
      }
    }

    return changed;
  }

  // `customer: true` traz avatar/nome de quem fez o pedido, SE ele
  // estava logado — visível só aqui, pro admin DESSE restaurante (nunca
  // pra outro tenant, nem publicamente). Pedido de convidado (sem login)
  // simplesmente não tem customer nenhum vinculado.
  //
  // IMPORTANTE: o `select` em queryAdminOrders limita os campos do
  // relacionamento aos estritamente necessários pra exibir no painel — sem
  // isso, o `passwordHash` do cliente (entidade inteira) vazaria pra dentro
  // da resposta JSON do admin. Nunca remover esse `select` sem substituir
  // por outra forma de excluir campos sensíveis.
  //
  // Versão SEM cache (comportamento original). O painel usa findAllForAdminCached.
  async findAllForAdmin(tenantId: string): Promise<Order[]> {
    // Qualquer chamada aqui consulta o banco sem cache: conta como bypass.
    this.tenantCache?.recordBypass('admin-orders', 'orders');
    const orders = await this.queryAdminOrders(tenantId);
    this.decorateAdminOrders(orders);
    await this.syncPendingAdminOrders(tenantId, orders);
    return orders;
  }

  // Listagem do painel (polling de 5 s) com cache por restaurante. Enquanto
  // nenhum pedido mudou, não toca no Supabase além de UMA consulta de 1 linha
  // (contagem + max(updated_at)), no máximo a cada 2 s. O valor devolvido é
  // compartilhado: serializar, nunca mutar. `etag` serve a revalidação 304.
  async findAllForAdminCached(tenantId: string): Promise<{ orders: Order[]; etag: string | null }> {
    const cache = this.tenantCache;
    if (!cache) return { orders: await this.findAllForAdmin(tenantId), etag: null };

    const load = () =>
      cache.getOrLoad(
        tenantId,
        'orders',
        async () => {
          const orders = await this.queryAdminOrders(tenantId);
          this.decorateAdminOrders(orders);
          return orders;
        },
        {
          label: 'admin-orders',
          maxAgeMs: ADMIN_ORDERS_MAX_AGE_MS,
          fingerprintEveryMs: ADMIN_ORDERS_FINGERPRINT_EVERY_MS,
          fingerprint: () => this.ordersFingerprint(tenantId),
        },
      );

    let result = await load();

    // Efeitos colaterais continuam rodando a cada poll — mas só quando EXISTE
    // candidato (Pix pendente com cobrança no gateway, ou prazo vencido). Aí
    // recarrega só esses poucos pedidos (nunca o histórico inteiro), processa
    // com as entidades frescas e, se algo mudou, invalida e relê.
    const now = Date.now();
    const candidateIds = result.value
      .filter(
        (o) =>
          o.status === 'aguardando_pagamento' &&
          ((o.mpPaymentId && o.paymentStatus !== 'recusado') ||
            (o.pixExpiresAt && o.pixExpiresAt.getTime() < now)),
      )
      .map((o) => o.id);
    if (candidateIds.length > 0) {
      const fresh = await this.queryAdminOrders(tenantId, candidateIds);
      const changed = await this.syncPendingAdminOrders(tenantId, fresh);
      if (changed) {
        cache.invalidate(tenantId, ['orders', 'tables'], 'findAllForAdminCached.sync');
        result = await load();
      }
    }
    return { orders: result.value, etag: result.etag };
  }

  // Resumo barato do estado dos pedidos do restaurante: quantidade + último
  // updated_at (texto, com microssegundos). Pega qualquer escrita feita por
  // OUTRO caminho (outro módulo, SQL manual) que a invalidação explícita não viu.
  private async ordersFingerprint(tenantId: string): Promise<string> {
    const rows: Array<{ n: number; m: string }> = await this.orderRepo.query(
      `SELECT COUNT(*)::int AS n, COALESCE(MAX(updated_at)::text, '') AS m
         FROM orders WHERE tenant_id = $1 AND deleted_at IS NULL`,
      [tenantId],
    );
    return `${rows[0]?.n ?? 0}|${rows[0]?.m ?? ''}`;
  }

  async findOne(tenantId: string, id: string): Promise<Order> {
    const order = await this.orderRepo.findOne({ where: { id, tenantId } });
    if (!order) {
      throw new NotFoundException('Pedido não encontrado.');
    }
    return order;
  }

  // "Cancelar pedido" do lado do cliente — só pra ENTREGA (onde ainda
  // faz sentido: o cliente pode desistir antes de o entregador sair, e
  // não tem "chamar garçom" equivalente). Mesa e BALCÃO nunca podem ser
  // autocancelados: o status "pendente" só reflete se a COZINHA já
  // atualizou o painel, não se o prato já foi entregue/retirado e
  // comido — um cliente mal-intencionado poderia pedir, comer/retirar,
  // e cancelar sozinho antes do estabelecimento perceber, escapando de
  // pagar. Nesses dois casos, a ação do cliente é sempre "chamar
  // atendente/garçom" (ver botões correspondentes no lugar disso).
  @InvalidatesTenantCache(['orders', 'tables'])
  async cancelByCustomer(tenantId: string, id: string): Promise<Order> {
    const order = await this.findOne(tenantId, id);
    if (order.orderType === 'mesa' || order.orderType === 'balcao') {
      throw new BadRequestException(
        order.orderType === 'mesa'
          ? 'Pedidos de mesa não podem ser cancelados pelo cliente — chame o garçom.'
          : 'Pedidos de balcão não podem ser cancelados pelo cliente — chame o atendente.',
      );
    }
    if (order.status !== 'aguardando_pagamento' && order.status !== 'pendente') {
      throw new BadRequestException(
        'Esse pedido já está sendo preparado e não pode mais ser cancelado por aqui — fale com o estabelecimento.',
      );
    }
    await this.markCancelled(order, 'Cancelado pelo cliente');
    if (order.paymentStatus === 'pendente') {
      order.paymentStatus = 'falhou';
    }
    return this.orderRepo.save(order);
  }

  // Pedido de balcão não tem "chamar garçom" (não há mesa/sessão) — só
  // acende o mesmo destaque de atenção que o painel já usa. Idempotente
  // (chamar de novo não faz nada demais).
  @InvalidatesTenantCache(['orders', 'tables'])
  async flagForAttention(tenantId: string, id: string): Promise<Order> {
    const order = await this.findOne(tenantId, id);
    order.flagged = true;
    return this.orderRepo.save(order);
  }

  // Cria o pedido inteiro em UMA transação: ou tudo é salvo, ou nada é.
  // O preço de cada item vem sempre do banco (nunca do que o cliente mandou),
  // pra impedir que alguém manipule o preço direto na requisição.
  @InvalidatesTenantCache(['orders', 'tables'])
  async create(
    tenantId: string,
    dto: CreateOrderDto,
    customerId: string | null = null,
    seatToken: string | null = null,
  ): Promise<Order> {
    // Pedido de visitante (sem conta): o nome é obrigatório e segue a
    // regra de sempre (4–16, começa com letra, sem especiais; com 4
    // caracteres só letras). O app valida igual — aqui é quem manda.
    if (!customerId) {
      const nameError = validateGuestName(dto.customerName);
      if (nameError) throw new BadRequestException(nameError);
    }
    // A geocodificação roda ANTES de abrir a transação de propósito: é uma
    // chamada de rede externa (LocationIQ, até ~8s) e nunca deve segurar uma
    // transação de banco aberta enquanto espera resposta de fora. O valor
    // da taxa é sempre recalculado aqui do zero a partir do endereço bruto
    // — nunca confiamos num valor de taxa/distância vindo do cliente,
    // mesmo que ele tenha visto uma cotação antes (endpoint público
    // `/delivery/quote`); essa cotação é só uma prévia, não é autoridade.
    let deliveryQuote: DeliveryQuoteWithCoordinates | null = null;
    // SIOD: rota estimada (OSRM -> Haversine). Tambem fora da transacao (rede).
    let siodRoute: RouteResult | null = null;
    if (dto.orderType === 'entrega') {
      if (!dto.deliveryStreet || !dto.deliveryCity || !dto.deliveryState) {
        throw new BadRequestException('Endereço de entrega incompleto.');
      }
      if (!dto.locationId) {
        throw new BadRequestException('Informe a loja (locationId) pra calcular a entrega.');
      }
      deliveryQuote = await this.deliveryService.calculateQuote(dto.locationId, {
        street: dto.deliveryStreet,
        addressNumber: dto.deliveryAddressNumber,
        neighborhood: dto.deliveryNeighborhood,
        city: dto.deliveryCity,
        state: dto.deliveryState,
        postcode: dto.deliveryPostcode,
      });
      // Nunca lanca (fallback interno): o checkout nao depende do mapa.
      siodRoute = await this.siodEngine.resolveRoute(deliveryQuote.origin, deliveryQuote.destination);
    }

    // E-mail do cliente logado (se houver) — usado como payer.email na
    // criação do pagamento Pix via Mercado Pago. Em ambiente de TESTE, o
    // Mercado Pago só aceita como comprador um e-mail de uma conta de
    // teste "Comprador" de verdade (ou dá "Unauthorized use of live
    // credentials" / "uma das partes é de teste"); em produção, qualquer
    // e-mail de cliente real funciona normalmente.
    const customerEmail = customerId
      ? (await this.customerRepo.findOne({ where: { id: customerId } }))?.email
      : null;

    const created = await this.dataSource.transaction(async (manager) => {
      const tenant = await manager.findOne(Tenant, { where: { id: tenantId } });
      if (!tenant) {
        throw new NotFoundException('Estabelecimento não encontrado.');
      }

      if (dto.orderType !== 'mesa' && !dto.locationId) {
        throw new BadRequestException('Informe a loja (locationId) pra pedidos de balcão/entrega.');
      }

      if (!dto.items || dto.items.length === 0) {
        throw new BadRequestException('O pedido precisa ter pelo menos um item.');
      }

      let totalCents = 0;
      const orderItems: OrderItem[] = [];
      const cartLines: CartLine[] = [];

      for (const itemDto of dto.items) {
        const product = await manager.findOne(Product, {
          where: { id: itemDto.productId, tenantId, isAvailable: true },
          relations: { options: { values: true } },
        });
        if (!product) {
          throw new BadRequestException(
            `Produto ${itemDto.productId} não encontrado ou indisponível.`,
          );
        }

        // Cada valor escolhido (ex: "Grande", "Bacon") precisa pertencer
        // a um grupo DESSE produto — nunca aceitamos um id de opção de
        // outro produto/tenant. O preço de cada opção vem sempre do
        // banco (nunca do que o cliente mandou), igual já fazemos com o
        // preço do produto em si.
        const selectedValueIds = new Set(itemDto.selectedValueIds ?? []);
        const chosenSnapshot: { groupName: string; label: string; priceDelta: number }[] = [];
        let optionsPriceDeltaCents = 0;

        for (const group of product.options ?? []) {
          const chosenInGroup = group.values.filter((v) => selectedValueIds.has(v.id));

          if (chosenInGroup.length < group.minSelect) {
            throw new BadRequestException(
              group.minSelect === 1
                ? `Escolha uma opção em "${group.name}" pro produto ${product.name}.`
                : `Escolha pelo menos ${group.minSelect} opções em "${group.name}" pro produto ${product.name}.`,
            );
          }
          if (chosenInGroup.length > group.maxSelect) {
            throw new BadRequestException(
              `No máximo ${group.maxSelect} opções em "${group.name}" pro produto ${product.name}.`,
            );
          }

          for (const value of chosenInGroup) {
            optionsPriceDeltaCents += toCents(value.priceDelta);
            chosenSnapshot.push({
              groupName: group.name,
              label: value.label,
              priceDelta: value.priceDelta,
            });
          }
        }

        // Confere que todo id enviado realmente correspondeu a alguma
        // opção válida desse produto — sobrando algum, é um id de outro
        // produto/inventado, e o pedido é recusado.
        const validValueIds = new Set(
          (product.options ?? []).flatMap((g) => g.values.map((v) => v.id)),
        );
        for (const id of selectedValueIds) {
          if (!validValueIds.has(id)) {
            throw new BadRequestException(
              `Uma das opções escolhidas não pertence ao produto ${product.name}.`,
            );
          }
        }

        const baseUnitPriceCents = toCents(product.promoPrice ?? product.price);
        const unitPriceCents = baseUnitPriceCents + optionsPriceDeltaCents;
        const unitPrice = fromCents(unitPriceCents);
        const subtotalCents = unitPriceCents * itemDto.quantity;
        totalCents += subtotalCents;

        const orderItem = manager.create(OrderItem, {
          productId: product.id,
          productName: product.name, // snapshot: nome não muda se o produto for editado depois
          quantity: itemDto.quantity,
          unitPrice,
          unitCost: product.costPrice ?? null,
          selectedOptions: chosenSnapshot.length > 0 ? chosenSnapshot : null,
          subtotal: fromCents(subtotalCents),
        });
        orderItems.push(orderItem);
        cartLines.push({
          productId: product.id,
          categoryId: product.categoryId,
          quantity: itemDto.quantity,
          unitPriceCents,
          subtotalCents,
        });
      }

      const itemsSubtotalCents = totalCents;

      // Resolve o número da mesa a partir da sessão, em vez de confiar no
      // que o frontend mandou — assim o painel admin sempre mostra a mesa
      // certa mesmo que o cliente não informe nada, e evita inconsistência
      // entre o que está gravado na sessão e o que aparece no pedido.
      // `tableSessionId` só faz sentido junto de orderType === 'mesa' — um
      // pedido de balcão/entrega feito por alguém que estava numa mesa
      // não deve ficar vinculado a ela (senão o painel/histórico agrupam
      // errado, como se fosse um pedido da mesa). Ignora silenciosamente
      // qualquer tableSessionId mandado junto de outro orderType, em vez
      // de confiar cegamente no que o frontend decidiu mandar.
      const trustedTableSessionId = dto.orderType === 'mesa' ? dto.tableSessionId : undefined;

      if (dto.orderType === 'mesa' && !trustedTableSessionId) {
        throw new BadRequestException('Pedido do tipo mesa precisa de uma sessão de mesa válida.');
      }

      let resolvedTableNumber = dto.tableNumber ?? null;
      let resolvedLocationId: string | null = dto.orderType !== 'mesa' ? dto.locationId! : null;
      let resolvedSeatId: string | null = null;
      if (trustedTableSessionId) {
        // Trava (compartilhada) a linha da sessão até o fim desta
        // transação: "sair da mesa" (TablesService.leaveTable) trava a
        // MESMA linha como escrita. Assim, pedido e saída nunca se
        // cruzam: ou a saída vê este pedido e recusa, ou este pedido vê
        // o assento já morto e é recusado — sem brecha de corrida.
        await manager
          .createQueryBuilder(TableSession, 'lockedSession')
          .setLock('pessimistic_read')
          .where('lockedSession.id = :id', { id: trustedTableSessionId })
          .getOne();
        const session = await manager.findOne(TableSession, {
          where: { id: trustedTableSessionId, tenantId },
          relations: { table: true },
        });
        if (!session) {
          throw new NotFoundException('Sessão de mesa não encontrada.');
        }
        // Sessão já fechada (conta paga) nunca aceita pedido novo — nesse
        // ponto o cliente precisa escanear o QR de novo pra abrir uma
        // sessão nova de fato.
        if (session.status === 'fechada') {
          throw new BadRequestException(
            'Esta conta já foi encerrada. Escaneie o QR code novamente para abrir uma nova.',
          );
        }
        // Assento morto (quem saiu da mesa) NUNCA faz pedido — mesmo que
        // o navegador ainda guarde o id da sessão (decisão final de
        // 30/09: sessão encerrada é definitiva).
        resolvedSeatId = (await this.resolveActiveSeat(manager, session.id, seatToken, customerId)).id;
        resolvedTableNumber = session.table.number;
        // A mesa já pertence a uma loja física específica — é assim que o
        // fluxo de QR code resolve automaticamente em qual filial o
        // cliente está, sem precisar perguntar nada (ver Location).
        resolvedLocationId = session.table.locationId;

        // SEGURANÇA — nunca deixa o mesmo cliente logado ter pedido em
        // DUAS mesas ativas ao mesmo tempo nesse restaurante. Sem isso,
        // dava pra "pular de mesa": pedir numa mesa, escanear o QR de
        // outra antes de pagar a primeira, pedir de novo, e ir
        // empurrando a conta antiga pra trás indefinidamente — ninguém
        // seria impedido de fechar SEM pagar a mesa anterior, porque ela
        // simplesmente ficaria esquecida, aberta, sem ligação nenhuma
        // com o que o cliente está fazendo agora. Isso fecha essa
        // brecha: pedido novo numa mesa diferente é recusado enquanto
        // existir pedido desse MESMO cliente numa sessão ainda ativa
        // (aberta ou com fechamento solicitado) em outra mesa.
        if (customerId) {
          const otherActiveOrder = await manager
            .createQueryBuilder(Order, 'order')
            .innerJoin(TableSession, 'otherSession', 'otherSession.id = order.table_session_id')
            .where('order.tenant_id = :tenantId', { tenantId })
            .andWhere('order.customer_id = :customerId', { customerId })
            .andWhere('otherSession.id != :currentSessionId', {
              currentSessionId: trustedTableSessionId,
            })
            .andWhere('otherSession.status IN (:...openStatuses)', {
              openStatuses: ['aberta', 'fechamento_solicitado'],
            })
            .getOne();
          if (otherActiveOrder) {
            throw new BadRequestException(
              'Você já tem uma conta em aberto em outra mesa. Feche e pague essa conta antes de pedir em uma mesa diferente.',
            );
          }
        }

        // Se o cliente já tinha solicitado fechamento e pediu mais alguma
        // coisa antes do garçom vir, a solicitação anterior fica obsoleta:
        // volta pra "aberta" pra não passar despercebido no painel do
        // garçom (evita a conta ser fechada faltando esse pedido novo).
        if (session.status === 'fechamento_solicitado') {
          await manager.update(TableSession, session.id, { status: 'aberta' });
        }
      }

      // Pedido de ENTREGA feito por um cliente que, nesse exato momento,
      // também tem uma sessão de mesa ativa aberta por ele nesse mesmo
      // restaurante — pedido do Felipe: não é bloqueado (pode ser
      // intencional, ex: pedir entrega pra alguém de casa enquanto está
      // Pedido do Felipe (17/09): virou bloqueio de verdade, não só
      // aviso — "não deveria nem ter sido possível fazer pedido pelo
      // balcão/cardápio geral com uma sessão em aberto". Cobre os dois
      // tipos de pedido fora do fluxo de mesa (balcão e entrega) e
      // tanto quem ABRIU a mesa quanto quem só ENTROU como participante
      // (ver TableSessionParticipant) — mesmo raciocínio do bloqueio
      // "anti pular de mesa" em TablesService.openOrJoinSession, só que
      // do lado do pedido avulso em vez do lado de abrir mesa nova.
      // Continua só verificando quando tem CONTA (convidado não dá pra
      // saber se é "a mesma pessoa" sem login).
      if ((dto.orderType === 'entrega' || dto.orderType === 'balcao') && customerId) {
        const activeTableSession = await manager.findOne(TableSession, {
          where: [
            { tenantId, openedByCustomerId: customerId, status: 'aberta' },
            { tenantId, openedByCustomerId: customerId, status: 'fechamento_solicitado' },
          ],
          relations: { table: true },
        });
        const activeAsParticipant = activeTableSession
          ? null
          : await manager
              .createQueryBuilder(TableSessionParticipant, 'p')
              .innerJoinAndSelect('p.tableSession', 'ts')
              .innerJoinAndSelect('ts.table', 't')
              .where('ts.tenant_id = :tenantId', { tenantId })
              .andWhere('p.customer_id = :customerId', { customerId })
              .andWhere('p.left_at IS NULL')
              .andWhere('ts.status IN (:...openStatuses)', {
                openStatuses: ['aberta', 'fechamento_solicitado'],
              })
              .getOne();
        const openTable = activeTableSession?.table ?? activeAsParticipant?.tableSession.table;
        if (openTable) {
          const label = dto.orderType === 'entrega' ? 'uma entrega' : 'um pedido de balcão';
          throw new ConflictException(
            `Você tem ${openTable.number} em aberto. Faça esse pedido por ela, ou peça pro garçom fechar a conta antes de fazer ${label}.`,
          );
        }
      }
      let placedWhileAtTable: string | null = null;

      const location = resolvedLocationId
        ? await manager.findOne(Location, { where: { id: resolvedLocationId, tenantId } })
        : null;
      if (!location) {
        throw new NotFoundException('Loja não encontrada.');
      }
      if (!computeIsOpenNow(location.isOpen, location.openingHours, location.scheduleOpenState)) {
        throw new BadRequestException('Esta loja não está aceitando pedidos no momento.');
      }

      // Promoções "de verdade" — o CLIENTE escolheu essas promoções no
      // carrinho (nunca aplicadas sozinhas, e pode ter mais de uma — ex:
      // um cupom pro burger + outro pra coca-cola). Ainda assim, tudo é
      // revalidado aqui a partir do carrinho real (produto + categoria +
      // valor de cada linha, tudo vindo do banco, nunca do cliente) —
      // ver PromotionsService.validateSelectedPromotions. Roda só DEPOIS
      // de resolvedLocationId estar definitivo (inclusive pra mesa, que
      // resolve a loja pela sessão) porque a promoção pode ser restrita
      // a lojas específicas. Se o cliente não escolheu nenhuma,
      // `dto.promotionIds` é undefined/vazio e o desconto fica zerado
      // sem erro. Aplica ANTES da taxa de entrega, já que "pedido
      // mínimo" sempre se refere ao valor dos itens, não ao total com
      // entrega.
      const appliedDiscounts = await this.promotionsService.validateSelectedPromotions(
        manager,
        tenantId,
        customerId,
        dto.promotionIds,
        itemsSubtotalCents,
        cartLines,
        resolvedLocationId,
      );
      const totalDiscountCents = appliedDiscounts.reduce((sum, d) => sum + d.discountCents, 0);
      if (totalDiscountCents > 0) {
        totalCents -= totalDiscountCents;
      }

      if (deliveryQuote) {
        totalCents += toCents(deliveryQuote.fee);
      }

      // Cashback usado (opt-in do cliente) — abate do total só DEPOIS de
      // promoção e taxa de entrega (reflete "quanto falta pagar agora",
      // mesmo princípio do Uber Cash), e ANTES do payload Pix ser
      // montado, senão o QR cobraria o valor errado. Nesse ponto é só
      // uma ESTIMATIVA de saldo pra já fixar o total certo do pedido; o
      // consumo de verdade (com lock, FIFO por expiração) só acontece
      // mais abaixo, depois que savedOrder.id existe. Se por alguma
      // corrida o saldo real disponível na hora H for menor que essa
      // estimativa (outro pedido do mesmo cliente terminando entre esse
      // instante e o consumo real), a transação inteira é revertida e o
      // cliente só precisa tentar de novo — nunca cobramos um valor que
      // não bate com o que foi realmente debitado da carteira.
      let cashbackUsedCents = 0;
      // REGRA (30/09): cashback é exclusivo de quem tem conta. Convidado
      // não tem nenhum acesso — recusa em vez de ignorar em silêncio.
      if (dto.useCashback && !customerId) {
        throw new BadRequestException(
          'Faça login ou crie uma conta para usufruir dos benefícios do cashback.',
        );
      }
      if (dto.useCashback && customerId) {
        const availableCents = toCents(
          await this.cashbackService.getBalance(tenantId, customerId, manager),
        );
        cashbackUsedCents = Math.min(availableCents, totalCents);
        if (cashbackUsedCents > 0) {
          totalCents -= cashbackUsedCents;
        }
      }

      // Pix "de verdade" — duas variantes possíveis, e o Mercado Pago tem
      // prioridade quando configurado:
      //   1) Mercado Pago: pagamento confirmado automaticamente (webhook +
      //      consulta direta à API) — igual iFood.
      //   2) QR estático: confirmação manual do admin no painel (sem
      //      gateway nenhum, só a chave Pix do estabelecimento).
      // Sem nenhum dos dois configurados, cai no comportamento de sempre:
      // Pix é só a intenção informada pelo cliente, combinado em pessoa.
      const tipCentsForPix =
        dto.orderType !== 'mesa' ? toCents(dto.tipAmount ?? 0) : 0;
      const isPixOrder = dto.orderType !== 'mesa' && dto.paymentMethod === 'pix';
      const isCardOrder = dto.orderType !== 'mesa' && dto.paymentMethod === 'cartao';
      // Valor a cobrar online, em CENTAVOS inteiros: total (já líquido de
      // promoção, taxa e cashback) + gorjeta. Nada de somar decimais.
      const onlineChargeCents = chargeCents(totalCents, tipCentsForPix);
      const mpPresence = {
        hasAccessToken: Boolean(tenant.mercadoPagoAccessTokenEncrypted),
        hasWebhookSecret: Boolean(tenant.mercadoPagoWebhookSecretEncrypted),
        hasPublicKey: Boolean(tenant.mercadoPagoPublicKey),
      };
      // Online só liga com token E segredo do webhook (e chave pública no
      // cartão), e só quando há valor a cobrar (total 0 = pago com cashback).
      const usesMercadoPago = isPixOrder && isPixOnlineActive(mpPresence) && onlineChargeCents > 0;
      const usesCardCheckout = isCardOrder && isCardOnlineActive(mpPresence) && onlineChargeCents > 0;
      const usesStaticPixQR =
        isPixOrder && !usesMercadoPago && !isPixOnlineActive(mpPresence) && tenant.pixEnabled && Boolean(tenant.pixKey);
      const usesRealPixCheckout = usesMercadoPago || usesStaticPixQR;
      const awaitsOnlinePayment = usesRealPixCheckout || usesCardCheckout;

      const order = manager.create(Order, {
        tenantId,
        tableSessionId: trustedTableSessionId ?? null,
        tableParticipantId: resolvedSeatId,
        locationId: resolvedLocationId,
        customerId,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        tableNumber: resolvedTableNumber,
        orderType: dto.orderType,
        placedWhileAtTable,
        notes: dto.notes,
        total: fromCents(totalCents),
        discountAmount: fromCents(totalDiscountCents),
        promotionId: appliedDiscounts[0]?.promotionId ?? null,
        promotionIds: appliedDiscounts.length > 0 ? appliedDiscounts.map((d) => d.promotionId) : null,
        promotionTitleSnapshot: appliedDiscounts[0]?.title ?? null,
        promotionTitlesSnapshot: appliedDiscounts.length > 0 ? appliedDiscounts.map((d) => d.title) : null,
        deliveryFee: deliveryQuote ? deliveryQuote.fee : 0,
        deliveryAddress: deliveryQuote ? deliveryQuote.formattedAddress : null,
        deliveryReferencePoint: dto.orderType === 'entrega' ? dto.deliveryReferencePoint ?? null : null,
        deliveryDistanceKm: deliveryQuote ? deliveryQuote.distanceKm : null,
        deliveryAddressPrecise: deliveryQuote ? deliveryQuote.precise : null,
        cashbackUsed: fromCents(cashbackUsedCents),
        status: awaitsOnlinePayment ? 'aguardando_pagamento' : 'pendente',
        // Só guarda a intenção de pagamento do cliente pra mesa nunca —
        // lá quem define é o admin ao fechar a conta.
        paymentMethod: dto.orderType !== 'mesa' ? dto.paymentMethod ?? null : null,
        tipAmount: dto.orderType !== 'mesa' ? dto.tipAmount ?? 0 : 0,
        paymentStatus: 'pendente',
        // (a coluna se chama pix_expires_at por herança: vale para o prazo de
        // pagamento online de Pix E de cartão)
        pixExpiresAt: awaitsOnlinePayment
          ? new Date(Date.now() + (usesCardCheckout ? CARD_PAYMENT_WINDOW_MS : PIX_PAYMENT_WINDOW_MS))
          : null,
      });
      const savedOrder = await manager.save(order);

      // O payload do QR só pode ser montado DEPOIS de salvar (precisa do
      // id do pedido pra virar o txid/referência). Fica congelado com
      // esse valor pra sempre — o QR nunca muda de valor debaixo do
      // cliente mesmo que o pedido seja editado depois por algum motivo.
      if (usesMercadoPago) {
        // Sem API_PUBLIC_URL configurada (ex: rodando só em localhost),
        // não tem como o Mercado Pago alcançar um webhook nosso mesmo —
        // nesse caso simplesmente não mandamos notification_url nenhuma,
        // e a confirmação acontece só via polling (checkPixStatus /
        // findAllForAdmin, que já consultam a API deles diretamente).
        const publicUrl = process.env.API_PUBLIC_URL;
        const payment = await this.mercadoPagoService.createPixPayment({
          accessToken: decryptSecret(tenant.mercadoPagoAccessTokenEncrypted!),
          amountCents: onlineChargeCents,
          idempotencyKey: pixOrderIdempotencyKey(savedOrder.id),
          description: `Pedido ${tenant.name}`,
          payerEmail: customerEmail ?? `pedido-${savedOrder.id}@guest.cardapiosaas.com`,
          externalReference: savedOrder.id,
          expiresAt: savedOrder.pixExpiresAt!,
          notificationUrl: publicUrl
            ? `${publicUrl}/orders/public/${tenantId}/webhook/mercadopago`
            : undefined,
        });
        savedOrder.pixPayload = payment.qrCode;
        savedOrder.mpPaymentId = payment.id;
        await manager.save(savedOrder);
      } else if (usesStaticPixQR) {
        savedOrder.pixPayload = generatePixPayload({
          pixKey: tenant.pixKey!,
          merchantName: tenant.name,
          merchantCity: tenant.pixMerchantCity || location.address || 'BRASIL',
          amount: fromCents(onlineChargeCents),
          txId: buildPixTxId(savedOrder.id),
        });
        await manager.save(savedOrder);
      }

      for (const item of orderItems) {
        item.orderId = savedOrder.id;
      }
      await manager.save(OrderItem, orderItems);

      // SIOD (Camadas 1-2): congela a estimativa + o contexto do checkout. So
      // pedido de ENTREGA. Num savepoint e sem lancar - falha aqui nunca derruba o pedido.
      if (deliveryQuote && siodRoute) {
        await this.siodEngine.recordOrderEstimate(manager, {
          order: savedOrder,
          tenantSettings: tenant.siodSettings,
          route: siodRoute,
          origin: deliveryQuote.origin,
          destination: deliveryQuote.destination,
          itemsCount: orderItems.reduce((sum, item) => sum + item.quantity, 0),
          itemsValue: fromCents(orderItems.reduce((sum, item) => sum + toCents(item.subtotal), 0)),
        });
      }

      // Consumo de verdade do saldo de cashback — só agora que
      // savedOrder.id existe (CashbackConsumption tem FK pra orders).
      // Se o valor realmente debitado vier MENOR que a estimativa usada
      // pra fixar `total`/o QR do Pix (corrida rara com outro pedido
      // simultâneo do mesmo cliente), aborta a transação inteira: nunca
      // fica um pedido cobrando um valor que não bate com o que saiu da
      // carteira do cliente.
      if (cashbackUsedCents > 0) {
        const actuallyConsumedCents = await this.cashbackService.consume(
          manager,
          tenantId,
          customerId!,
          savedOrder.id,
          cashbackUsedCents,
        );
        if (actuallyConsumedCents < cashbackUsedCents) {
          throw new BadRequestException(
            'Seu saldo de cashback mudou nesse instante. Tente enviar o pedido novamente.',
          );
        }
      }

      if (appliedDiscounts.length > 0) {
        // Ordem fixa por id (auditoria P-17): [A,B] e [B,A] concorrentes travavam as
        // linhas das promoções em ordem oposta e davam deadlock (40P01).
        for (const promotionId of [...new Set(appliedDiscounts.map((d) => d.promotionId))].sort()) {
          await this.promotionsService.recordRedemption(manager, promotionId);
        }
        await this.promotionsService.recordPerPromoDiscounts(
          manager,
          tenantId,
          savedOrder.id,
          appliedDiscounts,
        );
      }

      return savedOrder;
    });

    // Push "Pague até HH:MM" só DEPOIS do commit: com o Pix criado dentro da transação (P-15),
    // um rollback deixaria o cliente com um aviso de pagamento de um pedido que não existe.
    // Segundo plano de propósito (não atrasa a resposta com o QR); falha nunca derruba o pedido.
    if (created.status === 'aguardando_pagamento' && created.paymentMethod === 'pix' && created.pixPayload) {
      void this.notifyPaymentPending(created).catch((err) =>
        this.logger.warn(`Falha ao avisar pagamento pendente do pedido ${created.id}: ${err}`),
      );
    }
    return created;
  }

  // Histórico do cliente logado NESTE restaurante — cliente é por
  // restaurante agora, então sempre filtra pelos dois (tenantId +
  // customerId), nunca só customerId sozinho.
  // Carrega tableSession+table junto: é o que permite o frontend agrupar
  // os pedidos de mesa por sessão (uma "visita") em vez de mostrar cada
  // pedido avulso da mesa como se fosse independente.
  async findByCustomerId(tenantId: string, customerId: string): Promise<Order[]> {
    const load = () =>
      this.orderRepo.find({
        where: { tenantId, customerId },
        relations: { items: true, tableSession: { table: true } },
        order: { createdAt: 'DESC' },
        take: 100,
      });
    if (!this.tenantCache) return load();
    // Até 100 pedidos com itens por chamada: o item mais pesado depois da
    // listagem do painel. Qualquer escrita de pedido do restaurante invalida.
    const { value } = await this.tenantCache.getOrLoad(tenantId, 'orders', load, {
      label: 'customer-history',
      maxAgeMs: CUSTOMER_HISTORY_MAX_AGE_MS,
      variant: `history:${customerId}`,
    });
    return value;
  }

  // Pedido avulso (balcão/entrega) individual pro cupom do cliente —
  // sempre confere customerId, então um cliente nunca consegue ver o
  // cupom de outro só adivinhando o id do pedido na URL.
  async findOneForCustomer(
    tenantId: string,
    customerId: string,
    orderId: string,
  ): Promise<Order> {
    const order = await this.orderRepo.findOne({
      where: { id: orderId, tenantId, customerId },
      relations: { items: true },
    });
    if (!order) {
      throw new NotFoundException('Pedido não encontrado.');
    }
    return order;
  }

  // Código de autenticidade embutido no cupom (imagem PNG) — ver
  // common/utils/receipt-signature.ts. Qualquer adulteração no valor ou
  // na data faz a verificação falhar; ninguém consegue forjar um código
  // válido sem a chave secreta do servidor. Anexado como campo extra
  // (não faz parte da entidade Order — é sempre calculado na hora,
  // nunca gravado no banco, então nunca fica desatualizado).
  attachReceiptCode<T extends Order>(order: T): T & { receiptVerificationCode: string } {
    const totalCents = toCents(order.total);
    const signature = signReceipt(order.id, order.tenantId, totalCents, order.createdAt.toISOString());
    return { ...order, receiptVerificationCode: formatVerificationCode(order.id, signature) };
  }

  // Painel admin: confere se um código de autenticidade (lido de um QR
  // ou digitado manualmente) bate com um pedido de verdade desse tenant.
  // Sempre recalcula a assinatura a partir dos dados ATUAIS do pedido no
  // banco — nunca confia em nada que veio junto do código.
  async verifyReceiptCode(
    tenantId: string,
    code: string,
  ): Promise<{ valid: boolean; order: Order | null }> {
    const parsed = parseVerificationCode(code);
    if (!parsed) return { valid: false, order: null };

    const order = await this.orderRepo.findOne({
      where: { id: parsed.orderId, tenantId },
      relations: { items: true },
    });
    if (!order) return { valid: false, order: null };

    const totalCents = toCents(order.total);
    const valid = verifyReceiptSignature(
      order.id,
      order.tenantId,
      totalCents,
      order.createdAt.toISOString(),
      parsed.signature,
    );
    return { valid, order: valid ? order : null };
  }

  // Só o painel admin usa isso — mover o pedido entre os estados do fluxo da cozinha.
  @InvalidatesTenantCache(['orders', 'tables'])
  async updateStatus(
    tenantId: string,
    id: string,
    dto: UpdateOrderStatusDto,
    canceledByUserId?: string | null,
  ): Promise<Order> {
    const order = await this.findOne(tenantId, id);
    if (dto.status === 'cancelado') {
      await this.markCancelled(order, dto.cancelReason, canceledByUserId);
    } else {
      stampOrderLifecycle(order, dto.status);
      order.status = dto.status;
    }
    const saved = await this.orderRepo.save(order);
    // SIOD (Camadas 3-4): pedido entregue -> fecha as metricas reais e o erro de
    // previsao. Nunca lanca; sem registro SIOD (nao e entrega) nao faz nada.
    if (saved.status === 'entregue') {
      await this.siodEngine.finalizeOnDelivered(saved);
    }
    // "Melhor esforço", depois de salvar — uma falha de envio nunca
    // desfaz a mudança de status que o admin acabou de fazer.
    await this.notifyOrderStatusChange(saved);
    // Avaliação só fica disponível quando o pedido REALMENTE termina —
    // mesmo critério de OrdersService/ReviewsService.isOrderCompleted
    // (status 'entregue' pra avulso). Mesa não entra aqui: o gatilho
    // dela já mora em TablesService.closeSession, que é o equivalente
    // pra sessão de mesa (a conta fechar é o "terminou" da mesa).
    if (saved.status === 'entregue' && saved.orderType !== 'mesa') {
      await this.notifyReviewPrompt(saved);
    }
    return saved;
  }

  // Endpoint público (sem login) que o carrinho fica consultando a cada
  // poucos segundos enquanto mostra o QR do Pix. Se o prazo já passou e
  // ninguém confirmou o pagamento, expira sozinho aqui — não depende de
  // nenhum cron/job rodando em background.
  async checkPixStatus(
    tenantId: string,
    id: string,
  ): Promise<{
    status: string;
    paymentStatus: string;
    pixExpiresAt: Date | null;
    // Preenchido só na consulta em que a recusa do cartão foi percebida.
    rejectionCode: CardRejectionCode | null;
  }> {
    const order = await this.orderRepo.findOne({ where: { id, tenantId } });
    if (!order) {
      throw new NotFoundException('Pedido não encontrado.');
    }
    // Este método é POLL do cliente (a cada poucos segundos): só invalida o
    // cache se o pedido de fato mudou aqui dentro, senão o cache nunca valeria.
    const stateBefore = `${order.status}|${order.paymentStatus}|${order.mpPaymentId ?? ''}`;

    // Se é um pedido via Mercado Pago ainda em aberto, pergunta pra API
    // deles diretamente qual o status real — é o que permite confirmar o
    // pagamento mesmo sem o webhook ter chegado ainda (essencial em dev
    // local, onde o Mercado Pago não alcança localhost; em produção isso
    // também serve de rede de segurança caso algum webhook se perca).
    let rejectionCode: CardRejectionCode | null = null;
    if (order.status === 'aguardando_pagamento' && order.mpPaymentId && order.paymentStatus !== 'recusado') {
      const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
      if (tenant?.mercadoPagoAccessTokenEncrypted) {
        try {
          const { status, statusDetail } = await this.mercadoPagoService.getPaymentStatus(
            decryptSecret(tenant.mercadoPagoAccessTokenEncrypted),
            order.mpPaymentId,
          );
          if (classifyMpStatus(status) === 'failed') rejectionCode = classifyRejection(statusDetail);
          await this.applyMercadoPagoStatus(order, status, order.mpPaymentId);
          if (order.status !== 'aguardando_pagamento') {
            await this.orderRepo.save(order);
          }
        } catch {
          // Falha pontual na consulta ao Mercado Pago — não derruba a
          // tela do cliente por isso, só tenta de novo no próximo poll.
        }
      }
    }

    if (
      order.status === 'aguardando_pagamento' &&
      order.pixExpiresAt &&
      order.pixExpiresAt.getTime() < Date.now()
    ) {
      // markCancelled (e não só `status = 'cancelado'`): devolve promoção
      // e cashback usado, igual ao caminho do polling do painel (findAll).
      // Antes, quando era o polling do CLIENTE que percebia o prazo
      // estourado primeiro, isso não era devolvido e o painel nunca mais
      // via o pedido como "aguardando" pra corrigir.
      await this.expireOverdueOrder(order);
    }

    if (stateBefore !== `${order.status}|${order.paymentStatus}|${order.mpPaymentId ?? ''}`) {
      this.tenantCache?.invalidate(tenantId, ['orders', 'tables'], 'checkPixStatus');
    }

    return {
      status: order.status,
      paymentStatus: order.paymentStatus,
      pixExpiresAt: order.pixExpiresAt,
      rejectionCode,
    };
  }

  // Motivo gravado quando o prazo de pagamento online estoura.
  private expiryReason(order: Order): string {
    return order.paymentMethod === 'cartao'
      ? 'Pagamento por cartão expirado sem confirmação'
      : 'Pix expirado sem pagamento';
  }

  // Traduz um evento do Mercado Pago (status de um pagamento) em ações no
  // pedido — usado pelo polling do cliente, pelo polling do painel, pelo
  // webhook e pela tentativa de cartão, pra NUNCA haver duas regras
  // divergindo. O QUE fazer é decidido por planPaymentEvent (pura e testada);
  // aqui só se executa, com a transição de "pago" feita de forma ATÔMICA
  // (claimPaidTransition) para cashback/notificação não rodarem duas vezes.
  private async applyMercadoPagoStatus(
    order: Order,
    mpStatus: string,
    mpPaymentId: string | null = null,
  ): Promise<void> {
    const plan = planPaymentEvent(
      {
        orderStatus: order.status,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        mpPaymentId: order.mpPaymentId,
      },
      { paymentId: mpPaymentId, outcome: classifyMpStatus(mpStatus), mpStatus },
    );

    for (const effect of plan.effects) {
      switch (effect) {
        case 'mark_paid': {
          const won = await this.claimPaidTransition(order.id, order.tenantId);
          if (!won) break; // outro processo já confirmou: nada a fazer aqui
          order.status = 'pendente'; // aprovado = entra na cozinha
          order.paymentStatus = 'pago';
          await this.creditCashbackForPaidOrder(order);
          await this.notifyPaymentCompleted(order);
          await this.orderRepo.save(order);
          break;
        }
        case 'cancel_order':
          await this.markCancelled(order, 'Pagamento recusado/cancelado no Mercado Pago');
          order.paymentStatus = 'falhou';
          break;
        case 'refund_orphan': {
          // Dinheiro que chegou DEPOIS de o pedido ser cancelado/expirar.
          const paymentId = mpPaymentId ?? order.mpPaymentId;
          if (!paymentId) break;
          const refunded = await this.refundPaymentQuietly(
            order.tenantId,
            paymentId,
            `pagamento aprovado após cancelamento do pedido ${order.id}`,
          );
          order.paymentStatus = refunded ? 'estornado' : 'estorno_pendente';
          await this.orderRepo.update({ id: order.id }, { paymentStatus: order.paymentStatus });
          break;
        }
        case 'refund_duplicate': {
          // Aprovação de uma tentativa que não é a do pedido: devolve essa.
          if (!mpPaymentId) break;
          await this.refundPaymentQuietly(
            order.tenantId,
            mpPaymentId,
            `pagamento duplicado ${mpPaymentId} no pedido ${order.id}`,
          );
          break;
        }
      }
    }

    // Campos que o plano muda sem efeito associado (recusa de cartão e
    // estorno/chargeback feitos fora do app). Atualização CONDICIONAL: uma
    // recusa atrasada nunca sobrescreve um pedido que já foi pago.
    const handledByEffect = plan.effects.includes('mark_paid') || plan.effects.includes('cancel_order');
    if (plan.next.paymentStatus && !handledByEffect && plan.effects.length === 0) {
      const next = plan.next.paymentStatus;
      if (next === 'recusado') {
        await this.orderRepo.update(
          { id: order.id, paymentStatus: In(['pendente', 'processando']) },
          { paymentStatus: next },
        );
      } else {
        await this.orderRepo.update({ id: order.id }, { paymentStatus: next });
      }
      order.paymentStatus = next;
    }
  }

  // Pagamento por CARTÃO online. O navegador manda o card token (nunca o
  // número do cartão) e o backend cobra no Mercado Pago com as credenciais do
  // restaurante dono do pedido, SEMPRE pelo valor gravado no pedido (que o
  // próprio backend calculou na criação) — nunca por valor vindo do cliente.
  @InvalidatesTenantCache(['orders', 'tables'])
  async payWithCard(tenantId: string, orderId: string, dto: PayCardDto): Promise<PayCardResult> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Estabelecimento não encontrado.');
    const presence = {
      hasAccessToken: Boolean(tenant.mercadoPagoAccessTokenEncrypted),
      hasWebhookSecret: Boolean(tenant.mercadoPagoWebhookSecretEncrypted),
      hasPublicKey: Boolean(tenant.mercadoPagoPublicKey),
    };
    if (!isCardOnlineActive(presence)) {
      throw new BadRequestException('Este estabelecimento não aceita pagamento online por cartão.');
    }
    const accessToken = decryptSecret(tenant.mercadoPagoAccessTokenEncrypted!);

    let order = await this.orderRepo.findOne({ where: { id: orderId, tenantId } });
    if (!order) throw new NotFoundException('Pedido não encontrado.');

    const snapshotOf = (o: Order): OrderPaymentSnapshot => ({
      orderStatus: o.status,
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      mpPaymentId: o.mpPaymentId,
      expiresAt: o.pixExpiresAt,
      cardAttempts: o.cardPaymentAttempts,
    });
    const throwBlocked = (reason: CardAttemptBlock): never => {
      throw new ConflictException({ message: CARD_BLOCK_MESSAGES[reason], code: reason });
    };

    // 1) Pode tentar agora? (pedido certo, no prazo, sem tentativa em curso...)
    const decision = decideCardAttempt(snapshotOf(order), new Date());
    if (decision.action === 'blocked') throwBlocked(decision.reason);

    // Há uma cobrança anterior em aberto: pergunta ao MP o que aconteceu com
    // ela antes de aceitar uma nova (nunca cobrar duas vezes o mesmo pedido).
    if (decision.action === 'check_existing' && order.mpPaymentId) {
      const existing = await this.mercadoPagoService.getPaymentStatus(accessToken, order.mpPaymentId);
      const after = decideAfterExistingPayment(classifyMpStatus(existing.status));
      if (after === 'return_paid') {
        await this.applyMercadoPagoStatus(order, existing.status, order.mpPaymentId);
        return this.buildCardResult(order, 'approved', null, null);
      }
      if (after === 'return_processing') {
        return this.buildCardResult(order, 'processing', null, null);
      }
      if (after === 'blocked_reversed') {
        throw new ConflictException({ message: CARD_BLOCK_MESSAGES.not_awaiting, code: 'not_awaiting' });
      }
      // 'proceed': a anterior foi recusada — segue para uma nova tentativa.
    }

    // 2) Reserva ATÔMICA da tentativa: só UMA requisição concorrente passa
    //    (duplo clique, duas abas). Marca "processando" e conta a tentativa.
    const previousPaymentStatus = order.paymentStatus;
    const now = new Date();
    const claim = await this.orderRepo
      .createQueryBuilder()
      .update(Order)
      .set({ paymentStatus: 'processando', cardPaymentAttempts: () => 'card_payment_attempts + 1' })
      .where(
        'id = :id AND tenant_id = :tenantId AND status = :awaiting AND payment_method = :method ' +
          'AND payment_status IN (:...allowed) AND card_payment_attempts < :max ' +
          'AND (pix_expires_at IS NULL OR pix_expires_at > :now)',
        {
          id: order.id,
          tenantId,
          awaiting: 'aguardando_pagamento',
          method: 'cartao',
          allowed: ['pendente', 'recusado'],
          max: MAX_CARD_ATTEMPTS,
          now,
        },
      )
      .execute();
    if ((claim.affected ?? 0) !== 1) {
      const fresh = await this.orderRepo.findOne({ where: { id: orderId, tenantId } });
      const again = fresh ? decideCardAttempt(snapshotOf(fresh), new Date()) : null;
      throwBlocked(again && again.action === 'blocked' ? again.reason : 'in_flight');
    }

    // 3) Valor: SEMPRE do pedido gravado, em centavos inteiros.
    const amountCents = chargeCents(toCents(order.total), toCents(order.tipAmount));
    const releaseClaim = async (): Promise<void> => {
      // Volta ao estado anterior só se ainda estiver "processando".
      await this.orderRepo.update(
        { id: order!.id, paymentStatus: 'processando' },
        { paymentStatus: previousPaymentStatus === 'recusado' ? 'recusado' : 'pendente' },
      );
    };
    if (amountCents <= 0) {
      await releaseClaim();
      throw new BadRequestException('Este pedido não tem valor a cobrar.');
    }

    const customerEmail = order.customerId
      ? (await this.customerRepo.findOne({ where: { id: order.customerId } }))?.email
      : null;
    const publicUrl = process.env.API_PUBLIC_URL;

    let payment: Awaited<ReturnType<MercadoPagoService['createCardPayment']>>;
    try {
      payment = await this.mercadoPagoService.createCardPayment({
        accessToken,
        amountCents,
        cardToken: dto.token,
        paymentMethodId: dto.paymentMethodId,
        issuerId: dto.issuerId ?? null,
        installments: dto.installments ?? 1,
        description: `Pedido ${tenant.name}`,
        payerEmail: dto.payerEmail ?? customerEmail ?? `pedido-${order.id}@guest.cardapiosaas.com`,
        payerIdentification:
          dto.identificationType && dto.identificationNumber
            ? { type: dto.identificationType, number: dto.identificationNumber }
            : null,
        externalReference: order.id,
        idempotencyKey: cardIdempotencyKey(order.id, dto.token),
        notificationUrl: publicUrl ? `${publicUrl}/orders/public/${tenantId}/webhook/mercadopago` : undefined,
        deviceId: dto.deviceId,
      });
    } catch (err) {
      await releaseClaim();
      if (err instanceof MercadoPagoRequestError) {
        // Token inválido/expirado ou dado faltando: o cliente refaz o envio.
        throw new BadRequestException({
          message: rejectionMessage('bad_card_data'),
          code: 'bad_card_data' satisfies CardRejectionCode,
        });
      }
      throw err; // BadGateway etc. — a reserva já foi liberada
    }

    // 4) Grava o id do pagamento e aplica o resultado. Recarrega o pedido:
    //    o webhook pode ter chegado no meio e o contador de tentativas mudou.
    await this.orderRepo.update({ id: order.id }, { mpPaymentId: payment.id });
    order = (await this.orderRepo.findOne({ where: { id: orderId, tenantId } })) ?? order;
    order.mpPaymentId = payment.id;

    const outcome = classifyMpStatus(payment.status);
    if (outcome === 'processing') {
      // Em análise ou desafio 3DS: libera a reserva (sem sobrescrever um
      // "pago" que o webhook já tenha gravado).
      await this.orderRepo.update(
        { id: order.id, status: 'aguardando_pagamento', paymentStatus: 'processando' },
        { paymentStatus: 'pendente' },
      );
      order.paymentStatus = order.paymentStatus === 'processando' ? 'pendente' : order.paymentStatus;
    }
    await this.applyMercadoPagoStatus(order, payment.status, payment.id);

    if (outcome === 'paid') return this.buildCardResult(order, 'approved', null, null);
    if (outcome === 'processing') return this.buildCardResult(order, 'processing', null, payment.threeDs);

    // Recusado: o pedido segue aguardando (nova tentativa na janela), a menos
    // que as tentativas tenham acabado — aí cancela e libera promoção/cashback.
    const code = classifyRejection(payment.statusDetail);
    if (order.status === 'aguardando_pagamento' && order.cardPaymentAttempts >= MAX_CARD_ATTEMPTS) {
      await this.markCancelled(order, 'Cartão recusado: limite de tentativas');
      order.paymentStatus = 'falhou';
      await this.orderRepo.save(order);
      return this.buildCardResult(order, 'rejected', code, null);
    }
    return this.buildCardResult(order, 'rejected', code, null);
  }

  private buildCardResult(
    order: Order,
    status: PayCardResult['status'],
    rejectionCode: CardRejectionCode | null,
    threeDs: PayCardResult['threeDs'],
  ): PayCardResult {
    return {
      status,
      orderStatus: order.status,
      paymentStatus: order.paymentStatus,
      rejectionCode,
      message: rejectionCode ? rejectionMessage(rejectionCode) : null,
      threeDs,
      attemptsLeft: Math.max(0, MAX_CARD_ATTEMPTS - order.cardPaymentAttempts),
      orderCancelled: order.status === 'cancelado',
    };
  }

  // Botão "Confirmar pagamento" no painel do admin — o único jeito de um
  // pedido sair de 'aguardando_pagamento' pra entrar de fato na cozinha.
  // Confere o estado atual em vez de aceitar cegamente, pra nunca liberar
  // pra cozinha um pedido que já expirou ou que nem estava esperando Pix.
  @InvalidatesTenantCache(['orders', 'tables'])
  async confirmPixPayment(tenantId: string, id: string): Promise<Order> {
    const order = await this.findOne(tenantId, id);
    if (order.status !== 'aguardando_pagamento') {
      throw new BadRequestException(
        'Este pedido não está aguardando confirmação de pagamento Pix.',
      );
    }
    // Cartão online é confirmado SOMENTE pelo Mercado Pago (aprovação real):
    // confirmar à mão marcaria como pago um pedido que ninguém pagou.
    if (order.paymentMethod === 'cartao') {
      throw new BadRequestException(
        'Pagamento por cartão é confirmado automaticamente pelo Mercado Pago.',
      );
    }
    // Transição atômica: se o webhook/polling confirmou no mesmo instante,
    // só um dos dois credita cashback e notifica.
    const won = await this.claimPaidTransition(order.id, tenantId);
    if (!won) {
      throw new BadRequestException('Este pedido já foi confirmado ou não está mais aguardando pagamento.');
    }
    order.status = 'pendente';
    order.paymentStatus = 'pago';
    await this.creditCashbackForPaidOrder(order);
    await this.notifyPaymentCompleted(order);
    return this.orderRepo.save(order);
  }

  // Webhook do Mercado Pago — chamado por ELES quando o status de um
  // pagamento muda. NUNCA confiamos no corpo da notificação em si (podia
  // ser forjado por qualquer um que descobrisse a URL); depois de
  // verificar a assinatura, a única coisa que fazemos com o webhook é
  // "ok, alguma coisa mudou no pagamento X" — e então perguntamos pro
  // Mercado Pago diretamente, com nosso próprio access token, qual é o
  // status de verdade.
  @InvalidatesTenantCache(['orders', 'tables'])
  async handleMercadoPagoWebhook(
    tenantId: string,
    dataId: string | undefined,
    type: string | undefined,
    xSignatureHeader: string | undefined,
    xRequestIdHeader: string | undefined,
  ): Promise<{ received: boolean }> {
    if (type !== 'payment' || !dataId) {
      return { received: true }; // outros tipos de notificação (ex: merchant_order) — ignora
    }

    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant?.mercadoPagoAccessTokenEncrypted) {
      return { received: true };
    }

    const webhookSecret = tenant.mercadoPagoWebhookSecretEncrypted
      ? decryptSecret(tenant.mercadoPagoWebhookSecretEncrypted)
      : null;
    const signatureValid = this.mercadoPagoService.verifyWebhookSignature({
      webhookSecret,
      xSignatureHeader,
      xRequestIdHeader,
      dataId,
    });
    if (!signatureValid) {
      this.logger.warn(`Webhook do Mercado Pago com assinatura inválida (tenant ${tenantId}).`);
      return { received: true }; // não estoura erro pro Mercado Pago não ficar reenviando
    }

    const accessToken = decryptSecret(tenant.mercadoPagoAccessTokenEncrypted);
    const { status, externalReference } = await this.mercadoPagoService.getPaymentStatus(
      accessToken,
      dataId,
    );
    if (!externalReference) return { received: true };

    // Prefixo "mesa:" (28/09) distingue uma cobrança de FECHAMENTO DE
    // MESA de uma de PEDIDO avulso — mesmo webhook, dois destinos
    // possíveis. Ver TablesService.requestClosing (quem cria a cobrança
    // com essa referência) e applyMercadoPagoStatusToSession (quem
    // decide o que fazer com o status).
    if (externalReference.startsWith('mesa:')) {
      const sessionId = externalReference.slice('mesa:'.length);
      const session = await this.tablesService.findSessionOrNull(tenantId, sessionId);
      if (session) {
        await this.tablesService.applyMercadoPagoStatusToSession(tenantId, session, status);
      }
      return { received: true };
    }

    const order = await this.orderRepo.findOne({
      where: { id: externalReference, tenantId },
    });
    if (!order) {
      return { received: true };
    }

    // Não filtra mais por "aguardando": pagamento aprovado DEPOIS de o pedido
    // ser cancelado precisa ser estornado, e estorno/chargeback de pedido
    // pago precisa ser registrado — tudo decidido em planPaymentEvent.
    const statusBefore = order.status;
    await this.applyMercadoPagoStatus(order, status, dataId);
    if (order.status !== statusBefore) {
      await this.orderRepo.save(order);
    }
    return { received: true };
  }

  // Usado só pra pedidos avulsos (Balcão/Entrega) — quem tem sessão de
  // mesa registra o pagamento ao "Fechar conta" (TablesService.closeSession).
  // Um pedido avulso não passa por essa etapa em nenhum outro lugar, então
  // "concluir" tem que ser o momento em que a forma de pagamento é
  // registrada — nunca marcar como entregue silenciosamente sem saber
  // como (ou se) foi pago.
  @InvalidatesTenantCache(['orders', 'tables'])
  async concludeWithPayment(
    tenantId: string,
    id: string,
    paymentMethod: string,
    amountReceived?: number,
  ): Promise<Order> {
    const order = await this.findOne(tenantId, id);

    // Pedido de mesa nunca conclui pagamento individualmente por aqui —
    // bug real que isso corrige: o botão "Concluir pedido" (usado no
    // fluxo avulso/balcão/entrega) também aparecia nos pedidos DENTRO
    // de uma mesa ativa no painel, e nada aqui impedia isso. Clicar
    // nele marcava aquele pedido como pago e entregue por fora do
    // fechamento de conta de verdade — sem pedir forma de pagamento da
    // MESA, e sem bater com o total real cobrado quando a mesa fechava
    // de verdade (TablesService.closeSession). Pagamento de mesa é
    // sempre UMA VEZ, pra conta inteira, nunca pedido por pedido.
    if (order.orderType === 'mesa') {
      throw new BadRequestException(
        'Pedido de mesa não conclui pagamento individualmente — feche a conta da mesa inteira.',
      );
    }

    // Pedido já PAGO (Pix/cartão online pelo Mercado Pago, ou Pix confirmado)
    // não exige valor recebido e não pode ter a forma de pagamento sobrescrita
    // por quem conclui no painel.
    const alreadyPaid = order.paymentStatus === 'pago';
    if (paymentMethod === 'dinheiro' && !alreadyPaid) {
      const totalDueCents = toCents(order.total) + toCents(order.tipAmount);
      if (amountReceived == null || toCents(amountReceived) < totalDueCents) {
        throw new BadRequestException(
          'Valor recebido em dinheiro é menor que o total (incluindo gorjeta) do pedido.',
        );
      }
    }

    stampOrderLifecycle(order, 'entregue');
    order.status = 'entregue';
    if (!alreadyPaid) {
      order.paymentMethod = paymentMethod;
      order.paymentStatus = 'pago';
      order.amountReceived = paymentMethod === 'dinheiro' ? amountReceived! : null;
    }
    await this.creditCashbackForPaidOrder(order);
    const saved = await this.orderRepo.save(order);
    await this.siodEngine.finalizeOnDelivered(saved);
    if (!alreadyPaid) await this.notifyPaymentCompleted(saved);
    // Esse método É o "pedido terminou" pra esse fluxo (só pedido
    // avulso passa por aqui — mesa fecha pela sessão, ver comentário
    // acima) — status já virou 'entregue' bem ali em cima, então é o
    // ÚNICO ponto certo pra avisar que a avaliação já pode ser feita.
    await this.notifyReviewPrompt(saved);
    return saved;
  }
}
