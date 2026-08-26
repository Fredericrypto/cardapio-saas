import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Headers,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import type { RequestCustomer } from '../../common/decorators/current-customer.decorator';
import { CustomerJwtAuthGuard } from '../customers/customer-jwt-auth.guard';
import { CustomersAuthService } from '../customers/customers-auth.service';
import { OrdersService } from './orders.service';
import { TablesService } from '../tables/tables.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { ConcludeOrderDto } from './dto/conclude-order.dto';

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly customersAuthService: CustomersAuthService,
    private readonly tablesService: TablesService,
  ) {}

  // Rota PÚBLICA: cliente final finalizando o pedido no cardápio, sem
  // exigir login (guest checkout continua funcionando). Se vier um
  // header Authorization com um token de cliente VÁLIDO **desse mesmo
  // restaurante**, o pedido fica vinculado à conta (pro histórico); se
  // não vier, vier inválido, ou for de outro restaurante, o pedido segue
  // normal como convidado — nunca rejeita a criação por causa disso.
  @Post('public/:tenantId')
  async createPublic(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateOrderDto,
    @Headers('authorization') authHeader?: string,
  ) {
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const customer = token ? this.customersAuthService.verifyToken(tenantId, token) : null;
    return this.ordersService.create(tenantId, dto, customer?.customerId ?? null);
  }

  @UseGuards(JwtAuthGuard)
  // Já exige JWT de admin — o risco que o Throttler existe pra mitigar
  // (força bruta/anônimo) não se aplica aqui. E esse endpoint é
  // pollado a cada 5s pelo painel (DashboardDataContext) — deixar ele
  // competir pelo mesmo balde de requisições do resto do app público
  // foi o que causou o 429 no login do cliente reportado.
  @SkipThrottle()
  @Get()
  async findAll(@CurrentTenant() tenantId: string) {
    return this.ordersService.findAllForAdmin(tenantId);
  }

  // Histórico do cliente logado NESTE restaurante — cliente é por
  // restaurante agora (não mais cross-tenant), então isso sempre confere
  // se o tenantId do token bate com o da URL antes de devolver qualquer
  // coisa.
  @UseGuards(CustomerJwtAuthGuard)
  @Get('public/:tenantId/me/history')
  async findMyHistory(
    @Param('tenantId') tenantId: string,
    @CurrentCustomer() customer: RequestCustomer,
  ) {
    if (customer.tenantId !== tenantId) {
      throw new ForbiddenException('Essa conta não pertence a este restaurante.');
    }
    return this.ordersService.findByCustomerId(tenantId, customer.customerId);
  }

  // Um pedido avulso (balcão/entrega) específico do cliente logado — usado
  // pela tela de cupom em "Meus pedidos" (deep-link direto, sem depender
  // do estado da lista anterior). Sessões de mesa usam o endpoint público
  // de resumo de sessão (table-sessions/public/:tenantId/:sessionId/summary),
  // que já existia e já é o mesmo usado pelo painel do admin.
  @UseGuards(CustomerJwtAuthGuard)
  @Get('public/:tenantId/me/history/:orderId')
  async findMyHistoryOrder(
    @Param('tenantId') tenantId: string,
    @Param('orderId') orderId: string,
    @CurrentCustomer() customer: RequestCustomer,
  ) {
    if (customer.tenantId !== tenantId) {
      throw new ForbiddenException('Essa conta não pertence a este restaurante.');
    }
    return this.ordersService.attachReceiptCode(
      await this.ordersService.findOneForCustomer(tenantId, customer.customerId, orderId),
    );
  }

  // Rota pública que o carrinho fica consultando enquanto mostra o QR do
  // Pix (a cada poucos segundos) — sem login, já que checkout convidado
  // também usa Pix. Só devolve os 3 campos que a tela precisa, nada
  // sensível; o id do pedido é um UUID aleatório, então ninguém adivinha
  // o de outra pessoa.
  @Get('public/:tenantId/:id/pix-status')
  async checkPixStatus(@Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.ordersService.checkPixStatus(tenantId, id);
  }

  // Webhook do Mercado Pago — URL configurada como notification_url na
  // criação do pagamento (ver OrdersService.create). Sem guard (o
  // Mercado Pago não manda token de autenticação nosso), a segurança
  // vem da verificação de assinatura + sempre re-confirmar direto na
  // API deles, nunca confiar no corpo da notificação em si.
  @Post('public/:tenantId/webhook/mercadopago')
  async mercadoPagoWebhook(
    @Param('tenantId') tenantId: string,
    @Query('type') queryType: string | undefined,
    @Query('data.id') queryDataId: string | undefined,
    @Body() body: { type?: string; data?: { id?: string } },
    @Headers('x-signature') xSignature: string | undefined,
    @Headers('x-request-id') xRequestId: string | undefined,
  ) {
    const type = queryType ?? body?.type;
    const dataId = queryDataId ?? body?.data?.id;
    return this.ordersService.handleMercadoPagoWebhook(
      tenantId,
      dataId,
      type,
      xSignature,
      xRequestId,
    );
  }

  // "Cancelar pedido" do lado do cliente, na tela de confirmação — ver
  // regra de janela permitida no service.
  @Post('public/:tenantId/:id/cancel')
  async cancelByCustomer(@Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.ordersService.cancelByCustomer(tenantId, id);
  }

  // "Chamar atendente" do lado do cliente pra pedido de BALCÃO (mesa já
  // tem seu próprio "chamar garçom" via tableSessionId/WaiterCall) —
  // sinaliza o painel do admin (mesmo campo `flagged` já usado pra
  // destacar pedido precisando de atenção).
  @Post('public/:tenantId/:id/flag-attention')
  async flagForAttention(@Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.ordersService.flagForAttention(tenantId, id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.ordersService.attachReceiptCode(await this.ordersService.findOne(tenantId, id));
  }

  // Painel admin: confere um código de autenticidade de cupom (QR
  // escaneado ou digitado à mão) — pode ser de um pedido AVULSO
  // (balcão/entrega) ou de uma sessão de MESA fechada, então tenta os
  // dois (o formato do código é idêntico nos dois casos, só muda o que
  // ele referencia — ver OrdersService.verifyReceiptCode e
  // TablesService.verifySessionReceiptCode).
  @UseGuards(JwtAuthGuard)
  @Post('verify-receipt')
  async verifyReceipt(@CurrentTenant() tenantId: string, @Body('code') code: string) {
    if (!code) return { valid: false, kind: null, order: null, session: null, sessionGrandTotal: null };

    const orderResult = await this.ordersService.verifyReceiptCode(tenantId, code);
    if (orderResult.valid) {
      return {
        valid: true,
        kind: 'avulso' as const,
        order: orderResult.order,
        session: null,
        sessionGrandTotal: null,
      };
    }

    const sessionResult = await this.tablesService.verifySessionReceiptCode(tenantId, code);
    if (sessionResult.valid) {
      return {
        valid: true,
        kind: 'mesa' as const,
        order: null,
        session: sessionResult.session,
        sessionGrandTotal: sessionResult.grandTotal,
      };
    }

    return { valid: false, kind: null, order: null, session: null, sessionGrandTotal: null };
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/status')
  async updateStatus(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(tenantId, id, dto);
  }

  // Botão "Confirmar pagamento" do admin pro Pix de balcão/entrega — só
  // libera o pedido pra cozinha depois que o admin viu o Pix cair de
  // verdade no banco. Ver comentário no service.
  @UseGuards(JwtAuthGuard)
  @Patch(':id/confirm-pix-payment')
  async confirmPixPayment(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.ordersService.confirmPixPayment(tenantId, id);
  }

  // Só pra pedidos avulsos (Balcão/Entrega) — ver comentário no service.
  @UseGuards(JwtAuthGuard)
  @Patch(':id/conclude')
  async conclude(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: ConcludeOrderDto,
  ) {
    return this.ordersService.concludeWithPayment(
      tenantId,
      id,
      dto.paymentMethod,
      dto.amountReceived,
    );
  }
}
