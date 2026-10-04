import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { AnalyticsService } from './analytics.service';

// Aba "Análise" do painel — só admin autenticado, sempre escopado ao tenant
// do token (nunca aceita tenantId vindo da query).
@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  // GET /analytics?period=hora|dia|semana|mes|ano|5anos|custom&from=AAAA-MM-DD&to=AAAA-MM-DD&locationId=
  @Get()
  async get(
    @CurrentTenant() tenantId: string,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('locationId') locationId?: string,
  ) {
    return this.analytics.getAnalytics(tenantId, period, from, to, locationId);
  }
}
