// Leitura/agregação do SIOD (aba "Entregas"). Sem Nest: recebe uma função
// `query(sql, params)` (no app é `dataSource.query`; nos testes, um Postgres
// real). Todo valor do usuário vai por parâmetro ($n); os únicos trechos
// interpolados no SQL são constantes desta página (listas fixas), nunca entrada.
//
// IMPORTANTE (igual à aba Análise): NÃO filtra `orders.deleted_at` — o histórico
// faz soft-delete depois do prazo de retenção, mas as métricas continuam valendo.
import type { AnalyticsRange } from '../analytics/analytics.types';
import type { SiodParams } from './siod.types';
import { ESTIMATION_CONFIDENCES, ROUTE_PROVIDERS } from './siod.types';
import {
  SIOD_MIN_SAMPLE_FOR_SUGGESTION,
  bucketLabel,
  buildSuggestion,
  num0,
  numOrNull,
  r2OrNull,
  ratePercent,
  round2,
  sampleQuality,
} from './siod-insights.math';
import type {
  SiodAccuracy,
  SiodComponents,
  SiodCounts,
  SiodGroupRow,
  SiodOrderRow,
  SiodOrdersPage,
  SiodOverview,
  SiodRecordClass,
  SiodSeriesPoint,
} from './siod-insights.types';
import { SIOD_RECORD_CLASSES } from './siod-insights.types';

export type QueryFn = (sql: string, params: unknown[]) => Promise<Array<Record<string, unknown>>>;

export const SIOD_TZ = 'America/Sao_Paulo';

export class SiodInputError extends Error {}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseLocationId(raw: string | undefined): string | null {
  if (raw === undefined || raw === '') return null;
  if (!UUID_RE.test(raw)) throw new SiodInputError('"locationId" inválido.');
  return raw;
}

export interface OrdersFilters {
  recordClass: SiodRecordClass | null;
  confidence: string | null;
  provider: string | null;
  page: number;
  pageSize: number;
}

export const SIOD_MAX_PAGE_SIZE = 100;

function parsePositiveInt(raw: string | undefined, field: string, fallback: number, max: number): number {
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d{1,9}$/.test(raw)) throw new SiodInputError(`"${field}" precisa ser um inteiro positivo.`);
  const n = Number(raw);
  if (n < 1) throw new SiodInputError(`"${field}" precisa ser um inteiro positivo.`);
  return Math.min(n, max);
}

export function parseOrdersFilters(q: {
  recordClass?: string;
  confidence?: string;
  provider?: string;
  page?: string;
  pageSize?: string;
}): OrdersFilters {
  const pick = <T extends string>(raw: string | undefined, allowed: readonly T[], field: string): T | null => {
    if (raw === undefined || raw === '') return null;
    if (!(allowed as readonly string[]).includes(raw)) throw new SiodInputError(`"${field}" inválido.`);
    return raw as T;
  };
  return {
    recordClass: pick(q.recordClass, SIOD_RECORD_CLASSES, 'recordClass'),
    confidence: pick(q.confidence, ESTIMATION_CONFIDENCES, 'confidence'),
    provider: pick(q.provider, ROUTE_PROVIDERS, 'provider'),
    page: parsePositiveInt(q.page, 'page', 1, 1_000_000),
    pageSize: parsePositiveInt(q.pageSize, 'pageSize', 25, SIOD_MAX_PAGE_SIZE),
  };
}

// Parâmetros: $1 tenant, $2 from, $3 to, $4 loja (ou null).
// `cls` é a PARTIÇÃO dos registros (todo registro cai em exatamente uma classe):
//   cancelled   pedido cancelado (nunca entra na precisão)
//   valid       métricas calculadas e completas
//   invalid     timestamps contraditórios (ou VALID sem métricas = dado corrompido)
//   skipped     entregue sem passar por preparo/pronto (sem tempo inventado)
//   in_progress ainda não entregue
const BASE_CTE = `
WITH base AS (
  SELECT
    d.id, d.order_id, d.created_at,
    d.estimation_confidence AS confidence,
    d.route_provider AS provider,
    d.route_fallback_used AS fallback,
    d.estimated_prep_minutes AS est_prep,
    d.estimated_route_minutes AS est_route,
    d.estimated_total_minutes AS est_total,
    d.estimated_min_minutes AS est_min,
    d.estimated_max_minutes AS est_max,
    d.active_orders_at_creation AS active,
    d.peak_multiplier_used AS peak,
    d.base_prep_minutes_used AS base_used,
    d.distance_km_used AS distance_km,
    d.actual_prep_seconds AS act_prep_s,
    d.actual_route_seconds AS act_route_s,
    d.actual_total_seconds AS act_total_s,
    d.prediction_error_minutes AS err,
    d.prediction_absolute_error_minutes AS abs_err,
    d.prediction_error_percent AS err_pct,
    COALESCE((d.engine_payload_json #>> '{computation,floorApplied}') = 'false', false) AS floor_clear,
    o.status AS order_status,
    o.payment_method,
    o.customer_name,
    CASE
      WHEN o.status = 'cancelado' THEN 'cancelled'
      WHEN d.metrics_status = 'VALID'
           AND d.actual_total_seconds IS NOT NULL AND d.actual_prep_seconds IS NOT NULL
           AND d.actual_route_seconds IS NOT NULL AND d.prediction_error_minutes IS NOT NULL
           AND d.prediction_absolute_error_minutes IS NOT NULL THEN 'valid'
      WHEN d.metrics_status IN ('VALID', 'INVALID_TIMESTAMPS') THEN 'invalid'
      WHEN o.status = 'entregue' THEN 'skipped'
      ELSE 'in_progress'
    END AS cls
  FROM order_delivery_intelligence d
  JOIN orders o ON o.id = d.order_id AND o.tenant_id = d.tenant_id
  WHERE d.tenant_id = $1
    AND d.created_at >= $2 AND d.created_at < $3
    AND ($4::uuid IS NULL OR o.location_id = $4::uuid)
)`;

const V = `cls = 'valid'`;
const WITHIN = `act_total_s >= est_min * 60 AND act_total_s <= est_max * 60`;

type Row = Record<string, unknown>;

const GROUPS: Array<{ id: string; expr: string; keys: Array<[string, string]> }> = [
  {
    id: 'confidence',
    expr: 'confidence',
    keys: [
      ['HIGH', 'Alta'],
      ['MEDIUM', 'Média'],
      ['LOW', 'Baixa'],
    ],
  },
  {
    id: 'provider',
    expr: 'provider',
    keys: [
      ['OSRM', 'Rota real (OSRM)'],
      ['HAVERSINE', 'Linha reta (fallback)'],
      ['MANUAL', 'Manual'],
    ],
  },
  {
    id: 'queue',
    expr: `CASE WHEN active <= 2 THEN 'q0_2' WHEN active <= 5 THEN 'q3_5' WHEN active <= 8 THEN 'q6_8' ELSE 'q9p' END`,
    keys: [
      ['q0_2', '0 a 2 pedidos na fila'],
      ['q3_5', '3 a 5 pedidos na fila'],
      ['q6_8', '6 a 8 pedidos na fila'],
      ['q9p', '9+ pedidos na fila'],
    ],
  },
  {
    id: 'peak',
    expr: `CASE WHEN peak > 1 THEN 'peak' ELSE 'normal' END`,
    keys: [
      ['normal', 'Sem pico'],
      ['peak', 'Em pico'],
    ],
  },
  {
    id: 'payment',
    expr: `CASE WHEN payment_method IN ('pix', 'cartao', 'dinheiro') THEN payment_method ELSE 'outro' END`,
    keys: [
      ['pix', 'Pix'],
      ['cartao', 'Cartão'],
      ['dinheiro', 'Dinheiro'],
      ['outro', 'Outro'],
    ],
  },
];

function groupSql(): string {
  return GROUPS.map(
    (g) => `SELECT '${g.id}' AS g, (${g.expr})::text AS k,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE ${V}) AS valid,
        AVG(abs_err) FILTER (WHERE ${V}) AS mae,
        AVG(err) FILTER (WHERE ${V}) AS bias,
        COUNT(*) FILTER (WHERE ${V} AND ${WITHIN}) AS within
      FROM base GROUP BY 2`,
  ).join('\nUNION ALL\n');
}

function shapeGroup(rows: Row[], id: string): SiodGroupRow[] {
  const def = GROUPS.find((g) => g.id === id);
  if (!def) return [];
  const mine = new Map(rows.filter((r) => r.g === id).map((r) => [String(r.k), r]));
  const out: SiodGroupRow[] = [];
  for (const [key, label] of def.keys) {
    const r = mine.get(key);
    if (!r) continue; // só mostra grupos que existem no período
    const valid = num0(r.valid);
    out.push({
      key,
      label,
      total: num0(r.total),
      valid,
      maeMinutes: valid > 0 ? r2OrNull(r.mae) : null,
      biasMinutes: valid > 0 ? r2OrNull(r.bias) : null,
      withinWindowPercent: ratePercent(num0(r.within), valid),
    });
  }
  return out;
}

export async function loadOverview(
  query: QueryFn,
  tenantId: string,
  range: AnalyticsRange,
  locationId: string | null,
  currentParams: SiodParams,
): Promise<SiodOverview> {
  const p: unknown[] = [tenantId, range.from, range.to, locationId];
  const g = range.granularity;
  if (g !== 'hour' && g !== 'day' && g !== 'month') throw new SiodInputError('Granularidade inválida.');

  const [summaryRows, bucketRows, seriesRows, groupRows, suggestionRows] = await Promise.all([
    query(
      `${BASE_CTE}
       SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE cls = 'valid') AS valid,
         COUNT(*) FILTER (WHERE cls = 'invalid') AS invalid,
         COUNT(*) FILTER (WHERE cls = 'skipped') AS skipped,
         COUNT(*) FILTER (WHERE cls = 'in_progress') AS in_progress,
         COUNT(*) FILTER (WHERE cls = 'cancelled') AS cancelled,
         COUNT(*) FILTER (WHERE fallback) AS fallback_used,
         AVG(est_total) FILTER (WHERE ${V}) AS avg_est_total,
         AVG(act_total_s) FILTER (WHERE ${V}) / 60.0 AS avg_act_total,
         AVG(err) FILTER (WHERE ${V}) AS bias,
         AVG(abs_err) FILTER (WHERE ${V}) AS mae,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY abs_err::float8) FILTER (WHERE ${V}) AS median_abs,
         percentile_cont(0.9) WITHIN GROUP (ORDER BY abs_err::float8) FILTER (WHERE ${V}) AS p90_abs,
         AVG(err_pct) FILTER (WHERE ${V}) AS bias_pct,
         AVG(ABS(err_pct)) FILTER (WHERE ${V}) AS mape,
         COUNT(*) FILTER (WHERE ${V} AND act_total_s < est_min * 60) AS early,
         COUNT(*) FILTER (WHERE ${V} AND act_total_s > est_max * 60) AS late,
         COUNT(*) FILTER (WHERE ${V} AND ${WITHIN}) AS within,
         AVG(est_prep) FILTER (WHERE ${V}) AS avg_est_prep,
         AVG(act_total_s - act_route_s) FILTER (WHERE ${V}) / 60.0 AS avg_act_prep,
         AVG(act_prep_s) FILTER (WHERE ${V}) / 60.0 AS avg_act_kitchen,
         AVG(est_route) FILTER (WHERE ${V}) AS avg_est_route,
         AVG(act_route_s) FILTER (WHERE ${V}) / 60.0 AS avg_act_route
       FROM base`,
      p,
    ),
    query(
      `SELECT to_char(x, 'YYYY-MM-DD"T"HH24:MI:SS') AS b
         FROM generate_series(
           date_trunc($1::text, ($2::timestamptz AT TIME ZONE $4::text)),
           date_trunc($1::text, (($3::timestamptz - interval '1 millisecond') AT TIME ZONE $4::text)),
           ('1 ' || $1::text)::interval
         ) AS x`,
      [g, range.from, range.to, SIOD_TZ],
    ),
    query(
      `${BASE_CTE}
       SELECT to_char(date_trunc('${g}', created_at AT TIME ZONE '${SIOD_TZ}'), 'YYYY-MM-DD"T"HH24:MI:SS') AS b,
              COUNT(*) AS total,
              COUNT(*) FILTER (WHERE ${V}) AS valid,
              AVG(est_total) FILTER (WHERE ${V}) AS avg_est,
              AVG(act_total_s) FILTER (WHERE ${V}) / 60.0 AS avg_act,
              AVG(abs_err) FILTER (WHERE ${V}) AS mae
       FROM base GROUP BY 1`,
      p,
    ),
    query(`${BASE_CTE}\n${groupSql()}`, p),
    query(
      `${BASE_CTE}
       SELECT
         COUNT(*) FILTER (WHERE ${V} AND active = 0 AND peak = 1 AND floor_clear) AS base_n,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY ((act_total_s - act_route_s) / 60.0)::float8)
           FILTER (WHERE ${V} AND active = 0 AND peak = 1 AND floor_clear) AS base_median,
         COUNT(*) FILTER (WHERE ${V} AND active >= 1 AND peak = 1 AND floor_clear) AS pen_n,
         percentile_cont(0.5) WITHIN GROUP (
           ORDER BY ((((act_total_s - act_route_s) / 60.0) - base_used) / NULLIF(active, 0))::float8)
           FILTER (WHERE ${V} AND active >= 1 AND peak = 1 AND floor_clear) AS pen_median
       FROM base`,
      p,
    ),
  ]);

  const s = summaryRows[0] ?? {};
  const total = num0(s.total);
  const valid = num0(s.valid);
  const counts: SiodCounts = {
    total,
    valid,
    invalid: num0(s.invalid),
    skipped: num0(s.skipped),
    inProgress: num0(s.in_progress),
    cancelled: num0(s.cancelled),
    fallbackUsed: num0(s.fallback_used),
    fallbackRatePercent: ratePercent(num0(s.fallback_used), total),
  };

  let accuracy: SiodAccuracy | null = null;
  let components: SiodComponents | null = null;
  if (valid > 0) {
    accuracy = {
      sample: valid,
      biasMinutes: round2(num0(s.bias)),
      maeMinutes: round2(num0(s.mae)),
      medianAbsMinutes: round2(num0(s.median_abs)),
      p90AbsMinutes: round2(num0(s.p90_abs)),
      biasPercent: round2(num0(s.bias_pct)),
      mapePercent: round2(num0(s.mape)),
      withinWindowPercent: ratePercent(num0(s.within), valid) ?? 0,
      earlyPercent: ratePercent(num0(s.early), valid) ?? 0,
      latePercent: ratePercent(num0(s.late), valid) ?? 0,
      avgEstimatedTotalMinutes: round2(num0(s.avg_est_total)),
      avgActualTotalMinutes: round2(num0(s.avg_act_total)),
    };
    const prep = num0(s.avg_act_prep);
    const kitchen = num0(s.avg_act_kitchen);
    components = {
      estimatedPrepMinutes: round2(num0(s.avg_est_prep)),
      actualPrepMinutes: round2(prep),
      actualKitchenMinutes: round2(kitchen),
      actualWaitMinutes: round2(Math.max(0, prep - kitchen)),
      estimatedRouteMinutes: round2(num0(s.avg_est_route)),
      actualRouteMinutes: round2(num0(s.avg_act_route)),
    };
  }

  const multiDay = new Date(range.to).getTime() - new Date(range.from).getTime() > 26 * 3600 * 1000;
  const byBucket = new Map(seriesRows.map((r) => [String(r.b), r]));
  const series: SiodSeriesPoint[] = bucketRows.map((b) => {
    const key = String(b.b);
    const r = byBucket.get(key);
    const v = num0(r?.valid);
    return {
      bucket: key,
      label: bucketLabel(key, g, multiDay),
      total: num0(r?.total),
      valid: v,
      avgEstimatedMinutes: v > 0 ? r2OrNull(r?.avg_est) : null,
      avgActualMinutes: v > 0 ? r2OrNull(r?.avg_act) : null,
      maeMinutes: v > 0 ? r2OrNull(r?.mae) : null,
    };
  });

  const sg = suggestionRows[0] ?? {};
  return {
    range: { period: range.period, from: range.from, to: range.to, granularity: g, timezone: SIOD_TZ },
    counts,
    sampleQuality: sampleQuality(valid),
    accuracy,
    components,
    series,
    byConfidence: shapeGroup(groupRows, 'confidence'),
    byProvider: shapeGroup(groupRows, 'provider'),
    byQueue: shapeGroup(groupRows, 'queue'),
    byPeak: shapeGroup(groupRows, 'peak'),
    byPayment: shapeGroup(groupRows, 'payment'),
    suggestions: {
      basePrep: buildSuggestion('basePrepMinutes', numOrNull(sg.base_median), num0(sg.base_n), currentParams.basePrepMinutes),
      queuePenalty: buildSuggestion(
        'queuePenaltyMinutesPerOrder',
        numOrNull(sg.pen_median),
        num0(sg.pen_n),
        currentParams.queuePenaltyMinutesPerOrder,
      ),
    },
  };
}

const ISO = (v: unknown): string => (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());

export async function loadOrders(
  query: QueryFn,
  tenantId: string,
  range: AnalyticsRange,
  locationId: string | null,
  f: OrdersFilters,
): Promise<SiodOrdersPage> {
  const p: unknown[] = [tenantId, range.from, range.to, locationId, f.recordClass, f.confidence, f.provider];
  const filter = `WHERE ($5::text IS NULL OR cls = $5::text)
      AND ($6::text IS NULL OR confidence = $6::text)
      AND ($7::text IS NULL OR provider = $7::text)`;
  const offset = (f.page - 1) * f.pageSize;
  const [countRows, rows] = await Promise.all([
    query(`${BASE_CTE}\nSELECT COUNT(*) AS total FROM base ${filter}`, p),
    query(
      `${BASE_CTE}
       SELECT order_id, created_at, customer_name, order_status, payment_method, cls, confidence, provider, fallback,
              distance_km, active, peak, est_total, est_min, est_max, act_total_s, err
       FROM base ${filter}
       ORDER BY created_at DESC, id DESC
       LIMIT $8 OFFSET $9`,
      [...p, f.pageSize, offset],
    ),
  ]);
  const items: SiodOrderRow[] = rows.map((r) => {
    const actS = numOrNull(r.act_total_s);
    const cls = String(r.cls) as SiodRecordClass;
    return {
      orderId: String(r.order_id),
      createdAt: ISO(r.created_at),
      customerName: r.customer_name === null || r.customer_name === undefined ? null : String(r.customer_name),
      orderStatus: String(r.order_status),
      paymentMethod: r.payment_method === null || r.payment_method === undefined ? null : String(r.payment_method),
      recordClass: cls,
      confidence: String(r.confidence),
      routeProvider: String(r.provider),
      fallbackUsed: Boolean(r.fallback),
      distanceKm: round2(num0(r.distance_km)),
      activeOrdersAtCreation: num0(r.active),
      peakMultiplier: round2(num0(r.peak)),
      estimatedTotalMinutes: num0(r.est_total),
      estimatedMinMinutes: num0(r.est_min),
      estimatedMaxMinutes: num0(r.est_max),
      actualTotalMinutes: cls === 'valid' && actS !== null ? round2(actS / 60) : null,
      errorMinutes: cls === 'valid' ? r2OrNull(r.err) : null,
    };
  });
  return { page: f.page, pageSize: f.pageSize, total: num0(countRows[0]?.total), items };
}

export { SIOD_MIN_SAMPLE_FOR_SUGGESTION };
