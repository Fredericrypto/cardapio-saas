import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentAdminUser } from '../../common/decorators/current-admin-user.decorator';
import type { RequestAdminUser } from '../../common/decorators/current-admin-user.decorator';
import { LoyaltyService } from './loyalty.service';
import { CreateLoyaltyProgramDto } from './dto/create-loyalty-program.dto';
import { UpdateLoyaltyProgramDto } from './dto/update-loyalty-program.dto';
import { RedeemReceiptDto } from './dto/redeem-receipt.dto';
import { RedemptionPurpose } from './receipt-redemption.entity';

@Controller()
export class LoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  // ---------- Programas ----------

  @UseGuards(JwtAuthGuard)
  @Get('loyalty/programs')
  async findAllPrograms(@CurrentTenant() tenantId: string) {
    return this.loyaltyService.findAllPrograms(tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('loyalty/programs')
  async createProgram(@CurrentTenant() tenantId: string, @Body() dto: CreateLoyaltyProgramDto) {
    return this.loyaltyService.createProgram(tenantId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('loyalty/programs/:id')
  async updateProgram(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateLoyaltyProgramDto,
  ) {
    return this.loyaltyService.updateProgram(tenantId, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('loyalty/programs/:id')
  async deleteProgram(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    await this.loyaltyService.deleteProgram(tenantId, id);
    return { success: true };
  }

  // ---------- Resgate (usado pela tela "Verificar cupom") ----------

  @UseGuards(JwtAuthGuard)
  @Post('loyalty/redeem')
  async redeem(
    @CurrentTenant() tenantId: string,
    @CurrentAdminUser() staffUser: RequestAdminUser,
    @Body() dto: RedeemReceiptDto,
  ) {
    return this.loyaltyService.redeemForPurpose(
      tenantId,
      staffUser,
      dto.code,
      dto.purpose as RedemptionPurpose,
      { notes: dto.notes, loyaltyProgramId: dto.loyaltyProgramId },
    );
  }

  // ---------- Prêmios pendentes de entrega ----------

  @UseGuards(JwtAuthGuard)
  @Get('loyalty/rewards')
  async findPendingRewards(@CurrentTenant() tenantId: string, @Query('programId') programId?: string) {
    return this.loyaltyService.findPendingRewards(tenantId, programId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('loyalty/rewards/:id/fulfill')
  async fulfillReward(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @CurrentAdminUser() staffUser: RequestAdminUser,
  ) {
    return this.loyaltyService.fulfillReward(tenantId, id, staffUser);
  }

  // ---------- Visão do cliente (app do cardápio) ----------

  @Get('loyalty/public/:tenantId/programs')
  async findActiveProgramsForCustomer(
    @Param('tenantId') tenantId: string,
    @Query('locationId') locationId?: string,
  ) {
    return this.loyaltyService.findActiveProgramsForCustomer(tenantId, locationId ?? null);
  }

  // ---------- Histórico (aba "Fidelidade" dentro de Histórico, admin) ----------

  @UseGuards(JwtAuthGuard)
  @Get('loyalty/history')
  async getFidelityHistory(@CurrentTenant() tenantId: string) {
    return this.loyaltyService.getFidelityHistory(tenantId);
  }
}
