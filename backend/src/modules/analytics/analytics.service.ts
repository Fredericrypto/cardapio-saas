import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Customer } from '../customers/customer.entity';
import { CustomerVerificationService } from '../customers/customer-verification.service';
import { ANALYTICS_TZ, resolveRange } from './analytics.range';
import { buildForecast, classifyMenu } from './analytics.math';
import type {
  Analytics,
  AnalyticsRange,
  CashOps,
  Crm,
  FinancialParams,
  Kpis,
  Losses,
  MenuItemStat,
  SeriesPoint,
} from './analytics.types';

const r2 = (v: unknown): number => Math.round((Number(v) || 0) * 100) / 100;
const pct = (num: number, den: number): number | null => (den > 0 ? r2((num / den) * 100) : null);

// Pedido "válido" = venda de verdade (não cancelado e não aguardando pagamento).
// "Abandonado" = cancelado com pagamento que falhou (Pix expirado/recusado):
// nunca virou venda, então não entra no bruto nem nas perdas.
//
// IMPORTANTE: NÃO filtra `deleted_at` — o histórico faz soft-delete dos pedidos
// depois do prazo de retenção, mas os dados financeiros continuam no banco; sem
// incluí-los, mês/ano/5 anos ficariam errados.
//
// Parâmetros: $1 tenant, $2 from, $3 to, $4 location (ou null), $5 cmv%, $6 taxa
// cartão %, $7 taxa pix %, $8 imposto %.
const BASE_CTE = `
WITH priced AS (
  SELECT
    o.id, o.created_at, o.order_type, o.status, o.customer_id, o.table_participant_id,
    o.discount_amount, o.cancel_reason,
    COALESCE(i.items_total, 0) AS items_total,
    COALESCE(i.cogs, 0) AS cogs,
    COALESCE(i.real_sales, 0) AS real_sales,
    (o.status NOT IN ('cancelado', 'aguardando_pagamento')) AS is_valid,
    (o.status = 'cancelado' AND o.payment_status = 'falhou') AS is_abandoned,
    CASE COALESCE(NULLIF(o.payment_method, 'indefinido'), ts.payment_method)
      WHEN 'cartao' THEN ROUND(GREATEST(COALESCE(i.items_total,0) - o.discount_amount - o.cashback_used, 0) * $6::numeric / 100, 2)
      WHEN 'pix'    THEN ROUND(GREATEST(COALESCE(i.items_total,0) - o.discount_amount - o.cashback_used, 0) * $7::numeric / 100, 2)
      ELSE 0
    END AS fee,
    ROUND(GREATEST(COALESCE(i.items_total,0) - o.discount_amount, 0) * $8::numeric / 100, 2) AS tax
  FROM orders o
  LEFT JOIN table_sessions ts ON ts.id = o.table_session_id
  LEFT JOIN LATERAL (
    SELECT
      SUM(oi.subtotal) AS items_total,
      SUM(oi.quantity * COALESCE(oi.unit_cost, p.cost_price, oi.unit_price * $5::numeric / 100)) AS cogs,
      SUM(CASE WHEN COALESCE(oi.unit_cost, p.cost_price) IS NOT NULL THEN oi.subtotal ELSE 0 END) AS real_sales
    FROM order_items oi
    LEFT JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = o.id
  ) i ON TRUE
  WHERE o.tenant_id = $1
    AND o.created_at >= $2 AND o.created_at < $3
    AND ($4::uuid IS NULL OR o.location_id = $4)
)`;

type Params = [string, string, string, string | null, number, number, number, number];

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
    private readonly verification: CustomerVerificationService,
  ) {}

  async getFinancialParams(tenantId: string): Promise<FinancialParams> {
    const rows: Array<Record<string, string>> = await this.ds.query(
      `SELECT default_cmv_percent, card_fee_percent, pix_fee_percent, tax_percent FROM tenants WHERE id = $1`,
      [tenantId],
    );
    const t = rows[0] ?? {};
    return {
      defaultCmvPercent: Number(t.default_cmv_percent ?? 30),
      cardFeePercent: Number(t.card_fee_percent ?? 0),
      pixFeePercent: Number(t.pix_fee_percent ?? 0),
      taxPercent: Number(t.tax_percent ?? 0),
    };
  }

  async getAnalytics(
    tenantId: string,
    period?: string,
    from?: string,
    to?: string,
    locationId?: string | null,
  ): Promise<Analytics> {
    const range = resolveRange(period, from, to);
    const params = await this.getFinancialParams(tenantId);
    const p: Params = [
      tenantId,
      range.from,
      range.to,
      locationId || null,
      params.defaultCmvPercent,
      params.cardFeePercent,
      params.pixFeePercent,
      params.taxPercent,
    ];

    const [kpiBundle, series, products, heatmap, channels, cash, crm, bottom] = await Promise.all([
      this.queryKpisAndLosses(p),
      this.querySeries(p, range),
      this.queryProducts(p),
      this.queryHeatmap(p),
      this.queryChannels(p),
      this.queryCash(p),
      this.queryCrm(p),
      this.queryBottomProducts(p),
    ]);

    const { kpis, losses } = kpiBundle;
    kpis.cashbackRedeemed = cash.cashbackRedeemed;
    kpis.averageTicketPerCustomer =
      crm.customersServed > 0 ? r2((kpis.grossRevenue - kpis.cancellations - kpis.discounts) / crm.customersServed) : null;

    const forecast = buildForecast(series, range.granularity);
    const matrix = classifyMenu(products);

    const ranked = [...products].sort((a, b) => b.units - a.units || b.revenue - a.revenue);
    const notes = [
      'Valores em R$ com 2 casas. Fuso: America/Sao_Paulo (Brasília).',
      'Faturamento bruto = itens dos pedidos (inclui os cancelados). Líquido = bruto − cupons − cancelamentos − taxas de pagamento − impostos. Gorjeta e taxa de entrega não entram.',
      'Cashback resgatado é forma de pagamento: não é deduzido da receita líquida (aparece em Conciliação).',
      `CMV: custo real do produto quando cadastrado; senão estimativa de ${params.defaultCmvPercent}% do preço. Cobertura de custo real nas vendas: ${kpis.cmvRealCoveragePercent}%.`,
      'Taxas de cartão/Pix e imposto usam os percentuais configurados em "Parâmetros financeiros" (0% = não deduz).',
      'Pedidos com cobrança não concluída (Pix expirado/recusado) não contam como venda nem como perda.',
      'Estorno por prato e sangria só têm dados após os lançamentos no sistema ("Sem dados" até lá).',
      'Clientes novos/recorrentes consideram só clientes identificados (com conta); visitantes entram apenas no total atendido.',
    ];

    return {
      range,
      params,
      kpis,
      losses,
      cash,
      crm,
      series: [...series, ...(forecast?.points ?? [])],
      forecast: forecast?.forecast ?? null,
      topProducts: ranked.slice(0, 10),
      bottomProducts: bottom,
      matrix,
      heatmap,
      channels,
      notes,
    };
  }

  // ---------------------------------------------------------------- KPIs
  private async queryKpisAndLosses(p: Params): Promise<{ kpis: Kpis; losses: Losses }> {
    const [agg]: Array<Record<string, string>> = await this.ds.query(
      `${BASE_CTE}
       SELECT
         COALESCE(SUM(items_total) FILTER (WHERE (is_valid OR (status = 'cancelado' AND NOT is_abandoned))), 0) AS gross,
         COALESCE(SUM(items_total) FILTER (WHERE status = 'cancelado' AND NOT is_abandoned), 0) AS canc_value,
         COUNT(*) FILTER (WHERE status = 'cancelado' AND NOT is_abandoned) AS canc_orders,
         COUNT(*) FILTER (WHERE is_abandoned) AS abandoned,
         COALESCE(SUM(discount_amount) FILTER (WHERE is_valid), 0) AS discounts,
         COALESCE(SUM(fee) FILTER (WHERE is_valid), 0) AS fees,
         COALESCE(SUM(tax) FILTER (WHERE is_valid), 0) AS taxes,
         COALESCE(SUM(cogs) FILTER (WHERE is_valid), 0) AS cogs,
         COALESCE(SUM(real_sales) FILTER (WHERE is_valid), 0) AS real_sales,
         COALESCE(SUM(items_total) FILTER (WHERE is_valid), 0) AS valid_items,
         COUNT(*) FILTER (WHERE is_valid) AS orders
       FROM priced`,
      p,
    );
    const reasons: Array<Record<string, string>> = await this.ds.query(
      `${BASE_CTE}
       SELECT COALESCE(NULLIF(TRIM(cancel_reason), ''), 'Sem motivo registrado') AS reason,
              COUNT(*) AS orders, COALESCE(SUM(items_total), 0) AS value
       FROM priced
       WHERE status = 'cancelado' AND NOT is_abandoned
       GROUP BY 1 ORDER BY value DESC, orders DESC`,
      p,
    );

    const gross = r2(agg.gross);
    const cancellations = r2(agg.canc_value);
    const discounts = r2(agg.discounts);
    const paymentFees = r2(agg.fees);
    const taxes = r2(agg.taxes);
    const cogs = r2(agg.cogs);
    const orders = Number(agg.orders) || 0;
    const validItems = Number(agg.valid_items) || 0;
    const netRevenue = r2(gross - cancellations - discounts - paymentFees - taxes);
    const grossProfit = r2(netRevenue - cogs);

    const kpis: Kpis = {
      grossRevenue: gross,
      discounts,
      cancellations,
      cashbackRedeemed: 0, // preenchido em getAnalytics a partir de `cash`
      paymentFees,
      taxes,
      netRevenue,
      cogs,
      grossProfit,
      grossMarginPercent: pct(grossProfit, netRevenue),
      cmvPercent: pct(cogs, netRevenue),
      cmvRealCoveragePercent: validItems > 0 ? r2((Number(agg.real_sales) / validItems) * 100) : 0,
      orders,
      averageTicketPerOrder: orders > 0 ? r2((validItems - discounts) / orders) : null,
      averageTicketPerCustomer: null,
    };
    const losses: Losses = {
      cancelledOrders: Number(agg.canc_orders) || 0,
      cancelledValue: cancellations,
      abandonedUnpaidOrders: Number(agg.abandoned) || 0,
      refundedDishes: null,
      byReason: reasons.map((r) => ({ reason: r.reason, orders: Number(r.orders), value: r2(r.value) })),
    };
    return { kpis, losses };
  }

  // ---------------------------------------------------------------- Série temporal
  private async querySeries(p: Params, range: AnalyticsRange): Promise<SeriesPoint[]> {
    const g = range.granularity;
    const buckets: Array<{ b: string }> = await this.ds.query(
      `SELECT to_char(x, 'YYYY-MM-DD"T"HH24:MI:SS') AS b
         FROM generate_series(
           date_trunc($1::text, ($2::timestamptz AT TIME ZONE $4::text)),
           date_trunc($1::text, (($3::timestamptz - interval '1 millisecond') AT TIME ZONE $4::text)),
           ('1 ' || $1::text)::interval
         ) AS x`,
      [g, range.from, range.to, ANALYTICS_TZ],
    );
    const rows: Array<{ b: string; rev: string; profit: string }> = await this.ds.query(
      `${BASE_CTE}
       SELECT to_char(date_trunc('${g}', created_at AT TIME ZONE '${ANALYTICS_TZ}'), 'YYYY-MM-DD"T"HH24:MI:SS') AS b,
              SUM(items_total - discount_amount - fee - tax) AS rev,
              SUM(items_total - discount_amount - fee - tax - cogs) AS profit
       FROM priced WHERE is_valid GROUP BY 1`,
      p,
    );
    const byBucket = new Map(rows.map((r) => [r.b, r]));
    return buckets.map(({ b }) => ({
      bucket: b,
      label: bucketLabel(b, g, range),
      revenue: r2(byBucket.get(b)?.rev),
      profit: r2(byBucket.get(b)?.profit),
    }));
  }

  // ---------------------------------------------------------------- Produtos
  private async queryProducts(p: Params): Promise<MenuItemStat[]> {
    const rows: Array<Record<string, string | boolean>> = await this.ds.query(
      `SELECT oi.product_id,
              MAX(oi.product_name) AS name,
              SUM(oi.quantity) AS units,
              SUM(oi.subtotal) AS revenue,
              SUM(oi.quantity * COALESCE(oi.unit_cost, pr.cost_price, oi.unit_price * $5::numeric / 100)) AS cost,
              BOOL_AND(COALESCE(oi.unit_cost, pr.cost_price) IS NOT NULL) AS all_real
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         LEFT JOIN products pr ON pr.id = oi.product_id
        WHERE o.tenant_id = $1 AND o.created_at >= $2 AND o.created_at < $3
          AND ($4::uuid IS NULL OR o.location_id = $4)
          AND o.status NOT IN ('cancelado', 'aguardando_pagamento')
        GROUP BY oi.product_id`,
      p.slice(0, 5), // esta query só usa $1..$5 (o Postgres exige contagem exata)
    );
    return rows.map((r) => toMenuItem(r));
  }

  // 10 menos vendidos — inclui produtos ativos SEM nenhuma venda no período.
  private async queryBottomProducts(p: Params): Promise<MenuItemStat[]> {
    const rows: Array<Record<string, string | boolean>> = await this.ds.query(
      `WITH sales AS (
         SELECT oi.product_id, SUM(oi.quantity) AS units, SUM(oi.subtotal) AS revenue,
                SUM(oi.quantity * COALESCE(oi.unit_cost, pr.cost_price, oi.unit_price * $5::numeric / 100)) AS cost,
                BOOL_AND(COALESCE(oi.unit_cost, pr.cost_price) IS NOT NULL) AS all_real
           FROM orders o
           JOIN order_items oi ON oi.order_id = o.id
           LEFT JOIN products pr ON pr.id = oi.product_id
          WHERE o.tenant_id = $1 AND o.created_at >= $2 AND o.created_at < $3
            AND ($4::uuid IS NULL OR o.location_id = $4)
            AND o.status NOT IN ('cancelado', 'aguardando_pagamento')
          GROUP BY oi.product_id
       )
       SELECT p.id AS product_id, p.name,
              COALESCE(s.units, 0) AS units, COALESCE(s.revenue, 0) AS revenue,
              COALESCE(s.cost, 0) AS cost, COALESCE(s.all_real, p.cost_price IS NOT NULL) AS all_real,
              p.price AS list_price, p.cost_price AS list_cost
         FROM products p
         LEFT JOIN sales s ON s.product_id = p.id
        WHERE p.tenant_id = $1 AND p.deleted_at IS NULL AND p.is_available = TRUE
        ORDER BY COALESCE(s.units, 0) ASC, p.name ASC
        LIMIT 10`,
      p.slice(0, 5),
    );
    return rows.map((r) => {
      const item = toMenuItem(r);
      if (item.units === 0) {
        // Sem vendas: mostra preço de tabela e custo (real ou estimado) como referência.
        const price = r2(r.list_price);
        const hasCost = r.list_cost != null;
        const cost = hasCost ? r2(r.list_cost) : r2((price * Number(p[4])) / 100);
        return {
          ...item,
          unitPrice: price,
          unitCost: cost,
          unitMargin: r2(price - cost),
          marginPercent: pct(price - cost, price),
          costSource: hasCost ? 'real' : 'estimada',
        };
      }
      return item;
    });
  }

  // ---------------------------------------------------------------- Heatmap / canais
  private async queryHeatmap(p: Params) {
    const rows: Array<Record<string, string>> = await this.ds.query(
      `${BASE_CTE}
       SELECT EXTRACT(DOW FROM created_at AT TIME ZONE '${ANALYTICS_TZ}')::int AS weekday,
              EXTRACT(HOUR FROM created_at AT TIME ZONE '${ANALYTICS_TZ}')::int AS hour,
              COUNT(*) AS orders,
              SUM(items_total - discount_amount - fee - tax) AS revenue
       FROM priced WHERE is_valid GROUP BY 1, 2 ORDER BY 1, 2`,
      p,
    );
    return rows.map((r) => ({
      weekday: Number(r.weekday),
      hour: Number(r.hour),
      orders: Number(r.orders),
      revenue: r2(r.revenue),
    }));
  }

  private async queryChannels(p: Params) {
    const rows: Array<Record<string, string>> = await this.ds.query(
      `${BASE_CTE}
       SELECT order_type, COUNT(*) AS orders, SUM(items_total - discount_amount - fee - tax) AS revenue
       FROM priced WHERE is_valid GROUP BY 1`,
      p,
    );
    const labels = { mesa: 'Mesa (QR Code)', balcao: 'Balcão', entrega: 'Delivery' } as const;
    return (['mesa', 'balcao', 'entrega'] as const).map((channel) => {
      const row = rows.find((r) => r.order_type === channel);
      return { channel, label: labels[channel], orders: Number(row?.orders) || 0, revenue: r2(row?.revenue) };
    });
  }

  // ---------------------------------------------------------------- Caixa / cashback
  private async queryCash(p: Params): Promise<CashOps> {
    const [changeRow] = await this.ds.query(
      `SELECT
         COALESCE((
           SELECT SUM(GREATEST(o.amount_received - (o.total + o.tip_amount), 0))
             FROM orders o
            WHERE o.tenant_id = $1 AND o.created_at >= $2 AND o.created_at < $3
              AND ($4::uuid IS NULL OR o.location_id = $4)
              AND o.order_type <> 'mesa' AND o.payment_method = 'dinheiro'
              AND o.amount_received IS NOT NULL
              AND o.status NOT IN ('cancelado', 'aguardando_pagamento')
         ), 0)
         +
         COALESCE((
           SELECT SUM(ts.change_given)
             FROM table_sessions ts
             JOIN restaurant_tables rt ON rt.id = ts.table_id
            WHERE ts.tenant_id = $1 AND ts.closed_at >= $2 AND ts.closed_at < $3
              AND ($4::uuid IS NULL OR rt.location_id = $4)
              AND ts.change_given IS NOT NULL
         ), 0) AS change_given`,
      [p[0], p[1], p[2], p[3]],
    );

    const [cashRow] = await this.ds.query(
      `SELECT
         EXISTS (SELECT 1 FROM cash_transactions WHERE tenant_id = $1) AS has_data,
         COALESCE(SUM(amount) FILTER (WHERE type = 'sangria'), 0) AS bleed,
         COALESCE(SUM(amount) FILTER (WHERE type = 'suprimento'), 0) AS supply
       FROM cash_transactions
       WHERE tenant_id = $1 AND created_at >= $2 AND created_at < $3
         AND ($4::uuid IS NULL OR location_id = $4)`,
      [p[0], p[1], p[2], p[3]],
    );

    const [cb] = await this.ds.query(
      `SELECT
         COALESCE((SELECT SUM(original_amount) FROM cashback_ledger_entries
                    WHERE tenant_id = $1 AND created_at >= $2 AND created_at < $3
                      AND ($4::uuid IS NULL OR location_id = $4)), 0) AS issued,
         COALESCE((SELECT SUM(amount) FROM cashback_consumptions
                    WHERE tenant_id = $1 AND reversed = FALSE
                      AND created_at >= $2 AND created_at < $3), 0) AS redeemed,
         COALESCE((SELECT SUM(remaining_amount) FROM cashback_ledger_entries
                    WHERE tenant_id = $1 AND remaining_amount > 0
                      AND expires_at >= $2 AND expires_at < $3 AND expires_at <= now()), 0) AS expired`,
      [p[0], p[1], p[2], p[3]],
    );

    const issued = r2(cb.issued);
    const redeemed = r2(cb.redeemed);
    const hasCash = Boolean(cashRow.has_data);
    return {
      changeGiven: r2(changeRow.change_given),
      bleedTotal: hasCash ? r2(cashRow.bleed) : null,
      supplyTotal: hasCash ? r2(cashRow.supply) : null,
      cashbackIssued: issued,
      cashbackRedeemed: redeemed,
      cashbackExpiredUnused: r2(cb.expired),
      cashbackRedemptionRatePercent: pct(redeemed, issued),
    };
  }

  // ---------------------------------------------------------------- CRM
  private async queryCrm(p: Params): Promise<Crm> {
    const [row] = await this.ds.query(
      `${BASE_CTE},
       cust AS (SELECT DISTINCT customer_id FROM priced WHERE is_valid AND customer_id IS NOT NULL),
       guests AS (
         SELECT COUNT(DISTINCT COALESCE(table_participant_id::text, id::text)) AS n
           FROM priced WHERE is_valid AND customer_id IS NULL
       ),
       life AS (
         SELECT c.customer_id,
                MIN(o2.created_at) AS first_order,
                SUM(COALESCE(i.items_total, 0) - o2.discount_amount) AS lifetime
           FROM cust c
           JOIN orders o2 ON o2.tenant_id = $1 AND o2.customer_id = c.customer_id
                         AND o2.status NOT IN ('cancelado', 'aguardando_pagamento')
           LEFT JOIN LATERAL (SELECT SUM(oi.subtotal) AS items_total FROM order_items oi WHERE oi.order_id = o2.id) i ON TRUE
          GROUP BY c.customer_id
       )
       SELECT
         (SELECT COUNT(*) FROM cust) AS identified,
         (SELECT n FROM guests) AS guests,
         (SELECT COUNT(*) FROM life WHERE first_order >= $2::timestamptz) AS new_customers,
         (SELECT AVG(lifetime) FROM life) AS avg_ltv,
         COALESCE((SELECT ARRAY_AGG(customer_id) FROM cust), ARRAY[]::uuid[]) AS ids`,
      p,
    );
    const identified = Number(row.identified) || 0;
    const guests = Number(row.guests) || 0;
    const newCustomers = Number(row.new_customers) || 0;

    // Selo azul: confere a ASSINATURA de integridade (não só a coluna
    // is_verified) — mesma regra de qualquer outro lugar que exibe o selo.
    let verified = 0;
    const ids: string[] = row.ids ?? [];
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const candidates = await this.customerRepo
        .createQueryBuilder('c')
        .where('c.id IN (:...chunk)', { chunk })
        .andWhere('c.isVerified = TRUE')
        .getMany();
      verified += candidates.filter((c) => this.verification.verifyIntegritySync(c)).length;
    }

    return {
      customersServed: identified + guests,
      identifiedCustomers: identified,
      newCustomers,
      returningCustomers: Math.max(identified - newCustomers, 0),
      retentionRatePercent: pct(Math.max(identified - newCustomers, 0), identified),
      averageLtv: row.avg_ltv != null ? r2(row.avg_ltv) : null,
      verifiedCustomers: verified,
      verifiedPercent: pct(verified, identified),
    };
  }
}

function toMenuItem(r: Record<string, string | boolean>): MenuItemStat {
  const units = Number(r.units) || 0;
  const revenue = r2(r.revenue);
  const cost = r2(r.cost);
  const unitPrice = units > 0 ? r2(revenue / units) : 0;
  const unitCost = units > 0 ? r2(cost / units) : 0;
  return {
    productId: String(r.product_id),
    name: String(r.name),
    units,
    revenue,
    unitPrice,
    unitCost,
    unitMargin: r2(unitPrice - unitCost),
    marginPercent: pct(unitPrice - unitCost, unitPrice),
    costSource: r.all_real ? 'real' : 'estimada',
  };
}

function bucketLabel(bucket: string, g: 'hour' | 'day' | 'month', range: AnalyticsRange): string {
  const [date, time] = bucket.split('T');
  const [y, m, d] = date.split('-');
  if (g === 'hour') {
    const multiDay = new Date(range.to).getTime() - new Date(range.from).getTime() > 26 * 3600 * 1000;
    return multiDay ? `${d}/${m} ${time.slice(0, 2)}h` : `${time.slice(0, 2)}h`;
  }
  if (g === 'day') return `${d}/${m}`;
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${months[Number(m) - 1]}/${y.slice(2)}`;
}
