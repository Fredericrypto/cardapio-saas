import { Injectable, Logger } from '@nestjs/common';
import type { AutoBadge, AutoBadgeProvider } from './product-badges.types';
import { BehavioralBadgeProvider } from './behavioral-badge.provider';

// Validade do cálculo por restaurante (1 min). O cardápio público já tem cache próprio
// (TenantCache, teto de 2 min); aqui só se evita recalcular em rajada (ex.: o painel
// admin e o público lendo juntos). Cache em memória do processo, só códigos de selo.
export const AUTO_BADGES_TTL_MS = 60 * 1000;
const MAX_CACHED_TENANTS = 500;

type BadgeMap = ReadonlyMap<string, readonly AutoBadge[]>;

@Injectable()
export class ProductBadgesService {
  private readonly logger = new Logger(ProductBadgesService.name);
  private readonly providers: readonly AutoBadgeProvider[];
  private readonly cache = new Map<string, { expiresAt: number; value: Promise<BadgeMap> }>();

  constructor(behavioral: BehavioralBadgeProvider) {
    // SIOD (futuro): injetar o SiodBadgeProvider e acrescentar aqui. Nada mais muda.
    this.providers = [behavioral];
  }

  private async load(tenantId: string): Promise<BadgeMap> {
    const now = new Date();
    const merged = new Map<string, AutoBadge[]>();
    for (const provider of this.providers) {
      const part = await provider.compute({ tenantId, now });
      for (const [productId, badges] of part) {
        merged.set(productId, [...(merged.get(productId) ?? []), ...badges]);
      }
    }
    return merged;
  }

  private forTenant(tenantId: string): Promise<BadgeMap> {
    const nowMs = Date.now();
    const hit = this.cache.get(tenantId);
    if (hit && hit.expiresAt > nowMs) return hit.value;

    if (this.cache.size >= MAX_CACHED_TENANTS) this.cache.clear();
    const value = this.load(tenantId);
    this.cache.set(tenantId, { expiresAt: nowMs + AUTO_BADGES_TTL_MS, value });
    // Falha não fica em cache: a próxima leitura tenta de novo.
    value.catch(() => {
      if (this.cache.get(tenantId)?.value === value) this.cache.delete(tenantId);
    });
    return value;
  }

  // Anexa `autoBadges` a cada produto. Produto indisponível nunca recebe selo
  // automático. Se o cálculo falhar, o cardápio continua funcionando (sem selos).
  async withAutoBadges<T extends { id: string; isAvailable: boolean }>(
    tenantId: string,
    products: readonly T[],
  ): Promise<Array<T & { autoBadges: AutoBadge[] }>> {
    let map: BadgeMap = new Map();
    try {
      map = await this.forTenant(tenantId);
    } catch (error) {
      this.logger.warn(`Selos automáticos indisponíveis (${tenantId}): ${error instanceof Error ? error.message : String(error)}`);
    }
    return products.map((p) => Object.assign(p, { autoBadges: p.isAvailable ? [...(map.get(p.id) ?? [])] : [] }));
  }
}
