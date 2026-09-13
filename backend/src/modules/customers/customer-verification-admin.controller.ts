import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentAdminUser } from '../../common/decorators/current-admin-user.decorator';
import type { RequestAdminUser } from '../../common/decorators/current-admin-user.decorator';
import { CustomerVerificationService } from './customer-verification.service';
import { RejectVerificationDto } from './dto/reject-verification.dto';
import { RevokeVerificationDto } from './dto/revoke-verification.dto';
import { SuspendCustomerDto } from './dto/suspend-customer.dto';

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

  // Ferramenta de consulta — "esse cliente é REALMENTE verificado?"
  // Aceita id, e-mail ou telefone via query string (?q=).
  @Get('check')
  async checkIntegrity(@CurrentTenant() tenantId: string, @Query('q') query: string) {
    return this.verificationService.checkIntegrity(tenantId, query);
  }

  @Post(':customerId/revoke')
  async revoke(
    @CurrentTenant() tenantId: string,
    @CurrentAdminUser() adminUser: RequestAdminUser,
    @Param('customerId') customerId: string,
    @Body() dto: RevokeVerificationDto,
  ) {
    return this.verificationService.revoke(tenantId, customerId, adminUser.userId, dto.reason);
  }

  @Post(':customerId/suspend')
  async suspend(
    @CurrentTenant() tenantId: string,
    @CurrentAdminUser() adminUser: RequestAdminUser,
    @Param('customerId') customerId: string,
    @Body() dto: SuspendCustomerDto,
  ) {
    return this.verificationService.suspend(tenantId, customerId, adminUser.userId, dto.reason);
  }

  @Post(':customerId/unsuspend')
  async unsuspend(@CurrentTenant() tenantId: string, @Param('customerId') customerId: string) {
    return this.verificationService.unsuspend(tenantId, customerId);
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
