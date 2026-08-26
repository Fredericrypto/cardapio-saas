import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { AdminUser } from './admin-user.entity';
import { Tenant } from '../tenants/tenant.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(AdminUser)
    private readonly adminUserRepo: Repository<AdminUser>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    private readonly jwtService: JwtService,
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

    const tenant = this.tenantRepo.create({
      name: dto.tenantName,
      slug: dto.tenantSlug,
    });
    await this.tenantRepo.save(tenant);

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const adminUser = this.adminUserRepo.create({
      tenantId: tenant.id,
      email: dto.email,
      passwordHash,
      name: dto.name,
      role: 'owner',
    });
    await this.adminUserRepo.save(adminUser);

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

  private buildAuthResponse(adminUser: AdminUser, tenant: Tenant) {
    const payload = {
      sub: adminUser.id,
      tenantId: adminUser.tenantId,
      email: adminUser.email,
      role: adminUser.role,
      type: 'admin' as const,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      admin: {
        id: adminUser.id,
        email: adminUser.email,
        name: adminUser.name,
        role: adminUser.role,
      },
      // Retorna o tenant (marca) inteiro sempre — endereço/horário/aberto
      // agora vivem em Location (uma ou mais lojas por marca), não aqui.
      tenant,
    };
  }
}
