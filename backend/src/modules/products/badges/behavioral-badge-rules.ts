// Regras dos selos COMPORTAMENTAIS — funções PURAS, determinísticas e auditáveis.
// Sem IA, sem pesos, sem aleatoriedade: o mesmo conjunto de números sempre dá o
// mesmo resultado (desempates explícitos). Toda comparação é feita em INTEIROS
// (nada de float), como no resto do projeto.
//
// Regras (valores em DEFAULT_BEHAVIORAL_BADGE_CONFIG):
//  top_ordered       — entre os produtos do catálogo, os N com mais UNIDADES vendidas
//                      nos últimos `windowDays` dias, desde que tenham pelo menos
//                      `minUnits` unidades e `minOrders` pedidos distintos.
//                      Ordem: unidades (desc), pedidos (desc), id (asc).
//  customer_favorite — média das avaliações do item >= `minAverage` com pelo menos
//                      `minReviews` avaliações (todas, de todas as lojas).
//  trending          — unidades nos últimos `recentDays` dias vs. nos `recentDays`
//                      anteriores: crescimento >= `minGrowthPercent`%, com volume mínimo
//                      nos dois períodos (evita "crescer de 1 para 3"). Os N maiores
//                      ganhos absolutos. Ordem: ganho (desc), recentes (desc), id (asc).
// Só pedidos válidos entram (fora cancelado e aguardando pagamento — mesma definição
// da aba Análise). Pouco dado = nenhum selo (os mínimos são o guarda-corpo).

import type { AutoBadge, BehavioralBadgeCode } from './product-badges.types';

export interface BehavioralBadgeConfig {
  topOrdered: { windowDays: number; topN: number; minUnits: number; minOrders: number };
  customerFavorite: { minAverage: number; minReviews: number };
  trending: { recentDays: number; minRecentUnits: number; minPreviousUnits: number; minGrowthPercent: number; topN: number };
}

export const DEFAULT_BEHAVIORAL_BADGE_CONFIG: BehavioralBadgeConfig = {
  topOrdered: { windowDays: 30, topN: 3, minUnits: 10, minOrders: 5 },
  customerFavorite: { minAverage: 4.8, minReviews: 10 },
  trending: { recentDays: 7, minRecentUnits: 8, minPreviousUnits: 4, minGrowthPercent: 50, topN: 3 },
};

export interface ProductSalesStat {
  productId: string;
  unitsWindow: number; // unidades nos últimos topOrdered.windowDays
  ordersWindow: number; // pedidos distintos na mesma janela
  unitsRecent: number; // unidades nos últimos trending.recentDays
  unitsPrevious: number; // unidades nos trending.recentDays anteriores a esses
}

export interface ProductRatingStat {
  productId: string;
  reviewCount: number;
  ratingSum: number; // soma das notas (1..5)
}

// Ordem de exibição entre selos automáticos (o app mostra os primeiros).
export const BEHAVIORAL_PRIORITY: readonly BehavioralBadgeCode[] = ['top_ordered', 'customer_favorite', 'trending'];

const byIdAsc = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function rankTopOrdered(sales: readonly ProductSalesStat[], cfg: BehavioralBadgeConfig['topOrdered']): string[] {
  return sales
    .filter((s) => s.unitsWindow >= cfg.minUnits && s.ordersWindow >= cfg.minOrders)
    .sort((a, b) => b.unitsWindow - a.unitsWindow || b.ordersWindow - a.ordersWindow || byIdAsc(a.productId, b.productId))
    .slice(0, cfg.topN)
    .map((s) => s.productId);
}

export function isCustomerFavorite(stat: ProductRatingStat, cfg: BehavioralBadgeConfig['customerFavorite']): boolean {
  if (stat.reviewCount < cfg.minReviews || stat.reviewCount <= 0) return false;
  // média >= minAverage  <=>  soma*100 >= contagem*round(minAverage*100)  (inteiros)
  return stat.ratingSum * 100 >= stat.reviewCount * Math.round(cfg.minAverage * 100);
}

export function rankTrending(sales: readonly ProductSalesStat[], cfg: BehavioralBadgeConfig['trending']): string[] {
  return sales
    .filter(
      (s) =>
        s.unitsRecent >= cfg.minRecentUnits &&
        s.unitsPrevious >= cfg.minPreviousUnits &&
        s.unitsRecent * 100 >= s.unitsPrevious * (100 + cfg.minGrowthPercent),
    )
    .sort(
      (a, b) =>
        b.unitsRecent - b.unitsPrevious - (a.unitsRecent - a.unitsPrevious) ||
        b.unitsRecent - a.unitsRecent ||
        byIdAsc(a.productId, b.productId),
    )
    .slice(0, cfg.topN)
    .map((s) => s.productId);
}

export function computeBehavioralBadges(
  sales: readonly ProductSalesStat[],
  ratings: readonly ProductRatingStat[],
  config: BehavioralBadgeConfig = DEFAULT_BEHAVIORAL_BADGE_CONFIG,
): Map<string, AutoBadge[]> {
  const earned = new Map<string, Set<BehavioralBadgeCode>>();
  const grant = (productId: string, code: BehavioralBadgeCode): void => {
    const set = earned.get(productId) ?? new Set<BehavioralBadgeCode>();
    set.add(code);
    earned.set(productId, set);
  };

  for (const id of rankTopOrdered(sales, config.topOrdered)) grant(id, 'top_ordered');
  for (const r of ratings) if (isCustomerFavorite(r, config.customerFavorite)) grant(r.productId, 'customer_favorite');
  for (const id of rankTrending(sales, config.trending)) grant(id, 'trending');

  const result = new Map<string, AutoBadge[]>();
  for (const [productId, codes] of earned) {
    result.set(
      productId,
      BEHAVIORAL_PRIORITY.filter((code) => codes.has(code)).map((code): AutoBadge => ({ kind: 'behavioral', code })),
    );
  }
  return result;
}
