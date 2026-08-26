import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { HistoryService } from './history.service';

class SetFlaggedDto {
  @IsBoolean()
  flagged: boolean;
}

class SearchArchiveDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;
}

// Propositalmente NÃO existe nenhum endpoint DELETE aqui. Histórico só
// desaparece pelo cron automático de 30 dias (HistoryService.purgeExpiredHistory) —
// nunca por ação manual de um funcionário, pra não abrir brecha de fraude
// (apagar um cupom incômodo antes do dono ver).
@UseGuards(JwtAuthGuard)
@Controller('history')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @Get()
  findHistory(@CurrentTenant() tenantId: string) {
    return this.historyService.findHistory(tenantId);
  }

  // Busca no arquivo — inclui cupons já escondidos da tela normal (mais
  // de 30 dias). Exige nome do cliente OU intervalo de datas.
  @Get('search')
  searchArchive(@CurrentTenant() tenantId: string, @Query() dto: SearchArchiveDto) {
    return this.historyService.searchArchive(tenantId, dto);
  }

  @Patch('session/:id/flag')
  setSessionFlagged(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: SetFlaggedDto,
  ) {
    return this.historyService.setSessionFlagged(tenantId, id, dto.flagged);
  }

  @Patch('order/:id/flag')
  setOrderFlagged(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: SetFlaggedDto,
  ) {
    return this.historyService.setOrderFlagged(tenantId, id, dto.flagged);
  }
}
