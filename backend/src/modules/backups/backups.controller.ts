import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OwnerOnlyGuard } from './owner-only.guard';
import { BackupActor, RequestCtx } from './backup-request-context';
import type { BackupActorInfo, RequestContext } from './backup-request-context';
import { BackupsService } from './backups.service';
import { RestoreBackupDto, UpdateBackupSettingsDto } from './dto/backup-dtos';

// Todas as rotas: JWT + perfil "owner" (relido do banco a cada chamada).
// O tenant vem SEMPRE do ator autenticado — nunca de parâmetro/corpo.
@Controller('backups')
@UseGuards(JwtAuthGuard, OwnerOnlyGuard)
export class BackupsController {
  constructor(private readonly service: BackupsService) {}

  // Leituras: @SkipThrottle porque a tela consulta por polling enquanto há
  // backup em andamento (e o limite é por IP, que no Render é o do proxy).
  @Get()
  @SkipThrottle()
  overview(@BackupActor() actor: BackupActorInfo) {
    return this.service.getOverview(actor.tenantId);
  }

  @Get('audit-log')
  @SkipThrottle()
  auditLog(@BackupActor() actor: BackupActorInfo, @Query('limit') limit?: string) {
    return this.service.listAudit(actor.tenantId, limit ? Number(limit) : 30);
  }

  @Put('settings')
  updateSettings(
    @BackupActor() actor: BackupActorInfo,
    @RequestCtx() ctx: RequestContext,
    @Body() dto: UpdateBackupSettingsDto,
  ) {
    return this.service.updateSettings(actor.tenantId, dto, actor, ctx);
  }

  @Post()
  @HttpCode(202)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async createManual(@BackupActor() actor: BackupActorInfo, @RequestCtx() ctx: RequestContext) {
    const row = await this.service.createBackup(actor.tenantId, 'manual', actor, ctx);
    return { id: row.id, status: row.status };
  }

  @Get(':id/restore-preview')
  @SkipThrottle()
  restorePreview(@BackupActor() actor: BackupActorInfo, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getRestorePreview(actor.tenantId, id);
  }

  @Get(':id/download')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async download(
    @BackupActor() actor: BackupActorInfo,
    @RequestCtx() ctx: RequestContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { file, fileName } = await this.service.downloadBackup(actor.tenantId, id, actor, ctx);
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${fileName.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
      'Cache-Control': 'no-store',
      'Content-Length': String(file.length),
    });
    return new StreamableFile(file);
  }

  // Tentativas de senha limitadas (5/min) — além da própria senha, a rota exige
  // a palavra de segurança.
  @Post(':id/restore')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  restore(
    @BackupActor() actor: BackupActorInfo,
    @RequestCtx() ctx: RequestContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RestoreBackupDto,
  ) {
    return this.service.restoreBackup(actor.tenantId, id, actor, dto, ctx);
  }

  @Delete(':id')
  @HttpCode(204)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async remove(
    @BackupActor() actor: BackupActorInfo,
    @RequestCtx() ctx: RequestContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    await this.service.deleteBackup(actor.tenantId, id, actor, ctx);
  }
}
