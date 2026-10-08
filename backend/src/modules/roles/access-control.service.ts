import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminUser } from '../auth/admin-user.entity';
import { WILDCARD } from '../../common/permissions/permission-matcher';
import { AccessContext } from './access-context';

interface CacheEntry {
  ctx: AccessContext;
  expiresAt: number;
}

// Resolve, A PARTIR DO BANCO, o cargo e as permissões de um usuário do painel.
// É isto (e não o corpo/headers/claims do token) que alimenta request.user:
//  - mudar o cargo de alguém vale em segundos, mesmo com o JWT de 7 dias em mãos;
//  - usuário excluído (soft delete) perde o acesso na hora;
//  - o cliente não consegue injetar roles/permissions de jeito nenhum.
// Cache em memória (TTL curto) — o backend roda em UMA instância; se um dia
// houver várias, trocar o Map por Redis mantendo esta mesma interface.
@Injectable()
export class AccessControlService {
  private static readonly TTL_MS = 30_000;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(@InjectRepository(AdminUser) private readonly users: Repository<AdminUser>) {}

  async getContext(userId: string): Promise<AccessContext | null> {
    const hit = this.cache.get(userId);
    if (hit && hit.expiresAt > Date.now()) return hit.ctx;

    // Query parametrizada (Prepared Statement) — nenhum valor concatenado.
    const user = await this.users
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.roleEntity', 'r')
      .leftJoinAndSelect('r.permissions', 'p')
      .where('u.id = :userId', { userId })
      .getOne();
    if (!user) {
      this.cache.delete(userId);
      return null;
    }

    let permissions: string[];
    if (user.roleEntity) {
      permissions = user.roleEntity.permissions.map((perm) => perm.slug);
    } else {
      // Usuário sem cargo (não migrado): falha FECHADO. Única exceção: o dono
      // legado, para nunca trancar o estabelecimento para fora.
      permissions = user.role === 'owner' ? [WILDCARD] : [];
    }

    const ctx: AccessContext = {
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      name: user.name,
      role: user.role,
      roleId: user.roleEntity?.id ?? null,
      roleSlug: user.roleEntity?.slug ?? null,
      roleName: user.roleEntity?.name ?? null,
      permissions: Array.from(new Set(permissions)).sort(),
    };
    this.cache.set(userId, { ctx, expiresAt: Date.now() + AccessControlService.TTL_MS });
    return ctx;
  }

  invalidateUser(userId: string): void {
    this.cache.delete(userId);
  }

  // Cargo editado/excluído: derruba o cache de todos que o usam.
  invalidateRole(roleId: string): void {
    for (const [key, entry] of this.cache) {
      if (entry.ctx.roleId === roleId) this.cache.delete(key);
    }
  }

  invalidateTenant(tenantId: string): void {
    for (const [key, entry] of this.cache) {
      if (entry.ctx.tenantId === tenantId) this.cache.delete(key);
    }
  }
}
