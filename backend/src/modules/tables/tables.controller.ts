import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentAdminUser } from '../../common/decorators/current-admin-user.decorator';
import type { RequestAdminUser } from '../../common/decorators/current-admin-user.decorator';
import { TablesService } from './tables.service';
import { CreateTableDto } from './dto/create-table.dto';
import { RequestClosingDto } from './dto/request-closing.dto';
import { CloseSessionDto } from './dto/close-session.dto';
import { ForceResetSessionDto } from './dto/force-reset-session.dto';

@Controller()
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  // ---------- Painel admin: gestão de mesas ----------

  @UseGuards(JwtAuthGuard)
  @Get('tables')
  async findAll(@CurrentTenant() tenantId: string) {
    return this.tablesService.findAllForAdmin(tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('tables')
  async create(@CurrentTenant() tenantId: string, @Body() dto: CreateTableDto) {
    return this.tablesService.create(tenantId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('tables/:id')
  async remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    await this.tablesService.remove(tenantId, id);
    return { success: true };
  }

  // Painel admin/garçom: chamados de garçom pendentes, em tempo quase-real
  // (o frontend do painel faz polling nessa rota a cada poucos segundos).
  // @SkipThrottle: já exige JWT de admin, e compete por 4s/vez pelo
  // mesmo balde global que o app do cliente usa — ver comentário em
  // app.module.ts.
  @UseGuards(JwtAuthGuard)
  @SkipThrottle()
  @Get('waiter-calls')
  async findPendingWaiterCalls(@CurrentTenant() tenantId: string) {
    return this.tablesService.findPendingWaiterCalls(tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('waiter-calls/:id/attend')
  async attendWaiterCall(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.tablesService.attendWaiterCall(tenantId, id);
  }

  // Painel admin: mesas que já solicitaram fechamento, aguardando o garçom
  // confirmar o pagamento.
  @UseGuards(JwtAuthGuard)
  @Get('table-sessions/awaiting-closing')
  async findSessionsAwaitingClosing(@CurrentTenant() tenantId: string) {
    return this.tablesService.findSessionsAwaitingClosing(tenantId);
  }

  // Painel admin: visão de todas as mesas ativas agora (abertas ou com
  // fechamento solicitado), com tempo decorrido e total — visibilidade
  // pro garçom identificar qualquer mesa que não devia estar ativa.
  // @SkipThrottle: mesmo motivo do endpoint de waiter-calls acima —
  // polling frequente e já autenticado.
  @UseGuards(JwtAuthGuard)
  @SkipThrottle()
  @Get('table-sessions/active-overview')
  async findActiveOverview(@CurrentTenant() tenantId: string) {
    return this.tablesService.findActiveOverview(tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('table-sessions/:id/summary')
  async getSessionSummaryAdmin(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.tablesService.getSessionSummary(tenantId, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('table-sessions/:id/close')
  async closeSession(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: CloseSessionDto,
  ) {
    return this.tablesService.closeSession(
      tenantId,
      id,
      dto.paymentMethod,
      dto.amountReceived,
    );
  }

  // Encerramento forçado (sem cobrança) — pra corrigir sessões presas ou
  // confusas sem precisar simular um pagamento.
  @UseGuards(JwtAuthGuard)
  @Post('table-sessions/:id/force-reset')
  async forceResetSession(
    @CurrentTenant() tenantId: string,
    @CurrentAdminUser() adminUser: RequestAdminUser,
    @Param('id') id: string,
    @Body() dto: ForceResetSessionDto,
  ) {
    return this.tablesService.forceResetSession(tenantId, id, dto.reason, {
      userId: adminUser.userId,
      email: adminUser.email,
    });
  }

  // ---------- Fluxo público: cliente escaneando o QR code ----------

  // O cliente acessa algo como /mesa/:qrCodeToken no frontend, que chama
  // essa rota pra abrir (ou entrar n)a sessão da mesa, sem precisar de login.
  @Post('table-sessions/public/scan/:qrCodeToken')
  async scanQrCode(@Param('qrCodeToken') qrCodeToken: string) {
    return this.tablesService.openOrJoinSession(qrCodeToken);
  }

  // "Minha Conta": tenantId vem resolvido no frontend a partir da própria
  // sessão retornada pelo scan (a sessão já carrega o tenantId).
  @Get('table-sessions/public/:tenantId/:sessionId/summary')
  async getSessionSummary(
    @Param('tenantId') tenantId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.tablesService.getSessionSummary(tenantId, sessionId);
  }

  @Post('table-sessions/public/:tenantId/:sessionId/request-closing')
  async requestClosing(
    @Param('tenantId') tenantId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: RequestClosingDto,
  ) {
    return this.tablesService.requestClosing(tenantId, sessionId, dto.tipAmount);
  }

  @Post('table-sessions/public/:tenantId/:sessionId/call-waiter')
  async callWaiter(
    @Param('tenantId') tenantId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.tablesService.callWaiter(tenantId, sessionId);
  }

  @Get('table-sessions/public/:tenantId/:sessionId/waiter-call-status')
  async waiterCallStatus(
    @Param('tenantId') tenantId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.tablesService.getLatestWaiterCallStatus(tenantId, sessionId);
  }

  // "Cancelar chamar garçom" — desfaz um chamado feito sem querer,
  // enquanto ainda estiver pendente (garçom ainda não foi atender).
  @Post('table-sessions/public/:tenantId/:sessionId/cancel-waiter-call')
  async cancelWaiterCall(
    @Param('tenantId') tenantId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.tablesService.cancelWaiterCall(tenantId, sessionId);
  }
}
