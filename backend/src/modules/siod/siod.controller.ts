import { Body, Controller, Delete, Get, Header, Put, Query } from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { SiodInsightsService } from './siod-insights.service';

// Aba "Entregas" (SIOD) do painel. Sempre escopada ao tenant do token (nunca
// aceita tenantId pela query/body). Dados de gestão: nunca vão para o cliente final.
//  - ver (visão geral, pedidos, parâmetros em leitura): analytics:view
//  - alterar/restaurar parâmetros: settings:manage
// Reaproveita permissões do catálogo (como a Calculadora): sem migration nem
// cargo novo, e cargos existentes continuam coerentes.
@Controller('siod')
export class SiodController {
  constructor(private readonly insights: SiodInsightsService) {}

  @RequirePermission('analytics:view')
  @Get('settings')
  @Header('Cache-Control', 'no-store')
  getSettings(@CurrentTenant() tenantId: string) {
    return this.insights.getSettings(tenantId);
  }

  @RequirePermission('settings:manage')
  @Put('settings')
  saveSettings(@CurrentTenant() tenantId: string, @Body() body: unknown) {
    return this.insights.saveSettings(tenantId, body);
  }

  @RequirePermission('settings:manage')
  @Delete('settings')
  resetSettings(@CurrentTenant() tenantId: string) {
    return this.insights.resetSettings(tenantId);
  }

  // GET /siod/overview?period=hora|dia|semana|mes|ano|5anos|custom&from=&to=&locationId=
  @RequirePermission('analytics:view')
  @Get('overview')
  @Header('Cache-Control', 'no-store')
  overview(
    @CurrentTenant() tenantId: string,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('locationId') locationId?: string,
  ) {
    return this.insights.overview(tenantId, period, from, to, locationId);
  }

  // GET /siod/orders?...&recordClass=&confidence=&provider=&page=&pageSize=
  @RequirePermission('analytics:view')
  @Get('orders')
  @Header('Cache-Control', 'no-store')
  orders(
    @CurrentTenant() tenantId: string,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('locationId') locationId?: string,
    @Query('recordClass') recordClass?: string,
    @Query('confidence') confidence?: string,
    @Query('provider') provider?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.insights.orders(tenantId, { period, from, to, locationId, recordClass, confidence, provider, page, pageSize });
  }
}
