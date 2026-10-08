import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BackupAuditLog } from './backup-audit-log.entity';
import type { BackupAuditAction } from './backup-audit-log.entity';
import type { RequestContext } from './backup-request-context';

export interface AuditEntry {
  tenantId: string;
  action: BackupAuditAction;
  success?: boolean;
  userId?: string | null;
  userEmail?: string | null;
  userRole?: string | null;
  backupId?: string | null;
  ctx?: RequestContext | null;
  detail?: Record<string, unknown> | null;
}

@Injectable()
export class BackupAuditService {
  constructor(@InjectRepository(BackupAuditLog) private readonly repo: Repository<BackupAuditLog>) {}

  private build(e: AuditEntry): BackupAuditLog {
    return this.repo.create({
      tenantId: e.tenantId,
      action: e.action,
      success: e.success ?? true,
      userId: e.userId ?? null,
      userEmail: e.userEmail?.slice(0, 150) ?? null,
      userRole: e.userRole ?? null,
      backupId: e.backupId ?? null,
      ip: e.ctx?.ip ?? null,
      forwardedFor: e.ctx?.forwardedFor ?? null,
      userAgent: e.ctx?.userAgent ?? null,
      detail: e.detail ?? null,
    });
  }

  // Melhor esforço: uma falha de auditoria não derruba operações de rotina
  // (mas é sempre registrada no log do servidor).
  async log(e: AuditEntry): Promise<void> {
    try {
      await this.repo.save(this.build(e));
    } catch (err) {
      console.error('[backups] falha ao gravar auditoria', e.action, err);
    }
  }

  // Falha fechada: para ações sensíveis (iniciar restauração, baixar, excluir) —
  // se não der pra auditar, a ação NÃO acontece.
  async logStrict(e: AuditEntry): Promise<BackupAuditLog> {
    return this.repo.save(this.build(e));
  }

  list(tenantId: string, limit = 30): Promise<BackupAuditLog[]> {
    return this.repo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }
}
