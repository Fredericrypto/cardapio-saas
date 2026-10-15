import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AutoBadge, AutoBadgeInput, AutoBadgeProvider } from './product-badges.types';
import {
  DEFAULT_BEHAVIORAL_BADGE_CONFIG,
  computeBehavioralBadges,
  type BehavioralBadgeConfig,
  type ProductRatingStat,
  type ProductSalesStat,
} from './behavioral-badge-rules';

const DAY_MS = 24 * 60 * 60 * 1000;

interface SalesRow {
  product_id: string;
  units_window: string;
  orders_window: string;
  units_recent: string;
  units_previous: string;
}
interface RatingRow {
  product_id: string;
  review_count: string;
  rating_sum: string;
}

// Lê os números no banco (2 consultas agregadas por restaurante) e entrega para as
// regras puras. Só LEITURA. "Pedido válido" = mesma definição da aba Análise (não
// cancelado e não aguardando pagamento); não filtra deleted_at do pedido (o
// histórico faz soft-delete depois da retenção, mas a venda existiu). Produto
// excluído não entra (não existe mais no cardápio).
@Injectable()
export class BehavioralBadgeProvider implements AutoBadgeProvider {
  readonly id = 'behavioral';

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async compute({ tenantId, now }: AutoBadgeInput, config: BehavioralBadgeConfig = DEFAULT_BEHAVIORAL_BADGE_CONFIG): Promise<ReadonlyMap<string, readonly AutoBadge[]>> {
    const windowStart = new Date(now.getTime() - config.topOrdered.windowDays * DAY_MS);
    const recentStart = new Date(now.getTime() - config.trending.recentDays * DAY_MS);
    const previousStart = new Date(now.getTime() - 2 * config.trending.recentDays * DAY_MS);
    const earliest = windowStart < previousStart ? windowStart : previousStart;

    const [salesRows, ratingRows] = await Promise.all([
      this.ds.query<SalesRow[]>(
        `SELECT oi.product_id AS product_id,
                COALESCE(SUM(oi.quantity) FILTER (WHERE o.created_at >= $2), 0) AS units_window,
                COUNT(DISTINCT o.id) FILTER (WHERE o.created_at >= $2) AS orders_window,
                COALESCE(SUM(oi.quantity) FILTER (WHERE o.created_at >= $3), 0) AS units_recent,
                COALESCE(SUM(oi.quantity) FILTER (WHERE o.created_at >= $4 AND o.created_at < $3), 0) AS units_previous
           FROM orders o
           JOIN order_items oi ON oi.order_id = o.id
           JOIN products p ON p.id = oi.product_id AND p.tenant_id = o.tenant_id AND p.deleted_at IS NULL
          WHERE o.tenant_id = $1
            AND o.created_at >= $5
            AND o.status NOT IN ('cancelado', 'aguardando_pagamento')
          GROUP BY oi.product_id`,
        [tenantId, windowStart, recentStart, previousStart, earliest],
      ),
      this.ds.query<RatingRow[]>(
        `SELECT r.product_id AS product_id, COUNT(*) AS review_count, SUM(r.rating) AS rating_sum
           FROM reviews r
           JOIN products p ON p.id = r.product_id AND p.tenant_id = r.tenant_id AND p.deleted_at IS NULL
          WHERE r.tenant_id = $1 AND r.target_type = 'item' AND r.deleted_at IS NULL
          GROUP BY r.product_id`,
        [tenantId],
      ),
    ]);

    const sales: ProductSalesStat[] = salesRows.map((r) => ({
      productId: r.product_id,
      unitsWindow: Number(r.units_window),
      ordersWindow: Number(r.orders_window),
      unitsRecent: Number(r.units_recent),
      unitsPrevious: Number(r.units_previous),
    }));
    const ratings: ProductRatingStat[] = ratingRows.map((r) => ({
      productId: r.product_id,
      reviewCount: Number(r.review_count),
      ratingSum: Number(r.rating_sum),
    }));
    return computeBehavioralBadges(sales, ratings, config);
  }
}
