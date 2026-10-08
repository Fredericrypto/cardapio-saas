import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminUser } from '../auth/admin-user.entity';
import { BackupAuditService } from './backup-audit.service';
import { extractRequestContext } from './backup-request-context';

// Só o ADMINISTRADOR (role 'owner', exibido como "Admin" no painel) acessa
// backups. O perfil é RELIDO DO BANCO a cada requisição — não do token JWT —
// então um dono rebaixado/removido perde o acesso na hora, mesmo com token
// ainda válido. Usar depois do JwtAuthGuard.
@Injectable()
export class OwnerOnlyGuard implements CanActivate {
  constructor(
    @InjectRepository(AdminUser) private readonly users: Repository<AdminUser>,
    private readonly audit: BackupAuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const tokenUser = req.user as { userId?: string; tenantId?: string; email?: string; role?: string } | undefined;
    if (!tokenUser?.userId || !tokenUser.tenantId) throw new ForbiddenException('Acesso negado.');

    const row = await this.users.findOne({ where: { id: tokenUser.userId } });
    if (!row || row.tenantId !== tokenUser.tenantId || row.role !== 'owner') {
      await this.audit.log({
        tenantId: tokenUser.tenantId,
        action: 'forbidden_access',
        success: false,
        userId: tokenUser.userId,
        userEmail: tokenUser.email ?? null,
        userRole: row?.role ?? tokenUser.role ?? null,
        ctx: extractRequestContext(req),
        detail: { method: req.method, path: String(req.originalUrl ?? req.url ?? '').split('?')[0] },
      });
      throw new ForbiddenException('Apenas o administrador (dono) pode acessar backups e restaurações.');
    }
    req.backupActor = {
      userId: row.id,
      tenantId: row.tenantId,
      email: row.email,
      name: row.name,
      role: row.role,
    };
    return true;
  }
}
