import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AdminUser } from '../auth/admin-user.entity';
import { canGrant, canGrantAll, isWildcardHolder } from '../../common/permissions/permission-matcher';
import { AccessContext } from './access-context';
import { AccessControlService } from './access-control.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { Permission } from './entities/permission.entity';
import { Role } from './entities/role.entity';
import {
  RESERVED_ROLE_SLUGS,
  SYSTEM_ROLES,
  SYSTEM_ROLE_ADMIN,
  legacyRoleFor,
} from './permissions.catalog';

const PG_UNIQUE_VIOLATION = '23505';

export interface RoleView {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isSystemDefault: boolean;
  permissions: string[];
  userCount: number;
  // O usuário logado pode editar/excluir este cargo? (a UI só reflete; o servidor revalida)
  editable: boolean;
  deletable: boolean;
}

export interface TeamMemberView {
  id: string;
  email: string;
  name: string | null;
  isSelf: boolean;
  role: { id: string; name: string; slug: string } | null;
  // Pode ter o cargo alterado por quem está logado?
  canChangeRole: boolean;
}

function slugify(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return base || 'cargo';
}

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(
    @InjectRepository(Role) private readonly roles: Repository<Role>,
    @InjectRepository(Permission) private readonly permissions: Repository<Permission>,
    @InjectRepository(AdminUser) private readonly users: Repository<AdminUser>,
    private readonly dataSource: DataSource,
    private readonly access: AccessControlService,
  ) {}

  // ───────── leitura ─────────

  async list(actor: AccessContext): Promise<RoleView[]> {
    const roles = await this.roles
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.permissions', 'p')
      .where('r.tenantId = :tenantId', { tenantId: actor.tenantId })
      .orderBy('r.isSystemDefault', 'DESC')
      .addOrderBy('r.name', 'ASC')
      .getMany();

    const counts = await this.users
      .createQueryBuilder('u')
      .select('u.roleId', 'roleId')
      .addSelect('COUNT(*)', 'total')
      .where('u.tenantId = :tenantId', { tenantId: actor.tenantId })
      .andWhere('u.roleId IS NOT NULL')
      .groupBy('u.roleId')
      .getRawMany<{ roleId: string; total: string }>();
    const countById = new Map(counts.map((c) => [c.roleId, Number(c.total)]));

    return roles.map((r) => this.toView(r, actor, countById.get(r.id) ?? 0));
  }

  // Catálogo agrupado por módulo; `grantable` diz se QUEM PEDIU pode conceder cada uma.
  async listPermissionsByModule(actor: AccessContext) {
    const all = await this.permissions
      .createQueryBuilder('p')
      .orderBy('p.module', 'ASC')
      .addOrderBy('p.slug', 'ASC')
      .getMany();

    const groups = new Map<string, Array<{ id: string; slug: string; name: string; description: string; grantable: boolean }>>();
    for (const p of all) {
      const list = groups.get(p.module) ?? [];
      list.push({
        id: p.id,
        slug: p.slug,
        name: p.name,
        description: p.description,
        grantable: canGrant(actor.permissions, p.slug),
      });
      groups.set(p.module, list);
    }
    // "Sistema" (wildcard) primeiro; o resto em ordem alfabética.
    return [...groups.entries()]
      .sort(([a], [b]) => (a === 'Sistema' ? -1 : b === 'Sistema' ? 1 : a.localeCompare(b, 'pt-BR')))
      .map(([module, permissions]) => ({ module, permissions }));
  }

  // ───────── escrita ─────────

  async create(actor: AccessContext, dto: CreateRoleDto): Promise<RoleView> {
    const slugs = this.normalizeSlugs(dto.permissions);
    this.assertCanGrant(actor, slugs);
    const perms = await this.resolvePermissions(slugs);

    try {
      const saved = await this.dataSource.transaction(async (em) => {
        const slug = await this.uniqueSlug(em, actor.tenantId, slugify(dto.name));
        const role = em.getRepository(Role).create({
          tenantId: actor.tenantId,
          name: dto.name,
          slug,
          description: dto.description ?? null,
          isSystemDefault: false,
          permissions: perms,
        });
        return em.getRepository(Role).save(role);
      });
      return this.toView(saved, actor, 0);
    } catch (err) {
      throw this.translateDbError(err);
    }
  }

  async update(actor: AccessContext, id: string, dto: UpdateRoleDto): Promise<RoleView> {
    const role = await this.findOwnRole(actor.tenantId, id);

    if (role.isSystemDefault && role.slug === SYSTEM_ROLE_ADMIN) {
      throw new ForbiddenException('O cargo Administrador não pode ser alterado.');
    }
    // Sem "*", ninguém altera o PRÓPRIO cargo (escalada horizontal/vertical).
    if (!isWildcardHolder(actor.permissions) && actor.roleId === role.id) {
      throw new ForbiddenException('Você não pode alterar o seu próprio cargo.');
    }
    // Nem mexer num cargo mais poderoso do que o seu.
    if (!canGrantAll(actor.permissions, role.permissions.map((p) => p.slug))) {
      throw new ForbiddenException('Você não pode alterar um cargo com privilégios que o seu não possui.');
    }

    let newPerms: Permission[] | undefined;
    if (dto.permissions !== undefined) {
      const slugs = this.normalizeSlugs(dto.permissions);
      this.assertCanGrant(actor, slugs);
      newPerms = await this.resolvePermissions(slugs);
    }

    try {
      const saved = await this.dataSource.transaction(async (em) => {
        const repo = em.getRepository(Role);
        // Cargos de sistema mantêm o nome (a UI e as notificações dependem dele).
        if (dto.name !== undefined && !role.isSystemDefault) role.name = dto.name;
        if (dto.description !== undefined) role.description = dto.description || null;
        if (newPerms) role.permissions = newPerms;
        return repo.save(role);
      });
      // Derruba o cache de quem usa este cargo: vale em segundos.
      this.access.invalidateRole(role.id);
      const userCount = await this.users
        .createQueryBuilder('u')
        .where('u.roleId = :roleId', { roleId: role.id })
        .getCount();
      return this.toView(saved, actor, userCount);
    } catch (err) {
      throw this.translateDbError(err);
    }
  }

  async remove(actor: AccessContext, id: string): Promise<void> {
    const role = await this.findOwnRole(actor.tenantId, id);
    if (role.isSystemDefault) {
      throw new ForbiddenException('Cargos padrão do sistema não podem ser excluídos.');
    }
    if (!canGrantAll(actor.permissions, role.permissions.map((p) => p.slug))) {
      throw new ForbiddenException('Você não pode excluir um cargo com privilégios que o seu não possui.');
    }
    const inUse = await this.users
      .createQueryBuilder('u')
      .where('u.roleId = :roleId', { roleId: role.id })
      .getCount();
    if (inUse > 0) {
      throw new ConflictException(
        `Este cargo está em uso por ${inUse} ${inUse === 1 ? 'usuário' : 'usuários'}. Reatribua-os antes de excluir.`,
      );
    }
    try {
      await this.roles
        .createQueryBuilder()
        .delete()
        .from(Role)
        .where('id = :id AND tenant_id = :tenantId', { id: role.id, tenantId: actor.tenantId })
        .execute();
    } catch (err) {
      throw this.translateDbError(err);
    }
    this.access.invalidateRole(role.id);
  }

  // ───────── equipe ─────────

  async listTeam(actor: AccessContext): Promise<TeamMemberView[]> {
    const users = await this.users
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.roleEntity', 'r')
      .leftJoinAndSelect('r.permissions', 'p')
      .where('u.tenantId = :tenantId', { tenantId: actor.tenantId })
      .orderBy('u.createdAt', 'ASC')
      .getMany();

    return users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      isSelf: u.id === actor.userId,
      role: u.roleEntity ? { id: u.roleEntity.id, name: u.roleEntity.name, slug: u.roleEntity.slug } : null,
      canChangeRole:
        u.id !== actor.userId &&
        (!u.roleEntity || canGrantAll(actor.permissions, u.roleEntity.permissions.map((p) => p.slug))),
    }));
  }

  async assignRole(actor: AccessContext, targetUserId: string, roleId: string): Promise<TeamMemberView> {
    // Nunca o próprio cargo (nem o CEO: evita rebaixar-se e trancar o estabelecimento).
    if (targetUserId === actor.userId) {
      throw new ForbiddenException('Você não pode alterar o seu próprio cargo.');
    }

    const target = await this.users
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.roleEntity', 'r')
      .leftJoinAndSelect('r.permissions', 'p')
      .where('u.id = :id AND u.tenantId = :tenantId', { id: targetUserId, tenantId: actor.tenantId })
      .getOne();
    // Outro estabelecimento ou inexistente: mesma resposta (não revela existência).
    if (!target) throw new NotFoundException('Usuário não encontrado.');

    // Quem tem privilégios maiores que os do ator não pode ser rebaixado/alterado por ele.
    if (target.roleEntity && !canGrantAll(actor.permissions, target.roleEntity.permissions.map((p) => p.slug))) {
      throw new ForbiddenException('Você não pode alterar o cargo de um usuário com privilégios maiores que os seus.');
    }

    const newRole = await this.findOwnRole(actor.tenantId, roleId);
    this.assertCanGrant(actor, newRole.permissions.map((p) => p.slug));

    await this.users
      .createQueryBuilder()
      .update(AdminUser)
      .set({ roleId: newRole.id, role: legacyRoleFor(newRole.slug, newRole.isSystemDefault) })
      .where('id = :id AND tenant_id = :tenantId', { id: target.id, tenantId: actor.tenantId })
      .execute();
    this.access.invalidateUser(target.id);

    return {
      id: target.id,
      email: target.email,
      name: target.name,
      isSelf: false,
      role: { id: newRole.id, name: newRole.name, slug: newRole.slug },
      canChangeRole: true,
    };
  }

  // ───────── provisionamento ─────────

  // Cria admin/manager/staff para um estabelecimento novo (usado no registro).
  // Devolve o cargo Admin para o primeiro usuário.
  async ensureSystemRoles(tenantId: string, em: EntityManager): Promise<Role> {
    const permRepo = em.getRepository(Permission);
    const roleRepo = em.getRepository(Role);
    const allPerms = await permRepo.find();
    const bySlug = new Map(allPerms.map((p) => [p.slug, p]));

    let admin: Role | null = null;
    for (const def of SYSTEM_ROLES) {
      const existing = await roleRepo
        .createQueryBuilder('r')
        .where('r.tenantId = :tenantId AND r.slug = :slug', { tenantId, slug: def.slug })
        .getOne();
      if (existing) {
        if (def.slug === SYSTEM_ROLE_ADMIN) admin = existing;
        continue;
      }
      const perms = def.permissions.map((s) => bySlug.get(s)).filter((p): p is Permission => Boolean(p));
      if (perms.length !== def.permissions.length) {
        throw new Error('Catálogo de permissões não sincronizado (rode as migrations e reinicie o backend).');
      }
      const saved = await roleRepo.save(
        roleRepo.create({
          tenantId,
          name: def.name,
          slug: def.slug,
          description: def.description,
          isSystemDefault: true,
          permissions: perms,
        }),
      );
      if (def.slug === SYSTEM_ROLE_ADMIN) admin = saved;
    }
    if (!admin) throw new Error('Cargo Administrador não foi criado.');
    return admin;
  }

  // ───────── helpers ─────────

  private toView(role: Role, actor: AccessContext, userCount: number): RoleView {
    const slugs = (role.permissions ?? []).map((p) => p.slug).sort();
    const isAdminRole = role.isSystemDefault && role.slug === SYSTEM_ROLE_ADMIN;
    const covered = canGrantAll(actor.permissions, slugs);
    const isOwnNonWildcard = !isWildcardHolder(actor.permissions) && actor.roleId === role.id;
    return {
      id: role.id,
      name: role.name,
      slug: role.slug,
      description: role.description,
      isSystemDefault: role.isSystemDefault,
      permissions: slugs,
      userCount,
      editable: !isAdminRole && covered && !isOwnNonWildcard,
      deletable: !role.isSystemDefault && covered,
    };
  }

  private normalizeSlugs(slugs: string[]): string[] {
    return Array.from(new Set(slugs));
  }

  // Regra central anti-escalada: só concede o que o próprio cargo cobre.
  private assertCanGrant(actor: AccessContext, slugs: string[]): void {
    const denied = slugs.filter((s) => !canGrant(actor.permissions, s));
    if (denied.length > 0) {
      throw new ForbiddenException(
        'Você não pode conceder permissões que o seu próprio cargo não possui.',
      );
    }
  }

  private async resolvePermissions(slugs: string[]): Promise<Permission[]> {
    if (slugs.length === 0) return [];
    const found = await this.permissions
      .createQueryBuilder('p')
      .where('p.slug IN (:...slugs)', { slugs })
      .getMany();
    if (found.length !== slugs.length) {
      throw new BadRequestException('Uma ou mais permissões informadas não existem.');
    }
    return found;
  }

  private async findOwnRole(tenantId: string, id: string): Promise<Role> {
    const role = await this.roles
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.permissions', 'p')
      .where('r.id = :id AND r.tenantId = :tenantId', { id, tenantId })
      .getOne();
    if (!role) throw new NotFoundException('Cargo não encontrado.');
    return role;
  }

  private async uniqueSlug(em: EntityManager, tenantId: string, base: string): Promise<string> {
    const repo = em.getRepository(Role);
    let candidate = RESERVED_ROLE_SLUGS.includes(base) ? `${base}-2` : base;
    for (let i = 2; i < 200; i++) {
      const exists = await repo
        .createQueryBuilder('r')
        .where('r.tenantId = :tenantId AND r.slug = :slug', { tenantId, slug: candidate })
        .getCount();
      if (!exists) return candidate;
      candidate = `${base}-${i}`;
    }
    throw new ConflictException('Não foi possível gerar um identificador único para o cargo.');
  }

  // Nunca devolve detalhes do banco ao cliente.
  private translateDbError(err: unknown): Error {
    if (err instanceof ForbiddenException || err instanceof ConflictException || err instanceof BadRequestException) {
      return err;
    }
    const code = (err as { code?: string; driverError?: { code?: string } })?.code
      ?? (err as { driverError?: { code?: string } })?.driverError?.code;
    if (code === PG_UNIQUE_VIOLATION) {
      return new ConflictException('Já existe um cargo com esse nome.');
    }
    // Detalhe técnico só no log do servidor — nunca na resposta HTTP.
    this.logger.error(`Erro inesperado em operação de cargos: ${(err as Error)?.message ?? err}`);
    return new ConflictException('Não foi possível concluir a operação.');
  }
}
