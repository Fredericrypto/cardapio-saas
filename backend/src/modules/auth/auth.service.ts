import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { AdminUser } from './admin-user.entity';
import { Tenant } from '../tenants/tenant.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RolesService } from '../roles/roles.service';
import { AccessControlService } from '../roles/access-control.service';
import { AccessContext } from '../roles/access-context';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(AdminUser)
    private readonly adminUserRepo: Repository<AdminUser>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    private readonly jwtService: JwtService,
    private readonly dataSource: DataSource,
    private readonly rolesService: RolesService,
    private readonly access: AccessControlService,
  ) {}

  // Cria o tenant (estabelecimento) e o primeiro admin (dono) juntos.
  // É o fluxo de "novo cliente do SaaS se cadastrando".
  async register(dto: RegisterDto) {
    const existingTenant = await this.tenantRepo.findOne({
      where: { slug: dto.tenantSlug },
    });
    if (existingTenant) {
      throw new ConflictException('Esse slug já está em uso por outro estabelecimento.');
    }

    const existingUser = await this.adminUserRepo.findOne({
      where: { email: dto.email },
    });
    if (existingUser) {
      throw new ConflictException('Esse e-mail já está cadastrado.');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    // Tenant + cargos de sistema + primeiro usuário (Administrador) em UMA
    // transação: nunca sobra um estabelecimento sem dono ou sem cargos.
    const { tenant, adminUser } = await this.dataSource.transaction(async (em) => {
      const tenant = await em.getRepository(Tenant).save(
        em.getRepository(Tenant).create({ name: dto.tenantName, slug: dto.tenantSlug }),
      );
      const adminRole = await this.rolesService.ensureSystemRoles(tenant.id, em);
      const adminUser = await em.getRepository(AdminUser).save(
        em.getRepository(AdminUser).create({
          tenantId: tenant.id,
          email: dto.email,
          passwordHash,
          name: dto.name,
          role: 'owner',
          roleId: adminRole.id,
        }),
      );
      return { tenant, adminUser };
    });

    return this.buildAuthResponse(adminUser, tenant);
  }

  async login(dto: LoginDto) {
    const adminUser = await this.adminUserRepo.findOne({
      where: { email: dto.email },
      relations: { tenant: true },
    });

    // Mensagem genérica de propósito: não revelar se foi o e-mail ou a senha que errou.
    if (!adminUser) {
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }

    const passwordMatches = await bcrypt.compare(dto.password, adminUser.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }

    return this.buildAuthResponse(adminUser, adminUser.tenant);
  }

  // Dados de sessão atuais (cargo + permissões) — o painel usa para montar o
  // menu e esconder botões. É só reflexo: a autorização real é no servidor.
  async me(userId: string) {
    const ctx = await this.access.getContext(userId);
    if (!ctx) throw new UnauthorizedException('Sessão inválida. Entre novamente.');
    return this.adminView(ctx);
  }

  private adminView(ctx: AccessContext) {
    return {
      id: ctx.userId,
      email: ctx.email,
      name: ctx.name,
      role: ctx.role,
      roleId: ctx.roleId,
      roleSlug: ctx.roleSlug,
      roleName: ctx.roleName,
      permissions: ctx.permissions,
    };
  }

  private async buildAuthResponse(adminUser: AdminUser, tenant: Tenant) {
    // O token carrega só identidade. Cargo/permissões são resolvidos no
    // servidor a cada requisição (ver JwtStrategy) — por isso não vão no JWT.
    const payload = {
      sub: adminUser.id,
      tenantId: adminUser.tenantId,
      email: adminUser.email,
      role: adminUser.role,
      type: 'admin' as const,
    };

    this.access.invalidateUser(adminUser.id);
    const ctx = await this.access.getContext(adminUser.id);
    if (!ctx) throw new UnauthorizedException('Sessão inválida. Entre novamente.');

    return {
      accessToken: this.jwtService.sign(payload),
      admin: this.adminView(ctx),
      // Retorna o tenant (marca) inteiro sempre — endereço/horário/aberto
      // agora vivem em Location (uma ou mais lojas por marca), não aqui.
      tenant,
    };
  }
}
