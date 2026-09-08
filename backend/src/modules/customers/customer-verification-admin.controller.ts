import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentAdminUser } from '../../common/decorators/current-admin-user.decorator';
import type { RequestAdminUser } from '../../common/decorators/current-admin-user.decorator';
import { CustomerVerificationService } from './customer-verification.service';
import { RejectVerificationDto } from './dto/reject-verification.dto';

// Lado ADMIN do sistema de Cliente Verificado — nova aba "Verificações
// Pendentes" no painel. Tudo aqui atrás de JwtAuthGuard (admin do
// restaurante), nunca acessível pelo app do cliente.
@UseGuards(JwtAuthGuard)
@Controller('verifications')
export class CustomerVerificationAdminController {
  constructor(private readonly verificationService: CustomerVerificationService) {}

  @Get('pending')
  async findPending(@CurrentTenant() tenantId: string) {
    return this.verificationService.findPending(tenantId);
  }

  @Get('stats')
  async stats(@CurrentTenant() tenantId: string) {
    return this.verificationService.countStats(tenantId);
  }

  @Post(':customerId/approve')
  async approve(
    @CurrentTenant() tenantId: string,
    @CurrentAdminUser() adminUser: RequestAdminUser,
    @Param('customerId') customerId: string,
  ) {
    return this.verificationService.approve(tenantId, customerId, adminUser.userId);
  }

  @Post(':customerId/reject')
  async reject(
    @CurrentTenant() tenantId: string,
    @CurrentAdminUser() adminUser: RequestAdminUser,
    @Param('customerId') customerId: string,
    @Body() dto: RejectVerificationDto,
  ) {
    return this.verificationService.reject(tenantId, customerId, adminUser.userId, dto.reason);
  }
}
