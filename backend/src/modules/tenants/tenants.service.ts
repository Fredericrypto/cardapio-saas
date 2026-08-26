import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from './tenant.entity';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { encryptSecret } from '../../common/utils/encryption';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {}

  // Usado pelo painel admin (autenticado) — o dono vendo/editando o próprio estabelecimento.
  async findById(tenantId: string): Promise<Tenant> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Estabelecimento não encontrado.');
    }
    return tenant;
  }

  // Usado pelo cardápio público — o cliente final acessando via slug na URL, sem login.
  async findBySlug(slug: string): Promise<Tenant> {
    const tenant = await this.tenantRepo.findOne({
      where: { slug, isActive: true },
    });
    if (!tenant) {
      throw new NotFoundException('Estabelecimento não encontrado.');
    }
    return tenant;
  }

  async update(tenantId: string, dto: UpdateTenantDto): Promise<Tenant> {
    const tenant = await this.findById(tenantId);
    // Esses dois nunca passam pelo Object.assign genérico — precisam ser
    // criptografados antes de ir pro banco, e nomes de coluna diferentes
    // do nome no DTO (accessToken vs accessTokenEncrypted).
    const { mercadoPagoAccessToken, mercadoPagoWebhookSecret, ...rest } = dto;
    Object.assign(tenant, rest);

    if (mercadoPagoAccessToken !== undefined) {
      tenant.mercadoPagoAccessTokenEncrypted = mercadoPagoAccessToken
        ? encryptSecret(mercadoPagoAccessToken)
        : null;
    }
    if (mercadoPagoWebhookSecret !== undefined) {
      tenant.mercadoPagoWebhookSecretEncrypted = mercadoPagoWebhookSecret
        ? encryptSecret(mercadoPagoWebhookSecret)
        : null;
    }

    return this.tenantRepo.save(tenant);
  }

  async setLogo(tenantId: string, logoUrl: string): Promise<Tenant> {
    const tenant = await this.findById(tenantId);
    tenant.logoUrl = logoUrl;
    return this.tenantRepo.save(tenant);
  }

  async setCoverImage(tenantId: string, coverImageUrl: string): Promise<Tenant> {
    const tenant = await this.findById(tenantId);
    tenant.coverImageUrl = coverImageUrl;
    return this.tenantRepo.save(tenant);
  }
}
