import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CustomerJwtAuthGuard } from '../customers/customer-jwt-auth.guard';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import type { RequestCustomer } from '../../common/decorators/current-customer.decorator';
import { CashbackService } from './cashback.service';
import { CreateCashbackSettingsDto } from './dto/create-cashback-settings.dto';
import { UpdateCashbackSettingsDto } from './dto/update-cashback-settings.dto';

@Controller()
export class CashbackController {
  constructor(private readonly cashbackService: CashbackService) {}

  // ---------- Configurações (admin) ----------

  @UseGuards(JwtAuthGuard)
  @Get('cashback/settings')
  async findAllSettings(@CurrentTenant() tenantId: string) {
    return this.cashbackService.findAllSettings(tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('cashback/settings')
  async createSettings(@CurrentTenant() tenantId: string, @Body() dto: CreateCashbackSettingsDto) {
    return this.cashbackService.createSettings(tenantId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('cashback/settings/:id')
  async updateSettings(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCashbackSettingsDto,
  ) {
    return this.cashbackService.updateSettings(tenantId, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('cashback/settings/:id')
  async deleteSettings(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    await this.cashbackService.deleteSettings(tenantId, id);
    return { success: true };
  }

  // ---------- Cardápio público — só o texto de propaganda ----------

  @Get('cashback/public/:tenantId/active')
  async findActiveForPublic(
    @Param('tenantId') tenantId: string,
    @Query('locationId') locationId?: string,
  ) {
    return this.cashbackService.findActiveForPublic(tenantId, locationId ?? null);
  }

  // ---------- Saldo do cliente logado ----------

  @UseGuards(CustomerJwtAuthGuard)
  @Get('cashback/public/:tenantId/balance')
  async getMyBalance(
    @Param('tenantId') tenantId: string,
    @CurrentCustomer() customer: RequestCustomer,
  ) {
    // Mesma checagem cruzada usada em CustomersController: o token é do
    // cliente, mas nunca confiamos que o tenantId da URL bate com o do
    // token sem conferir explicitamente.
    if (customer.tenantId !== tenantId) {
      throw new ForbiddenException('Essa conta não pertence a este restaurante.');
    }
    const balance = await this.cashbackService.getBalance(tenantId, customer.customerId);
    return { balance };
  }

  // ---------- Extrato do cliente logado (área "Cashback" da conta) ----------

  @UseGuards(CustomerJwtAuthGuard)
  @Get('cashback/public/:tenantId/history')
  async getMyHistory(@Param('tenantId') tenantId: string, @CurrentCustomer() customer: RequestCustomer) {
    if (customer.tenantId !== tenantId) {
      throw new ForbiddenException('Essa conta não pertence a este restaurante.');
    }
    return this.cashbackService.getCustomerHistory(tenantId, customer.customerId);
  }

  // ---------- Histórico e totais (aba "Cashback" dentro de Histórico, admin) ----------

  @UseGuards(JwtAuthGuard)
  @Get('cashback/history/credits')
  async getAdminCreditHistory(@CurrentTenant() tenantId: string) {
    return this.cashbackService.getAdminCreditHistory(tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('cashback/history/consumptions')
  async getAdminConsumptionHistory(@CurrentTenant() tenantId: string) {
    return this.cashbackService.getAdminConsumptionHistory(tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('cashback/totals')
  async getTotals(@CurrentTenant() tenantId: string) {
    return this.cashbackService.getTotals(tenantId);
  }
}
