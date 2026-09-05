import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Order } from './order.entity';
import { OrderItem } from './order-item.entity';
import { Product } from '../products/product.entity';
import { Tenant } from '../tenants/tenant.entity';
import { Location } from '../locations/location.entity';
import { Customer } from '../customers/customer.entity';
import { TableSession } from '../tables/table-session.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { toCents, fromCents } from '../../common/utils/money';
import { computeIsOpenNow } from '../../common/utils/schedule';
import { buildPixTxId, generatePixPayload } from '../../common/utils/pix';
import { signReceipt, verifyReceiptSignature, formatVerificationCode, parseVerificationCode } from '../../common/utils/receipt-signature';
import { decryptSecret } from '../../common/utils/encryption';
import { MercadoPagoService } from '../payments/mercadopago.service';
import { DeliveryService, DeliveryQuoteResult } from '../delivery/delivery.service';
import { PromotionsService } from '../promotions/promotions.service';
import type { CartLine } from '../promotions/promotions.service';
import { CashbackService } from '../cashback/cashback.service';
import { PushService } from '../push/push.service';

// Janela pro cliente pagar o Pix antes do pedido expirar sozinho — mesmo
// tempo que o iFood usa (6 min). Com Mercado Pago configurado, a
// confirmação é automática (webhook + consulta direta); sem ele, é
// manual dos dois lados, então o admin precisa estar de olho no painel
// durante essa janela.
const PIX_PAYMENT_WINDOW_MS = 6 * 60 * 1000;

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
  private async markCancelled(order: Order): Promise<void> {
    if (order.status === 'cancelado') return;
    order.status = 'cancelado';
    const promotionIds = order.promotionIds ?? (order.promotionId ? [order.promotionId] : []);
    await Promise.all(
      promotionIds.map((id) => this.promotionsService.releaseRedemption(this.orderRepo.manager, id)),
    );
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
    if (!order.cashbackLocked) {
      await this.cashbackService.reverseConsumptionForOrder(this.orderRepo.manager, order.tenantId, order.id);
      await this.cashbackService.reverseCreditForOrder(this.orderRepo.manager, order.tenantId, order.id);
    }
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
    await this.pushService.sendToCustomer(order.tenantId, order.customerId, {
      title: 'Pagamento confirmado',
      body: `Recebemos o pagamento de R$ ${Number(order.total).toFixed(2).replace('.', ',')} do seu pedido.`,
      url: `/${tenant.slug}/conta-cliente/pedidos/avulso/${order.id}`,
      tag: 'payment_completed',
      groupTag: `payment-${order.id}`,
      icon: tenant.logoUrl ?? undefined,
    });
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
      url,
      tag: 'order_delivered',
      groupTag: `order-status-${order.id}`,
      icon: tenant.logoUrl ?? undefined,
    });
  }

  private orderStatusNotificationCopy(
    orderType: string,
    status: string,
  ): { title: string; body: string } | null {
    if (status === 'preparando') {
      return {
        title: 'Seu pedido está sendo preparado',
        body: 'A cozinha já começou a preparar seu pedido.',
      };
    }
    if (status === 'pronto') {
      if (orderType === 'entrega') {
        return {
          title: 'Seu pedido está pronto',
          body: 'Já vai sair para entrega a qualquer momento.',
        };
      }
      if (orderType === 'mesa') {
        return {
          title: 'Seu pedido está pronto',
          body: 'O garçom já está levando pra sua mesa.',
        };
      }
      return {
        title: 'Seu pedido está pronto',
        body: 'Pode vir buscar no balcão.',
      };
    }
    if (status === 'entregue') {
      if (orderType === 'entrega') {
        return { title: 'Seu pedido foi entregue', body: 'Bom apetite! Toque para ver o cupom.' };
      }
      if (orderType === 'mesa') {
        return { title: 'Pedido servido', body: 'Bom apetite! Toque para ver o cupom.' };
      }
      return { title: 'Pedido retirado', body: 'Bom apetite! Toque para ver o cupom.' };
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
  async findAllForAdmin(tenantId: string): Promise<Order[]> {
    const orders = await this.orderRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      relations: { items: true, customer: true },
      select: {
        customer: { id: true, name: true, avatarUrl: true },
      },
    });

    // Consulta o Mercado Pago pros pedidos ainda aguardando confirmação —
    // assim o painel do admin reflete "pagamento confirmado" sozinho, a
    // cada 5s, sem depender do cliente estar com a aba aberta nem do
    // webhook ter chegado (essencial em dev local; rede de segurança em
    // produção).
    const pendingMpOrders = orders.filter(
      (o) => o.status === 'aguardando_pagamento' && o.mpPaymentId,
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
            await this.applyMercadoPagoStatus(order, status);
            if (order.status !== 'aguardando_pagamento') {
              changedOrders.push(order);
            }
          } catch {
            // Falha pontual — tenta de novo no próximo poll do painel.
          }
        }
        if (changedOrders.length > 0) {
          await this.orderRepo.save(changedOrders);
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
        await this.markCancelled(order);
        order.paymentStatus = 'falhou';
      }
      await this.orderRepo.save(expiredOrders);
    }

    return orders;
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
    await this.markCancelled(order);
    if (order.paymentStatus === 'pendente') {
      order.paymentStatus = 'falhou';
    }
    return this.orderRepo.save(order);
  }

  // Pedido de balcão não tem "chamar garçom" (não há mesa/sessão) — só
  // acende o mesmo destaque de atenção que o painel já usa. Idempotente
  // (chamar de novo não faz nada demais).
  async flagForAttention(tenantId: string, id: string): Promise<Order> {
    const order = await this.findOne(tenantId, id);
    order.flagged = true;
    return this.orderRepo.save(order);
  }

  // Cria o pedido inteiro em UMA transação: ou tudo é salvo, ou nada é.
  // O preço de cada item vem sempre do banco (nunca do que o cliente mandou),
  // pra impedir que alguém manipule o preço direto na requisição.
  async create(tenantId: string, dto: CreateOrderDto, customerId: string | null = null): Promise<Order> {
    // A geocodificação roda ANTES de abrir a transação de propósito: é uma
    // chamada de rede externa (LocationIQ, até ~8s) e nunca deve segurar uma
    // transação de banco aberta enquanto espera resposta de fora. O valor
    // da taxa é sempre recalculado aqui do zero a partir do endereço bruto
    // — nunca confiamos num valor de taxa/distância vindo do cliente,
    // mesmo que ele tenha visto uma cotação antes (endpoint público
    // `/delivery/quote`); essa cotação é só uma prévia, não é autoridade.
    let deliveryQuote: DeliveryQuoteResult | null = null;
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

    return this.dataSource.transaction(async (manager) => {
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
      if (trustedTableSessionId) {
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

      const location = resolvedLocationId
        ? await manager.findOne(Location, { where: { id: resolvedLocationId, tenantId } })
        : null;
      if (!location) {
        throw new NotFoundException('Loja não encontrada.');
      }
      if (!computeIsOpenNow(location.isOpen, location.openingHours)) {
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
      const usesMercadoPago = isPixOrder && Boolean(tenant.mercadoPagoAccessTokenEncrypted);
      const usesStaticPixQR = isPixOrder && !usesMercadoPago && tenant.pixEnabled && Boolean(tenant.pixKey);
      const usesRealPixCheckout = usesMercadoPago || usesStaticPixQR;

      const order = manager.create(Order, {
        tenantId,
        tableSessionId: trustedTableSessionId ?? null,
        locationId: resolvedLocationId,
        customerId,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        tableNumber: resolvedTableNumber,
        orderType: dto.orderType,
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
        status: usesRealPixCheckout ? 'aguardando_pagamento' : 'pendente',
        // Só guarda a intenção de pagamento do cliente pra mesa nunca —
        // lá quem define é o admin ao fechar a conta.
        paymentMethod: dto.orderType !== 'mesa' ? dto.paymentMethod ?? null : null,
        tipAmount: dto.orderType !== 'mesa' ? dto.tipAmount ?? 0 : 0,
        paymentStatus: 'pendente',
        pixExpiresAt: usesRealPixCheckout ? new Date(Date.now() + PIX_PAYMENT_WINDOW_MS) : null,
      });
      const savedOrder = await manager.save(order);

      // O payload do QR só pode ser montado DEPOIS de salvar (precisa do
      // id do pedido pra virar o txid/referência). Fica congelado com
      // esse valor pra sempre — o QR nunca muda de valor debaixo do
      // cliente mesmo que o pedido seja editado depois por algum motivo.
      if (usesMercadoPago) {
        const amount = fromCents(totalCents) + fromCents(tipCentsForPix);
        // Sem API_PUBLIC_URL configurada (ex: rodando só em localhost),
        // não tem como o Mercado Pago alcançar um webhook nosso mesmo —
        // nesse caso simplesmente não mandamos notification_url nenhuma,
        // e a confirmação acontece só via polling (checkPixStatus /
        // findAllForAdmin, que já consultam a API deles diretamente).
        const publicUrl = process.env.API_PUBLIC_URL;
        const payment = await this.mercadoPagoService.createPixPayment({
          accessToken: decryptSecret(tenant.mercadoPagoAccessTokenEncrypted!),
          amount,
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
          amount: fromCents(totalCents) + fromCents(tipCentsForPix),
          txId: buildPixTxId(savedOrder.id),
        });
        await manager.save(savedOrder);
      }

      for (const item of orderItems) {
        item.orderId = savedOrder.id;
      }
      await manager.save(OrderItem, orderItems);

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
        await Promise.all(
          appliedDiscounts.map((d) => this.promotionsService.recordRedemption(manager, d.promotionId)),
        );
        await this.promotionsService.recordPerPromoDiscounts(
          manager,
          tenantId,
          savedOrder.id,
          appliedDiscounts,
        );
      }

      return savedOrder;
    });
  }

  // Histórico do cliente logado NESTE restaurante — cliente é por
  // restaurante agora, então sempre filtra pelos dois (tenantId +
  // customerId), nunca só customerId sozinho.
  // Carrega tableSession+table junto: é o que permite o frontend agrupar
  // os pedidos de mesa por sessão (uma "visita") em vez de mostrar cada
  // pedido avulso da mesa como se fosse independente.
  async findByCustomerId(tenantId: string, customerId: string): Promise<Order[]> {
    return this.orderRepo.find({
      where: { tenantId, customerId },
      relations: { items: true, tableSession: { table: true } },
      order: { createdAt: 'DESC' },
      take: 100,
    });
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
  async updateStatus(
    tenantId: string,
    id: string,
    dto: UpdateOrderStatusDto,
  ): Promise<Order> {
    const order = await this.findOne(tenantId, id);
    if (dto.status === 'cancelado') {
      await this.markCancelled(order);
    } else {
      order.status = dto.status;
    }
    const saved = await this.orderRepo.save(order);
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
  ): Promise<{ status: string; paymentStatus: string; pixExpiresAt: Date | null }> {
    const order = await this.orderRepo.findOne({ where: { id, tenantId } });
    if (!order) {
      throw new NotFoundException('Pedido não encontrado.');
    }

    // Se é um pedido via Mercado Pago ainda em aberto, pergunta pra API
    // deles diretamente qual o status real — é o que permite confirmar o
    // pagamento mesmo sem o webhook ter chegado ainda (essencial em dev
    // local, onde o Mercado Pago não alcança localhost; em produção isso
    // também serve de rede de segurança caso algum webhook se perca).
    if (order.status === 'aguardando_pagamento' && order.mpPaymentId) {
      const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
      if (tenant?.mercadoPagoAccessTokenEncrypted) {
        try {
          const { status } = await this.mercadoPagoService.getPaymentStatus(
            decryptSecret(tenant.mercadoPagoAccessTokenEncrypted),
            order.mpPaymentId,
          );
          await this.applyMercadoPagoStatus(order, status);
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
      order.status = 'cancelado';
      order.paymentStatus = 'falhou';
      await this.orderRepo.save(order);
    }

    return {
      status: order.status,
      paymentStatus: order.paymentStatus,
      pixExpiresAt: order.pixExpiresAt,
    };
  }

  // Traduz o status do Mercado Pago (approved/rejected/cancelled/pending)
  // pro nosso vocabulário de pedido — usado tanto pelo polling quanto
  // pelo webhook, pra nunca ter duas traduções diferentes se
  // divergindo uma da outra.
  private async applyMercadoPagoStatus(order: Order, mpStatus: string): Promise<void> {
    if (mpStatus === 'approved') {
      order.status = 'pendente'; // aprovado = entra na cozinha
      order.paymentStatus = 'pago';
      await this.creditCashbackForPaidOrder(order);
      await this.notifyPaymentCompleted(order);
    } else if (mpStatus === 'rejected' || mpStatus === 'cancelled') {
      await this.markCancelled(order);
      order.paymentStatus = 'falhou';
    }
    // 'pending'/'in_process' — continua aguardando, nada muda.
  }

  // Botão "Confirmar pagamento" no painel do admin — o único jeito de um
  // pedido sair de 'aguardando_pagamento' pra entrar de fato na cozinha.
  // Confere o estado atual em vez de aceitar cegamente, pra nunca liberar
  // pra cozinha um pedido que já expirou ou que nem estava esperando Pix.
  async confirmPixPayment(tenantId: string, id: string): Promise<Order> {
    const order = await this.findOne(tenantId, id);
    if (order.status !== 'aguardando_pagamento') {
      throw new BadRequestException(
        'Este pedido não está aguardando confirmação de pagamento Pix.',
      );
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

    const order = await this.orderRepo.findOne({
      where: { id: externalReference, tenantId },
    });
    if (!order || order.status !== 'aguardando_pagamento') {
      return { received: true };
    }

    await this.applyMercadoPagoStatus(order, status);
    if (order.status !== 'aguardando_pagamento') {
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

    if (paymentMethod === 'dinheiro') {
      const totalDueCents = toCents(order.total) + toCents(order.tipAmount);
      if (amountReceived == null || toCents(amountReceived) < totalDueCents) {
        throw new BadRequestException(
          'Valor recebido em dinheiro é menor que o total (incluindo gorjeta) do pedido.',
        );
      }
    }

    order.status = 'entregue';
    order.paymentMethod = paymentMethod;
    order.paymentStatus = 'pago';
    order.amountReceived = paymentMethod === 'dinheiro' ? amountReceived! : null;
    await this.creditCashbackForPaidOrder(order);
    const saved = await this.orderRepo.save(order);
    await this.notifyPaymentCompleted(saved);
    // Esse método É o "pedido terminou" pra esse fluxo (só pedido
    // avulso passa por aqui — mesa fecha pela sessão, ver comentário
    // acima) — status já virou 'entregue' bem ali em cima, então é o
    // ÚNICO ponto certo pra avisar que a avaliação já pode ser feita.
    await this.notifyReviewPrompt(saved);
    return saved;
  }
}
