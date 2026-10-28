import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { Tenant } from './tenant.entity';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { encryptSecret } from '../../common/utils/encryption';
import { mpConfigError } from '../payments/mp-activation';
import { Product } from '../products/product.entity';
import {
  VITRINE_FALLBACK_PRODUCTS,
  buildVitrineSlides,
  parseStoredVitrine,
  validateVitrineSettings,
} from './vitrine-settings';
import type { VitrineProductRow, VitrineSettings, VitrineSlide } from './vitrine-settings';

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
    const { mercadoPagoAccessToken, mercadoPagoWebhookSecret, mercadoPagoPublicKey, vitrineSettings, ...rest } = dto;
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
    if (mercadoPagoPublicKey !== undefined) {
      tenant.mercadoPagoPublicKey = mercadoPagoPublicKey.trim() || null;
    }

    // Modo Vitrine: nunca passa pelo Object.assign genérico — a forma é validada aqui
    // (400 se inválida) e lista vazia volta ao padrão (null).
    if (vitrineSettings !== undefined) {
      if (vitrineSettings === null) {
        tenant.vitrineSettings = null;
      } else {
        const checked = validateVitrineSettings(vitrineSettings);
        if (!checked.ok) throw new BadRequestException(checked.error);
        tenant.vitrineSettings =
          checked.value.items.length > 0 ? (checked.value as unknown as Record<string, unknown>) : null;
      }
    }

    // Consistência da configuração do Mercado Pago: só valida quando ESTA
    // requisição mexeu em algum campo dele (assim restaurantes antigos, com
    // token e sem segredo, ainda conseguem salvar outras configurações).
    const touchedMercadoPago =
      mercadoPagoAccessToken !== undefined ||
      mercadoPagoWebhookSecret !== undefined ||
      mercadoPagoPublicKey !== undefined;
    if (touchedMercadoPago) {
      const configError = mpConfigError({
        hasAccessToken: Boolean(tenant.mercadoPagoAccessTokenEncrypted),
        hasWebhookSecret: Boolean(tenant.mercadoPagoWebhookSecretEncrypted),
        hasPublicKey: Boolean(tenant.mercadoPagoPublicKey),
      });
      if (configError) throw new BadRequestException(configError);
    }

    return this.tenantRepo.save(tenant);
  }

  // Modo Vitrine: resolve as REFERÊNCIAS salvas em slides prontos (nome/foto atuais).
  // Sempre filtrado pelo tenant do token: id de outro restaurante nunca resolve.
  // Produto removido (soft delete), indisponível ou sem foto some sozinho.
  async resolveVitrine(tenantId: string): Promise<{ name: string; logoUrl: string | null; slides: VitrineSlide[] }> {
    const tenant = await this.findById(tenantId);
    const settings: VitrineSettings | null = parseStoredVitrine(tenant.vitrineSettings);
    const products = this.tenantRepo.manager.getRepository(Product);
    const select = { id: true, name: true, imageUrl: true, images: true, isAvailable: true } as const;
    let rows: VitrineProductRow[] = [];
    if (settings) {
      const ids = settings.items.flatMap((i) => (i.k === 'product' ? [i.id] : []));
      if (ids.length > 0) {
        rows = await products.find({ where: { tenantId, id: In(ids), isAvailable: true }, select });
      }
    } else {
      rows = await products.find({
        where: { tenantId, isAvailable: true, imageUrl: Not(IsNull()) },
        order: { displayOrder: 'ASC', name: 'ASC' },
        take: VITRINE_FALLBACK_PRODUCTS,
        select,
      });
    }
    return {
      name: tenant.name,
      logoUrl: tenant.logoUrl,
      slides: buildVitrineSlides(settings, tenant.coverImageUrl, rows),
    };
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
