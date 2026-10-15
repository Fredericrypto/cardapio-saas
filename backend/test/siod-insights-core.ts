// Núcleo das auditorias da aba "Entregas" do SIOD (configuração + visualização).
// Parte 1 (pura, sem banco): validação estrita, limites, classificação, sugestões, parsing.
// Parte 2 (Postgres REAL): SQL de agregação conferido contra um cálculo INDEPENDENTE em
// TypeScript sobre os mesmos registros (dados aleatórios com semente fixa), isolamento
// entre restaurantes, filtros, paginação, fronteiras de período/fuso e serviço de settings.
import { randomUUID } from 'node:crypto';
import { resolveRange } from '../src/modules/analytics/analytics.range';
import { computeActualMetrics, resolveSiodParams, runSiodEngine } from '../src/modules/siod/siod.math';
import {
  DEFAULT_SIOD_PARAMS,
  SIOD_PARAM_KEYS,
  SIOD_PARAM_LIMITS,
  SIOD_STRUCTURAL_FLOOR_MINUTES,
} from '../src/modules/siod/siod.types';
import type { SiodParams } from '../src/modules/siod/siod.types';
import {
  SIOD_MIN_SAMPLE_FOR_SUGGESTION,
  bucketLabel,
  buildSuggestion,
  classifyRecord,
  median,
  numOrNull,
  ratePercent,
  round2,
  sampleQuality,
} from '../src/modules/siod/siod-insights.math';
import {
  SiodInputError,
  loadOrders,
  loadOverview,
  parseLocationId,
  parseOrdersFilters,
} from '../src/modules/siod/siod-insights.queries';
import type { QueryFn } from '../src/modules/siod/siod-insights.queries';
import { buildSettingsView, validateSiodSettingsInput } from '../src/modules/siod/siod-settings.validation';
import type { SiodRecordClass } from '../src/modules/siod/siod-insights.types';

export type Ok = (condition: boolean, label: string) => void;

// PRNG determinístico (mulberry32).
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const near = (a: number | null, b: number | null, tol = 0.0101): boolean =>
  a === null || b === null ? a === b : Math.abs(a - b) <= tol;

// ---------------------------------------------------------------------------
// PARTE 1 — pura
// ---------------------------------------------------------------------------
export function runPureChecks(ok: Ok): void {
  console.log('1) Limites: fonte única, padrão dentro dos limites, piso estrutural');
  ok(
    SIOD_PARAM_KEYS.every((k) => DEFAULT_SIOD_PARAMS[k] >= SIOD_PARAM_LIMITS[k].min && DEFAULT_SIOD_PARAMS[k] <= SIOD_PARAM_LIMITS[k].max),
    'todo padrão está dentro do seu limite',
  );
  ok(SIOD_PARAM_LIMITS.minTotalMinutes.min === SIOD_STRUCTURAL_FLOOR_MINUTES, 'prazo mínimo nunca abaixo do piso estrutural (15)');
  ok(SIOD_PARAM_KEYS.length === 8 && SIOD_PARAM_KEYS.every((k) => k in DEFAULT_SIOD_PARAMS), 'os 8 parâmetros têm padrão');
  // resolveSiodParams usa os mesmos limites: extremos fora da faixa são limitados exatamente neles.
  const low = Object.fromEntries(SIOD_PARAM_KEYS.map((k) => [k, -1e9]));
  const high = Object.fromEntries(SIOD_PARAM_KEYS.map((k) => [k, 1e9]));
  const rl = resolveSiodParams(low);
  const rh = resolveSiodParams(high);
  ok(SIOD_PARAM_KEYS.every((k) => rl[k] === SIOD_PARAM_LIMITS[k].min && rh[k] === SIOD_PARAM_LIMITS[k].max), 'resolveSiodParams limita exatamente nos limites da tabela');

  console.log('2) Validação estrita das configurações');
  const full = (over: Record<string, unknown> = {}): Record<string, unknown> => ({ ...DEFAULT_SIOD_PARAMS, ...over });
  const v0 = validateSiodSettingsInput(full());
  ok(v0.ok && SIOD_PARAM_KEYS.every((k) => v0.ok && v0.params[k] === DEFAULT_SIOD_PARAMS[k]), 'padrão completo é válido e volta idêntico');
  for (const k of SIOD_PARAM_KEYS) {
    const L = SIOD_PARAM_LIMITS[k];
    const okMin = validateSiodSettingsInput(full({ [k]: L.min }));
    const okMax = validateSiodSettingsInput(full({ [k]: L.max }));
    const badMin = validateSiodSettingsInput(full({ [k]: L.integer ? L.min - 1 : L.min - 0.01 }));
    const badMax = validateSiodSettingsInput(full({ [k]: L.integer ? L.max + 1 : L.max + 0.01 }));
    ok(okMin.ok && okMax.ok && !badMin.ok && !badMax.ok, `${k}: aceita ${L.min} e ${L.max}; rejeita fora da faixa`);
    const bad = [validateSiodSettingsInput(full({ [k]: NaN })), validateSiodSettingsInput(full({ [k]: Infinity })), validateSiodSettingsInput(full({ [k]: '10' })), validateSiodSettingsInput(full({ [k]: null })), validateSiodSettingsInput(full({ [k]: true }))];
    ok(bad.every((r) => !r.ok), `${k}: NaN, Infinity, texto, null e boolean são rejeitados`);
    const missing = { ...full() };
    delete missing[k];
    const rm = validateSiodSettingsInput(missing);
    ok(!rm.ok && rm.errors.some((e) => e.field === k), `${k}: ausente é rejeitado apontando o campo`);
    if (L.integer) ok(!validateSiodSettingsInput(full({ [k]: L.min + 0.5 })).ok, `${k}: não inteiro é rejeitado`);
    else ok(!validateSiodSettingsInput(full({ [k]: L.min + 0.005 })).ok, `${k}: mais de 2 casas decimais é rejeitado`);
  }
  ok(!validateSiodSettingsInput(full({ minTotalMinutes: 14 })).ok, 'prazo mínimo 14 (< piso 15) é rejeitado');
  ok(!validateSiodSettingsInput(full({ extra: 1 })).ok, 'campo desconhecido é rejeitado');
  ok(!validateSiodSettingsInput(full({ __proto__x: 1, constructor: 2 })).ok, 'chaves estranhas (constructor) são rejeitadas');
  ok([null, undefined, 'x', 5, [], [1, 2]].every((x) => !validateSiodSettingsInput(x).ok), 'corpo que não é objeto é rejeitado');
  const multi = validateSiodSettingsInput(full({ basePrepMinutes: -5, peakMaxMultiplier: 9, bogus: 1 }));
  ok(!multi.ok && multi.errors.length === 3, 'erros de vários campos voltam juntos (3)');
  const pt = validateSiodSettingsInput(full({ basePrepMinutes: 999 }));
  ok(!pt.ok && pt.errors[0].message.includes('240'), 'mensagem em português cita o limite');

  console.log('3) Propriedade: todo conjunto válido é ponto fixo do motor (3000 casos)');
  const rand = rng(20261014);
  let fixedPoints = 0;
  let allInside = 0;
  for (let i = 0; i < 3000; i++) {
    const cand: Record<string, number> = {};
    for (const k of SIOD_PARAM_KEYS) {
      const L = SIOD_PARAM_LIMITS[k];
      const span = L.max - L.min;
      cand[k] = L.integer ? L.min + Math.floor(rand() * (span + 1)) : Math.round((L.min + rand() * span) * 100) / 100;
    }
    const v = validateSiodSettingsInput(cand);
    if (v.ok && SIOD_PARAM_KEYS.every((k) => resolveSiodParams(v.params)[k] === v.params[k] && v.params[k] === cand[k])) fixedPoints++;
    // lixo qualquer: resolveSiodParams sempre devolve valores válidos
    const junk: Record<string, unknown> = {};
    for (const k of SIOD_PARAM_KEYS) junk[k] = [NaN, Infinity, -Infinity, 'x', null, undefined, {}, [], (rand() - 0.5) * 1e6][Math.floor(rand() * 9)];
    const r = resolveSiodParams(junk);
    if (SIOD_PARAM_KEYS.every((k) => Number.isFinite(r[k]) && r[k] >= SIOD_PARAM_LIMITS[k].min && r[k] <= SIOD_PARAM_LIMITS[k].max)) allInside++;
  }
  ok(fixedPoints === 3000, 'válido => resolveSiodParams(params) === params (3000/3000)');
  ok(allInside === 3000, 'lixo => resolveSiodParams sempre dentro dos limites (3000/3000)');

  console.log('4) Visão das configurações');
  const view = buildSettingsView(null, resolveSiodParams, SIOD_STRUCTURAL_FLOOR_MINUTES);
  ok(view.isDefault && view.params.basePrepMinutes === 20 && view.structuralFloorMinutes === 15, 'sem configuração = padrão (isDefault)');
  const view2 = buildSettingsView({ basePrepMinutes: 33 }, resolveSiodParams, 15);
  ok(!view2.isDefault && view2.params.basePrepMinutes === 33 && view2.params.queuePenaltyMinutesPerOrder === 2, 'configuração parcial no banco é completada com o padrão');
  ok(view.defaults !== DEFAULT_SIOD_PARAMS, 'defaults da visão é cópia (não expõe o objeto congelado)');

  console.log('5) Classificação (partição), taxas, qualidade da amostra');
  const cases: Array<[string, string, boolean, SiodRecordClass]> = [
    ['VALID', 'entregue', true, 'valid'],
    ['VALID', 'entregue', false, 'invalid'],
    ['VALID', 'cancelado', true, 'cancelled'],
    ['INVALID_TIMESTAMPS', 'entregue', false, 'invalid'],
    ['INVALID_TIMESTAMPS', 'cancelado', false, 'cancelled'],
    ['MISSING_DATA', 'entregue', false, 'skipped'],
    ['MISSING_DATA', 'preparando', false, 'in_progress'],
    ['MISSING_DATA', 'pendente', false, 'in_progress'],
    ['MISSING_DATA', 'cancelado', false, 'cancelled'],
  ];
  ok(cases.every(([m, o, h, e]) => classifyRecord(m as 'VALID', o, h) === e), 'classifyRecord cobre todas as combinações');
  ok(ratePercent(1, 3) === 33.33 && ratePercent(0, 5) === 0 && ratePercent(5, 0) === null && ratePercent(NaN, 5) === null, 'ratePercent: 1/3, 0/5, divisão por zero e NaN');
  ok(sampleQuality(0) === 'none' && sampleQuality(9) === 'insufficient' && sampleQuality(10) === 'low' && sampleQuality(29) === 'low' && sampleQuality(30) === 'ok', 'qualidade da amostra: 0/9/10/29/30');
  ok(median([]) === null && median([5]) === 5 && median([1, 3]) === 2 && median([9, 1, 5]) === 5, 'mediana');
  ok(numOrNull(null) === null && numOrNull('') === null && numOrNull('12.5') === 12.5 && numOrNull(NaN) === null && numOrNull('abc') === null && numOrNull(0) === 0, 'numOrNull: null, vazio, string numérica, NaN, lixo, zero');
  ok(round2(1.005) === 1 || round2(1.005) === 1.01, 'round2 estável');

  console.log('6) Sugestões (só com amostra suficiente, dentro dos limites)');
  const n = SIOD_MIN_SAMPLE_FOR_SUGGESTION;
  ok(buildSuggestion('basePrepMinutes', 25, n - 1, 20).value === null, 'amostra 29 => sem sugestão');
  ok(buildSuggestion('basePrepMinutes', 25, n - 1, 20).reason?.includes('29') === true, 'motivo cita o tamanho da amostra');
  ok(buildSuggestion('basePrepMinutes', 24.6, n, 20).value === 25, 'amostra 30 => arredonda a mediana (24,6 -> 25)');
  ok(buildSuggestion('basePrepMinutes', 999, n, 20).value === 240, 'teto do parâmetro (240)');
  ok(buildSuggestion('basePrepMinutes', -4, n, 20).value === 0, 'piso do parâmetro (0)');
  ok(buildSuggestion('queuePenaltyMinutesPerOrder', 75, n, 2).value === 60, 'penalidade limitada a 60');
  ok(buildSuggestion('queuePenaltyMinutesPerOrder', null, 500, 2).value === null, 'mediana nula => sem sugestão');
  ok(buildSuggestion('queuePenaltyMinutesPerOrder', NaN, 500, 2).value === null, 'mediana NaN => sem sugestão');

  console.log('7) Rótulos de período e parsing de entrada');
  ok(bucketLabel('2026-06-03T14:00:00', 'hour', false) === '14h', 'hora (mesmo dia)');
  ok(bucketLabel('2026-06-03T14:00:00', 'hour', true) === '03/06 14h', 'hora (vários dias)');
  ok(bucketLabel('2026-06-03T00:00:00', 'day', false) === '03/06', 'dia');
  ok(bucketLabel('2026-12-01T00:00:00', 'month', false) === 'dez/26', 'mês');
  const uuid = randomUUID();
  ok(parseLocationId(undefined) === null && parseLocationId('') === null && parseLocationId(uuid) === uuid, 'locationId: vazio => null; uuid ok');
  const throws = (fn: () => unknown): boolean => {
    try {
      fn();
      return false;
    } catch (e) {
      return e instanceof SiodInputError;
    }
  };
  ok(throws(() => parseLocationId("x' OR 1=1 --")) && throws(() => parseLocationId('123')) && throws(() => parseLocationId(uuid + 'x')), 'locationId malformado/injeção => erro de entrada');
  const f0 = parseOrdersFilters({});
  ok(f0.page === 1 && f0.pageSize === 25 && f0.recordClass === null, 'padrões: página 1, 25 por página');
  ok(parseOrdersFilters({ pageSize: '5000' }).pageSize === 100, 'pageSize limitado a 100');
  ok(throws(() => parseOrdersFilters({ page: '0' })) && throws(() => parseOrdersFilters({ page: '-1' })) && throws(() => parseOrdersFilters({ page: '1e3' })) && throws(() => parseOrdersFilters({ pageSize: 'abc' })) && throws(() => parseOrdersFilters({ page: '99999999999' })), 'page/pageSize inválidos => erro');
  ok(throws(() => parseOrdersFilters({ recordClass: 'x' })) && throws(() => parseOrdersFilters({ confidence: 'ALTA' })) && throws(() => parseOrdersFilters({ provider: "OSRM' --" })), 'filtros fora da lista => erro');
  ok(parseOrdersFilters({ recordClass: 'valid', confidence: 'HIGH', provider: 'OSRM', page: '3', pageSize: '10' }).page === 3, 'filtros válidos passam');
}

// ---------------------------------------------------------------------------
// PARTE 2 — Postgres real
// ---------------------------------------------------------------------------
interface Gen {
  odiId: string;
  orderId: string;
  tenantId: string;
  locationId: string;
  createdAt: Date;
  orderStatus: string;
  paymentMethod: string | null;
  customerName: string | null;
  deletedAt: Date | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  provider: 'OSRM' | 'HAVERSINE' | 'MANUAL';
  metricsStatus: 'VALID' | 'INVALID_TIMESTAMPS' | 'MISSING_DATA';
  floorApplied: boolean;
  estPrep: number;
  estRoute: number;
  estTotal: number;
  estMin: number;
  estMax: number;
  active: number;
  baseUsed: number;
  penaltyUsed: number;
  peak: number;
  distance: number;
  actPrepS: number | null;
  actRouteS: number | null;
  actTotalS: number | null;
  err: number | null;
  absErr: number | null;
  errPct: number | null;
  // marcadores do gerador
  preparingAt: Date | null;
  readyAt: Date | null;
  deliveredAt: Date | null;
}

function makeRow(rand: () => number, tenantId: string, locationId: string, createdAt: Date, forceEstZero = false, emptyQueue = false): Gen {
  const pick = <T,>(items: readonly T[], weights: readonly number[]): T => {
    const total = weights.reduce((a, b) => a + b, 0);
    let x = rand() * total;
    for (let i = 0; i < items.length; i++) {
      x -= weights[i];
      if (x < 0) return items[i];
    }
    return items[items.length - 1];
  };
  const provider = pick(['OSRM', 'HAVERSINE', 'MANUAL'] as const, [80, 17, 3]);
  const pending = emptyQueue ? 0 : Math.floor(rand() * 8);
  const preparing = emptyQueue ? 0 : Math.floor(rand() * 6);
  const engine = runSiodEngine({
    params: { ...DEFAULT_SIOD_PARAMS, basePrepMinutes: 10 + Math.floor(rand() * 25) },
    pendingOrders: pending,
    preparingOrders: preparing,
    routeSeconds: Math.floor(rand() * 2400),
    routeProvider: provider,
  });
  const orderStatus = pick(['entregue', 'cancelado', 'preparando', 'pendente', 'pronto'] as const, [62, 9, 10, 10, 9]);
  const scenario = orderStatus === 'entregue' ? pick(['valid', 'skipped', 'invalid', 'corrupt'] as const, [72, 10, 12, 6]) : orderStatus === 'cancelado' ? pick(['valid', 'none'] as const, [40, 60]) : 'none';

  const waitS = Math.floor(rand() * 900);
  const prepS = 120 + Math.floor(rand() * 2400);
  const routeS = 60 + Math.floor(rand() * 2400);
  const preparingAt = new Date(createdAt.getTime() + waitS * 1000);
  const readyAt = new Date(preparingAt.getTime() + prepS * 1000);
  const deliveredAt = new Date(readyAt.getTime() + routeS * 1000);
  const estTotal = forceEstZero ? 0 : engine.estimatedTotalMinutes;

  let metricsStatus: Gen['metricsStatus'] = 'MISSING_DATA';
  let m = { actualPrepSeconds: null, actualRouteSeconds: null, actualTotalSeconds: null, predictionErrorMinutes: null, predictionAbsoluteErrorMinutes: null, predictionErrorPercent: null } as {
    actualPrepSeconds: number | null;
    actualRouteSeconds: number | null;
    actualTotalSeconds: number | null;
    predictionErrorMinutes: number | null;
    predictionAbsoluteErrorMinutes: number | null;
    predictionErrorPercent: number | null;
  };
  let lifeline: [Date | null, Date | null, Date | null] = [null, null, null];
  if (scenario === 'valid' || scenario === 'corrupt') {
    const a = computeActualMetrics({ createdAt, preparingAt, readyAt, deliveredAt }, estTotal);
    metricsStatus = a.metricsStatus;
    m = a;
    lifeline = [preparingAt, readyAt, deliveredAt];
    if (scenario === 'corrupt') {
      // VALID no banco, mas métricas faltando (dado corrompido): deve virar 'invalid', nunca entrar na precisão.
      m = { ...a, actualRouteSeconds: null };
    }
  } else if (scenario === 'invalid') {
    metricsStatus = 'INVALID_TIMESTAMPS';
  } else if (scenario === 'skipped') {
    metricsStatus = 'MISSING_DATA';
  }
  return {
    odiId: randomUUID(),
    orderId: randomUUID(),
    tenantId,
    locationId,
    createdAt,
    orderStatus,
    paymentMethod: pick(['pix', 'cartao', 'dinheiro', 'indefinido', null] as const, [30, 35, 25, 5, 5]),
    customerName: rand() < 0.9 ? `Cliente ${Math.floor(rand() * 1000)}` : null,
    deletedAt: rand() < 0.08 ? new Date(createdAt.getTime() + 3600_000) : null,
    confidence: engine.confidence,
    provider,
    metricsStatus,
    floorApplied: engine.floorApplied,
    estPrep: engine.estimatedPrepMinutes,
    estRoute: engine.estimatedRouteMinutes,
    estTotal,
    estMin: engine.estimatedMinMinutes,
    estMax: engine.estimatedMaxMinutes,
    active: engine.activeOrders,
    baseUsed: engine.basePrepMinutes,
    penaltyUsed: engine.queuePenaltyMinutes,
    peak: engine.peakMultiplier,
    distance: Math.round(rand() * 15000) / 1000,
    actPrepS: m.actualPrepSeconds,
    actRouteS: m.actualRouteSeconds,
    actTotalS: m.actualTotalSeconds,
    err: m.predictionErrorMinutes,
    absErr: m.predictionAbsoluteErrorMinutes,
    errPct: m.predictionErrorPercent,
    preparingAt: lifeline[0],
    readyAt: lifeline[1],
    deliveredAt: lifeline[2],
  };
}

const classOf = (g: Gen): SiodRecordClass => {
  const complete = g.actTotalS !== null && g.actPrepS !== null && g.actRouteS !== null && g.err !== null && g.absErr !== null;
  return classifyRecord(g.metricsStatus, g.orderStatus, complete);
};

// Linha MONTADA À MÃO (sem sorteio): valida fronteiras exatas e exclusões de calibração.
function manualRow(
  tenantId: string,
  locationId: string,
  createdAt: Date,
  o: { prep: number; route: number; min: number; max: number; totalS: number; routeS: number; active: number; peak: number; floorApplied: boolean; baseUsed: number },
): Gen {
  const prepS = o.totalS - o.routeS; // espera 0: pedido→pronto = total − rota
  const preparingAt = createdAt;
  const readyAt = new Date(createdAt.getTime() + prepS * 1000);
  const deliveredAt = new Date(readyAt.getTime() + o.routeS * 1000);
  const estTotal = o.prep + o.route;
  const m = computeActualMetrics({ createdAt, preparingAt, readyAt, deliveredAt }, estTotal);
  return {
    odiId: randomUUID(),
    orderId: randomUUID(),
    tenantId,
    locationId,
    createdAt,
    orderStatus: 'entregue',
    paymentMethod: 'pix',
    customerName: 'Manual',
    deletedAt: null,
    confidence: 'HIGH',
    provider: 'OSRM',
    metricsStatus: m.metricsStatus,
    floorApplied: o.floorApplied,
    estPrep: o.prep,
    estRoute: o.route,
    estTotal,
    estMin: o.min,
    estMax: o.max,
    active: o.active,
    baseUsed: o.baseUsed,
    penaltyUsed: o.active * 2,
    peak: o.peak,
    distance: 3,
    actPrepS: m.actualPrepSeconds,
    actRouteS: m.actualRouteSeconds,
    actTotalS: m.actualTotalSeconds,
    err: m.predictionErrorMinutes,
    absErr: m.predictionAbsoluteErrorMinutes,
    errPct: m.predictionErrorPercent,
    preparingAt,
    readyAt,
    deliveredAt,
  };
}

// Percentil contínuo (mesma definição do percentile_cont do Postgres).
function percentileCont(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const rank = p * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}
const mean = (xs: number[]): number | null => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);

export type Svc = {
  getSettings(t: string): Promise<ReturnType<typeof buildSettingsView>>;
  saveSettings(t: string, body: unknown): Promise<ReturnType<typeof buildSettingsView>>;
  resetSettings(t: string): Promise<ReturnType<typeof buildSettingsView>>;
  overview(t: string, period?: string, from?: string, to?: string, loc?: string): Promise<unknown>;
  orders(t: string, q: Record<string, string | undefined>): Promise<unknown>;
};

export async function runDbChecks(
  query: QueryFn,
  ok: Ok,
  makeService: () => Svc,
  rejectsAs: (fn: () => Promise<unknown>, name: 'BadRequestException' | 'NotFoundException') => Promise<boolean>,
  asPgStrings: (q: QueryFn) => QueryFn,
): Promise<void> {
  const q = query;
  await q(`TRUNCATE tenants CASCADE`, []);
  const [tA] = await q(`INSERT INTO tenants (slug, name) VALUES ('siod-a', 'A') RETURNING id`, []);
  const [tB] = await q(`INSERT INTO tenants (slug, name) VALUES ('siod-b', 'B') RETURNING id`, []);
  const [tC] = await q(`INSERT INTO tenants (slug, name) VALUES ('siod-c', 'C') RETURNING id`, []);
  const A = tA.id as string;
  const B = tB.id as string;
  const C = tC.id as string;
  const loc = async (t: string, name: string): Promise<string> => (await q(`INSERT INTO locations (tenant_id, name) VALUES ($1, $2) RETURNING id`, [t, name]))[0].id as string;
  const A1 = await loc(A, 'A1');
  const A2 = await loc(A, 'A2');
  const B1 = await loc(B, 'B1');
  const C1 = await loc(C, 'C1');
  const [tD] = await q(`INSERT INTO tenants (slug, name) VALUES ('siod-d', 'D') RETURNING id`, []);
  const D = tD.id as string;
  const D1 = await loc(D, 'D1');

  const FROM = '2026-06-01';
  const TO = '2026-06-14';
  const range = resolveRange('custom', FROM, TO);
  const fromMs = new Date(range.from).getTime();
  const toMs = new Date(range.to).getTime();
  const rand = rng(777);

  // ---- geração ----
  const rowsA: Gen[] = [];
  for (let i = 0; i < 700; i++) {
    const t = fromMs + Math.floor(rand() * (toMs - fromMs));
    rowsA.push(makeRow(rand, A, rand() < 0.6 ? A1 : A2, new Date(t)));
  }
  // fronteiras: from (entra), from-1ms (fora), to (fora), to-1ms (entra), viradas do dia em BRT (03:00Z)
  const edgeTimes = [fromMs, fromMs - 1, toMs, toMs - 1, fromMs + 24 * 3600_000 - 1, fromMs + 24 * 3600_000];
  for (const t of edgeTimes) rowsA.push(makeRow(rand, A, A1, new Date(t)));
  // empates de created_at (desempate por id)
  const tie = new Date(fromMs + 5 * 24 * 3600_000 + 12345);
  for (let i = 0; i < 6; i++) rowsA.push(makeRow(rand, A, A2, tie));
  // estimativa 0 => percentual nulo (sem divisão por zero)
  rowsA.push(makeRow(rand, A, A1, new Date(fromMs + 3 * 24 * 3600_000 + 777), true));
  rowsA.push(makeRow(rand, A, A1, new Date(fromMs + 4 * 24 * 3600_000 + 777), true));
  // cozinha vazia: alimenta a calibração do preparo base (precisa de amostra >= 30)
  for (let i = 0; i < 110; i++) rowsA.push(makeRow(rand, A, A1, new Date(fromMs + Math.floor(rand() * (toMs - fromMs))), false, true));
  const rowsB: Gen[] = [];
  for (let i = 0; i < 120; i++) rowsB.push(makeRow(rand, B, B1, new Date(fromMs + Math.floor(rand() * (toMs - fromMs)))));
  const rowsC: Gen[] = [];
  for (let i = 0; i < 60; i++) rowsC.push(makeRow(rand, C, C1, new Date(fromMs + Math.floor(rand() * (toMs - fromMs)))));
  // C: poucos pedidos válidos sem fila => amostra de sugestão < 30
  // D: linhas montadas à mão (fronteiras exatas da janela e exclusões da calibração)
  const rowsD: Gen[] = [];
  const dT = (i: number): Date => new Date(fromMs + 3600_000 + i * 60_000);
  const win = { prep: 20, route: 10, min: 25, max: 40, routeS: 600, active: 1, peak: 1, floorApplied: false, baseUsed: 20 };
  rowsD.push(manualRow(D, D1, dT(0), { ...win, totalS: 25 * 60 })); // exatamente o limite inferior: DENTRO
  rowsD.push(manualRow(D, D1, dT(1), { ...win, totalS: 25 * 60 - 1 })); // 1 s antes: ANTES
  rowsD.push(manualRow(D, D1, dT(2), { ...win, totalS: 40 * 60 })); // exatamente o limite superior: DENTRO
  rowsD.push(manualRow(D, D1, dT(3), { ...win, totalS: 40 * 60 + 1 })); // 1 s depois: DEPOIS
  const wide = { prep: 20, route: 10, min: 1, max: 999, routeS: 600, peak: 1, baseUsed: 20 };
  // piso aplicado (NÃO podem entrar na calibração): totais enormes distorceriam a mediana se entrassem
  for (let i = 0; i < 35; i++) rowsD.push(manualRow(D, D1, dT(10 + i), { ...wide, totalS: 10000, active: 0, floorApplied: true }));
  for (let i = 0; i < 35; i++) rowsD.push(manualRow(D, D1, dT(50 + i), { ...wide, totalS: 10000, active: 2, floorApplied: true }));
  // calibráveis: cozinha vazia, pedido→pronto = 25 min => base 25; fila 3, (26 − 20)/3 = 2 min por pedido
  for (let i = 0; i < 31; i++) rowsD.push(manualRow(D, D1, dT(100 + i), { ...wide, totalS: 25 * 60 + 600, active: 0, floorApplied: false }));
  for (let i = 0; i < 31; i++) rowsD.push(manualRow(D, D1, dT(140 + i), { ...wide, totalS: 26 * 60 + 600, active: 3, floorApplied: false }));
  const all = [...rowsA, ...rowsB, ...rowsC, ...rowsD];

  const orderJson = all.map((g) => ({
    id: g.orderId,
    tenant_id: g.tenantId,
    location_id: g.locationId,
    status: g.orderStatus,
    payment_method: g.paymentMethod,
    customer_name: g.customerName,
    created_at: g.createdAt.toISOString(),
    preparing_at: g.preparingAt?.toISOString() ?? null,
    ready_at: g.readyAt?.toISOString() ?? null,
    delivered_at: g.deliveredAt?.toISOString() ?? null,
    deleted_at: g.deletedAt?.toISOString() ?? null,
  }));
  await q(
    `INSERT INTO orders (id, tenant_id, location_id, status, payment_method, customer_name, order_type, total, created_at, preparing_at, ready_at, delivered_at, deleted_at)
     SELECT x.id, x.tenant_id, x.location_id, x.status, x.payment_method, x.customer_name, 'entrega', 50, x.created_at, x.preparing_at, x.ready_at, x.delivered_at, x.deleted_at
     FROM jsonb_to_recordset($1::jsonb) AS x(id uuid, tenant_id uuid, location_id uuid, status text, payment_method text, customer_name text, created_at timestamptz, preparing_at timestamptz, ready_at timestamptz, delivered_at timestamptz, deleted_at timestamptz)`,
    [JSON.stringify(orderJson)],
  );
  const odiJson = all.map((g) => ({
    id: g.odiId,
    order_id: g.orderId,
    tenant_id: g.tenantId,
    created_at: g.createdAt.toISOString(),
    conf: g.confidence,
    prov: g.provider,
    fb: g.provider === 'HAVERSINE',
    ms: g.metricsStatus,
    payload: { computation: { floorApplied: g.floorApplied } },
    ep: g.estPrep,
    er: g.estRoute,
    et: g.estTotal,
    emin: g.estMin,
    emax: g.estMax,
    act: g.active,
    bu: g.baseUsed,
    pu: g.penaltyUsed,
    pk: g.peak,
    dist: g.distance,
    aps: g.actPrepS,
    ars: g.actRouteS,
    ats: g.actTotalS,
    err: g.err,
    aerr: g.absErr,
    epct: g.errPct,
  }));
  await q(
    `INSERT INTO order_delivery_intelligence (
       id, order_id, tenant_id, created_at, estimation_version, estimation_confidence, route_provider, route_fallback_used, metrics_status, engine_payload_json,
       origin_latitude, origin_longitude, destination_latitude, destination_longitude,
       estimated_prep_minutes, estimated_route_minutes, estimated_total_minutes, estimated_min_minutes, estimated_max_minutes,
       pending_orders_at_creation, preparing_orders_at_creation, active_orders_at_creation, base_prep_minutes_used, queue_penalty_minutes_used, route_minutes_used,
       peak_multiplier_used, distance_km_used, distance_km, route_seconds, items_count, items_value,
       actual_prep_seconds, actual_route_seconds, actual_total_seconds, prediction_error_minutes, prediction_absolute_error_minutes, prediction_error_percent)
     SELECT x.id, x.order_id, x.tenant_id, x.created_at, 'v1-heuristica-base', x.conf, x.prov, x.fb, x.ms, x.payload,
       -23.5, -46.6, -23.6, -46.7,
       x.ep, x.er, x.et, x.emin, x.emax,
       x.act, 0, x.act, x.bu, x.pu, x.er,
       x.pk, x.dist, x.dist, x.er * 60, 2, 40,
       x.aps, x.ars, x.ats, x.err, x.aerr, x.epct
     FROM jsonb_to_recordset($1::jsonb) AS x(id uuid, order_id uuid, tenant_id uuid, created_at timestamptz, conf text, prov text, fb boolean, ms text, payload jsonb,
       ep int, er int, et int, emin int, emax int, act int, bu int, pu int, pk numeric, dist numeric, aps int, ars int, ats int, err numeric, aerr numeric, epct numeric)`,
    [JSON.stringify(odiJson)],
  );

  const inRange = (g: Gen): boolean => g.createdAt.getTime() >= fromMs && g.createdAt.getTime() < toMs;
  const expA = rowsA.filter(inRange);
  const params = { ...DEFAULT_SIOD_PARAMS };
  const run = (t: string, l: string | null, qf: QueryFn = q) => loadOverview(qf, t, range, l, params);

  console.log('8) SQL x cálculo independente (700+ pedidos aleatórios, Postgres real)');
  const ov = await run(A, null);
  const cls = (rows: Gen[], c: SiodRecordClass): Gen[] => rows.filter((g) => classOf(g) === c);
  const valid = cls(expA, 'valid');
  ok(ov.counts.total === expA.length, `total no período = ${expA.length} (fronteiras [from,to) respeitadas)`);
  ok(
    ov.counts.valid === valid.length && ov.counts.invalid === cls(expA, 'invalid').length && ov.counts.skipped === cls(expA, 'skipped').length && ov.counts.inProgress === cls(expA, 'in_progress').length && ov.counts.cancelled === cls(expA, 'cancelled').length,
    `contagens por classe batem (válidos ${valid.length}, inválidos ${ov.counts.invalid}, sem etapas ${ov.counts.skipped}, andamento ${ov.counts.inProgress}, cancelados ${ov.counts.cancelled})`,
  );
  ok(ov.counts.valid + ov.counts.invalid + ov.counts.skipped + ov.counts.inProgress + ov.counts.cancelled === ov.counts.total, 'PARTIÇÃO: as 5 classes somam exatamente o total');
  ok(ov.counts.fallbackUsed === expA.filter((g) => g.provider === 'HAVERSINE').length, 'contagem de fallback bate');
  ok(cls(expA, 'cancelled').some((g) => g.metricsStatus === 'VALID') && cls(expA, 'invalid').some((g) => g.metricsStatus === 'VALID'), 'cenário coberto: cancelado com métricas VALID e VALID corrompido');
  ok(expA.some((g) => g.deletedAt !== null) && ov.counts.total === expA.length, 'pedidos com soft-delete continuam contados');

  const a = ov.accuracy;
  ok(a !== null && a.sample === valid.length, 'precisão usa só os válidos (cancelado e corrompido ficam fora)');
  if (a) {
    const errs = valid.map((g) => g.err as number);
    const abs = valid.map((g) => g.absErr as number).sort((x, y) => x - y);
    const pcts = valid.filter((g) => g.errPct !== null).map((g) => g.errPct as number);
    ok(near(a.biasMinutes, round2(mean(errs) as number)), `viés médio ${a.biasMinutes}`);
    ok(near(a.maeMinutes, round2(mean(abs) as number)), `erro absoluto médio ${a.maeMinutes}`);
    ok(near(a.medianAbsMinutes, round2(percentileCont(abs, 0.5) as number)), `mediana do erro absoluto ${a.medianAbsMinutes}`);
    ok(near(a.p90AbsMinutes, round2(percentileCont(abs, 0.9) as number)), `p90 do erro absoluto ${a.p90AbsMinutes}`);
    ok(near(a.biasPercent, round2(mean(pcts) as number)) && near(a.mapePercent, round2(mean(pcts.map(Math.abs)) as number)), 'viés % e MAPE ignoram estimativa 0 (percentual nulo)');
    const within = valid.filter((g) => (g.actTotalS as number) >= g.estMin * 60 && (g.actTotalS as number) <= g.estMax * 60).length;
    const early = valid.filter((g) => (g.actTotalS as number) < g.estMin * 60).length;
    const late = valid.filter((g) => (g.actTotalS as number) > g.estMax * 60).length;
    ok(within + early + late === valid.length, 'dentro + antes + depois da janela = todos os válidos');
    ok(near(a.withinWindowPercent, ratePercent(within, valid.length)) && near(a.earlyPercent, ratePercent(early, valid.length)) && near(a.latePercent, ratePercent(late, valid.length)), 'percentuais da janela batem');
    ok(Math.abs(a.withinWindowPercent + a.earlyPercent + a.latePercent - 100) <= 0.03, 'percentuais da janela somam 100 (±arredondamento)');
    ok(near(a.avgEstimatedTotalMinutes, round2(mean(valid.map((g) => g.estTotal)) as number)) && near(a.avgActualTotalMinutes, round2((mean(valid.map((g) => g.actTotalS as number)) as number) / 60)), 'médias estimado/real batem');
    ok(valid.every((g) => near(g.err, round2(((g.actTotalS as number) - g.estTotal * 60) / 60), 0.0101)), 'erro gravado = real − estimado (conferido linha a linha)');
  }
  const comp = ov.components;
  ok(comp !== null, 'componentes calculados');
  if (comp) {
    const prepPhase = (mean(valid.map((g) => (g.actTotalS as number) - (g.actRouteS as number))) as number) / 60;
    const kitchen = (mean(valid.map((g) => g.actPrepS as number)) as number) / 60;
    ok(near(comp.actualPrepMinutes, round2(prepPhase)) && near(comp.actualKitchenMinutes, round2(kitchen)), 'preparo (pedido→pronto) e cozinha (preparando→pronto) batem');
    ok(near(comp.actualWaitMinutes, round2(prepPhase - kitchen)), 'espera até iniciar o preparo = diferença das duas');
    ok(near(comp.estimatedPrepMinutes, round2(mean(valid.map((g) => g.estPrep)) as number)) && near(comp.estimatedRouteMinutes, round2(mean(valid.map((g) => g.estRoute)) as number)) && near(comp.actualRouteMinutes, round2((mean(valid.map((g) => g.actRouteS as number)) as number) / 60)), 'estimado x real por etapa bate');
  }

  console.log('9) Série temporal e grupos: somas e médias ponderadas conferem');
  ok(ov.series.length === 14, 'série contínua: 14 dias, mesmo os sem pedido');
  ok(ov.series.reduce((s, p) => s + p.total, 0) === ov.counts.total && ov.series.reduce((s, p) => s + p.valid, 0) === ov.counts.valid, 'série soma total e válidos');
  const dayOf = (d: Date): string => new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
  const byDay = new Map<string, Gen[]>();
  for (const g of expA) byDay.set(dayOf(g.createdAt), [...(byDay.get(dayOf(g.createdAt)) ?? []), g]);
  ok(
    ov.series.every((p) => {
      const rows = byDay.get(p.bucket.slice(0, 10)) ?? [];
      const v = rows.filter((g) => classOf(g) === 'valid');
      return p.total === rows.length && p.valid === v.length && (v.length === 0 ? p.maeMinutes === null && p.avgEstimatedMinutes === null : near(p.maeMinutes, round2(mean(v.map((g) => g.absErr as number)) as number)));
    }),
    'cada dia (fuso de São Paulo) bate com o oráculo, incluindo viradas de 03:00Z',
  );
  ok(ov.series.every((p) => (p.valid === 0) === (p.avgActualMinutes === null)), 'dia sem válido => médias nulas (nunca 0 inventado)');
  const dims = [ov.byConfidence, ov.byProvider, ov.byQueue, ov.byPeak, ov.byPayment];
  ok(dims.every((d) => d.reduce((s, r) => s + r.total, 0) === ov.counts.total && d.reduce((s, r) => s + r.valid, 0) === ov.counts.valid), 'cada quebra (confiança/rota/fila/pico/pagamento) soma o total e os válidos');
  ok(dims.every((d) => near(d.reduce((s, r) => s + (r.maeMinutes ?? 0) * r.valid, 0) / (ov.counts.valid || 1), a?.maeMinutes ?? 0, 0.05)), 'média ponderada do erro de cada quebra = erro geral');
  const grp = (keyFn: (g: Gen) => string) => {
    const m = new Map<string, Gen[]>();
    for (const g of expA) m.set(keyFn(g), [...(m.get(keyFn(g)) ?? []), g]);
    return m;
  };
  const checkGroup = (rows: typeof ov.byConfidence, m: Map<string, Gen[]>, label: string): void => {
    ok(
      rows.length === m.size &&
        rows.every((r) => {
          const gs = m.get(r.key) ?? [];
          const v = gs.filter((g) => classOf(g) === 'valid');
          const w = v.filter((g) => (g.actTotalS as number) >= g.estMin * 60 && (g.actTotalS as number) <= g.estMax * 60).length;
          return r.total === gs.length && r.valid === v.length && (v.length === 0 ? r.maeMinutes === null && r.biasMinutes === null && r.withinWindowPercent === null : near(r.maeMinutes, round2(mean(v.map((g) => g.absErr as number)) as number)) && near(r.biasMinutes, round2(mean(v.map((g) => g.err as number)) as number)) && near(r.withinWindowPercent, ratePercent(w, v.length)));
        }),
      `quebra por ${label} bate com o oráculo`,
    );
  };
  checkGroup(ov.byConfidence, grp((g) => g.confidence), 'confiança');
  checkGroup(ov.byProvider, grp((g) => g.provider), 'rota');
  checkGroup(ov.byQueue, grp((g) => (g.active <= 2 ? 'q0_2' : g.active <= 5 ? 'q3_5' : g.active <= 8 ? 'q6_8' : 'q9p')), 'fila');
  checkGroup(ov.byPeak, grp((g) => (g.peak > 1 ? 'peak' : 'normal')), 'pico');
  checkGroup(ov.byPayment, grp((g) => (g.paymentMethod === 'pix' || g.paymentMethod === 'cartao' || g.paymentMethod === 'dinheiro' ? g.paymentMethod : 'outro')), 'pagamento');

  console.log('10) Sugestões conferidas com a mediana independente');
  const baseRows = valid.filter((g) => g.active === 0 && g.peak === 1 && !g.floorApplied);
  const penRows = valid.filter((g) => g.active >= 1 && g.peak === 1 && !g.floorApplied);
  ok(ov.suggestions.basePrep.sampleSize === baseRows.length && ov.suggestions.queuePenalty.sampleSize === penRows.length, `tamanhos de amostra batem (base ${baseRows.length}, penalidade ${penRows.length})`);
  const baseMed = median(baseRows.map((g) => ((g.actTotalS as number) - (g.actRouteS as number)) / 60));
  const penMed = median(penRows.map((g) => ((((g.actTotalS as number) - (g.actRouteS as number)) / 60) - g.baseUsed) / g.active));
  const expectBase = baseRows.length >= SIOD_MIN_SAMPLE_FOR_SUGGESTION && baseMed !== null ? Math.min(240, Math.max(0, Math.round(baseMed))) : null;
  const expectPen = penRows.length >= SIOD_MIN_SAMPLE_FOR_SUGGESTION && penMed !== null ? Math.min(60, Math.max(0, Math.round(penMed))) : null;
  ok(expectBase !== null && penMed !== null, 'cenário coberto: as duas sugestões têm amostra suficiente (valor não nulo)');
  ok(ov.suggestions.basePrep.value === expectBase || (expectBase !== null && ov.suggestions.basePrep.value !== null && Math.abs(ov.suggestions.basePrep.value - expectBase) <= 1), `sugestão de preparo base = ${expectBase} (obtida ${ov.suggestions.basePrep.value})`);
  ok(ov.suggestions.queuePenalty.value === expectPen || (expectPen !== null && ov.suggestions.queuePenalty.value !== null && Math.abs(ov.suggestions.queuePenalty.value - expectPen) <= 1), `sugestão de minutos por pedido = ${expectPen} (obtida ${ov.suggestions.queuePenalty.value})`);
  ok(ov.suggestions.basePrep.current === params.basePrepMinutes && ov.suggestions.queuePenalty.current === params.queuePenaltyMinutesPerOrder, 'sugestão traz o valor atual para comparação');
  const ovC = await run(C, null);
  ok(ovC.suggestions.basePrep.sampleSize < SIOD_MIN_SAMPLE_FOR_SUGGESTION ? ovC.suggestions.basePrep.value === null && ovC.suggestions.basePrep.reason !== null : true, 'restaurante com amostra pequena: sem sugestão e com motivo');

  console.log('10b) Fronteiras exatas da janela e exclusões da calibração (linhas montadas à mão)');
  const ovD = await run(D, null);
  ok(ovD.counts.valid === 4 + 35 + 35 + 31 + 31 && ovD.counts.total === ovD.counts.valid, `restaurante D: ${ovD.counts.valid} válidos`);
  const aD = ovD.accuracy;
  const nD = ovD.counts.valid;
  ok(aD !== null && near(aD.earlyPercent, ratePercent(1, nD)) && near(aD.latePercent, ratePercent(1, nD)) && near(aD.withinWindowPercent, ratePercent(nD - 2, nD)), 'limite inferior/superior exatos contam como DENTRO; 1 s fora conta como antes/depois');
  ok(ovD.suggestions.basePrep.sampleSize === 31 && ovD.suggestions.basePrep.value === 25, 'calibração do preparo base ignora as linhas com piso aplicado (31 amostras, mediana 25)');
  ok(ovD.suggestions.queuePenalty.sampleSize === 31 + 4 && ovD.suggestions.queuePenalty.value === 2, 'calibração da penalidade ignora piso (amostra 35 = 31 calibráveis + 4 de fronteira com fila 1; mediana 2 min/pedido, não distorcida pelos 70 com piso)');

  console.log('11) Isolamento entre restaurantes e filtro de loja');
  const ovB = await run(B, null);
  const expB = rowsB.filter(inRange);
  ok(ovB.counts.total === expB.length && ovB.counts.total !== ov.counts.total, 'restaurante B só enxerga os próprios registros');
  ok((await run(A, B1)).counts.total === 0, 'loja de OUTRO restaurante filtrada por A => zero registros (sem vazamento)');
  const ovA1 = await run(A, A1);
  const ovA2 = await run(A, A2);
  ok(ovA1.counts.total === expA.filter((g) => g.locationId === A1).length && ovA2.counts.total === expA.filter((g) => g.locationId === A2).length, 'filtro por loja bate com o oráculo');
  ok(ovA1.counts.total + ovA2.counts.total === ov.counts.total, 'lojas A1 + A2 = total do restaurante');
  const pageForeign = (await loadOrders(q, A, range, null, parseOrdersFilters({ pageSize: '100' }))).items;
  ok(pageForeign.every((r) => expA.some((g) => g.orderId === r.orderId)), 'listagem nunca traz pedido de outro restaurante');

  console.log('12) Período vazio e valores como o driver pg entrega (strings)');
  const empty = resolveRange('custom', '2025-01-01', '2025-01-03');
  const ovE = await loadOverview(q, A, empty, null, params);
  ok(ovE.counts.total === 0 && ovE.accuracy === null && ovE.components === null && ovE.sampleQuality === 'none', 'sem registros: zeros, precisão e componentes nulos');
  ok(ovE.series.length > 0 && ovE.series.every((p) => p.total === 0 && p.avgActualMinutes === null && p.maeMinutes === null), 'sem registros: série zerada com buckets, médias nulas');
  ok([ovE.byConfidence, ovE.byProvider, ovE.byQueue, ovE.byPeak, ovE.byPayment].every((d) => d.length === 0), 'sem registros: quebras vazias');
  ok(ovE.counts.fallbackRatePercent === null, 'taxa de fallback sem registros é null (não 0)');
  const ovStr = await run(A, null, asPgStrings(q));
  ok(JSON.stringify(ovStr) === JSON.stringify(ov), 'resultado idêntico quando numeric/bigint chegam como string (driver pg)');

  console.log('13) Listagem: paginação completa, ordem estável, filtros, campos');
  const filtersAll = parseOrdersFilters({ pageSize: '37' });
  const first = await loadOrders(q, A, range, null, filtersAll);
  ok(first.total === expA.length && first.pageSize === 37, 'total da listagem = total do período');
  const seen: string[] = [];
  for (let p = 1; p <= Math.ceil(first.total / 37); p++) {
    const pg = await loadOrders(q, A, range, null, parseOrdersFilters({ pageSize: '37', page: String(p) }));
    seen.push(...pg.items.map((i) => i.orderId));
  }
  ok(seen.length === expA.length && new Set(seen).size === expA.length, 'páginas cobrem cada pedido exatamente uma vez (sem repetir nem perder, mesmo com created_at empatado)');
  const expectedOrder = [...expA].sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime() || (x.odiId < y.odiId ? 1 : x.odiId > y.odiId ? -1 : 0)).map((g) => g.orderId);
  ok(JSON.stringify(seen) === JSON.stringify(expectedOrder), 'ordem = mais recente primeiro, desempate por id');
  ok((await loadOrders(q, A, range, null, parseOrdersFilters({ page: '9999' }))).items.length === 0, 'página além do fim => lista vazia (total correto)');
  for (const c of ['valid', 'invalid', 'skipped', 'in_progress', 'cancelled'] as const) {
    const r = await loadOrders(q, A, range, null, parseOrdersFilters({ recordClass: c, pageSize: '100' }));
    ok(r.total === cls(expA, c).length && r.items.every((i) => i.recordClass === c), `filtro recordClass=${c} bate (${r.total})`);
  }
  const rc = await loadOrders(q, A, range, null, parseOrdersFilters({ confidence: 'LOW', provider: 'HAVERSINE', pageSize: '100' }));
  ok(rc.total === expA.filter((g) => g.confidence === 'LOW' && g.provider === 'HAVERSINE').length && rc.items.every((i) => i.confidence === 'LOW' && i.routeProvider === 'HAVERSINE' && i.fallbackUsed), 'filtros combinados confiança+rota batem');
  const vlist = await loadOrders(q, A, range, null, parseOrdersFilters({ pageSize: '100' }));
  const byId = new Map(expA.map((g) => [g.orderId, g]));
  ok(
    vlist.items.every((i) => {
      const g = byId.get(i.orderId) as Gen;
      return i.recordClass === 'valid' ? i.actualTotalMinutes !== null && i.errorMinutes !== null && near(i.errorMinutes, round2(i.actualTotalMinutes - i.estimatedTotalMinutes), 0.02) : i.actualTotalMinutes === null && i.errorMinutes === null && i.estimatedTotalMinutes === g.estTotal;
    }),
    'itens: real/erro só nos válidos; nos demais ficam nulos (nunca valor inventado)',
  );
  ok(vlist.items.every((i) => !Number.isNaN(Date.parse(i.createdAt))), 'createdAt em ISO válido');

  console.log('14) Serviço: parâmetros (ler, salvar, restaurar) e erros de entrada');
  const svc = makeService();
  const s0 = await svc.getSettings(A);
  ok(s0.isDefault && s0.params.basePrepMinutes === 20, 'restaurante novo: padrão (isDefault)');
  const wanted = { ...DEFAULT_SIOD_PARAMS, basePrepMinutes: 35, queuePenaltyMinutesPerOrder: 4, peakStepPerOrder: 0.15 };
  const s1 = await svc.saveSettings(A, wanted);
  ok(!s1.isDefault && s1.params.basePrepMinutes === 35 && s1.params.peakStepPerOrder === 0.15, 'salvar devolve a visão atualizada');
  const raw = (await q(`SELECT siod_settings AS s FROM tenants WHERE id = $1`, [A]))[0].s as Record<string, number>;
  ok(SIOD_PARAM_KEYS.every((k) => raw[k] === (wanted as SiodParams)[k]) && Object.keys(raw).length === 8, 'no banco ficam exatamente os 8 parâmetros validados');
  ok((await q(`SELECT siod_settings AS s FROM tenants WHERE id = $1`, [B]))[0].s === null, 'salvar em A não toca em B');
  ok(await rejectsAs(() => svc.saveSettings(A, { ...wanted, basePrepMinutes: 999 }), 'BadRequestException'), 'valor fora da faixa => 400');
  ok(await rejectsAs(() => svc.saveSettings(A, { ...wanted, minTotalMinutes: 10 }), 'BadRequestException'), 'prazo mínimo abaixo de 15 => 400');
  ok(await rejectsAs(() => svc.saveSettings(A, { basePrepMinutes: 30 }), 'BadRequestException'), 'conjunto incompleto => 400');
  ok(await rejectsAs(() => svc.saveSettings(A, { ...wanted, evil: "'); DROP TABLE tenants;--" }), 'BadRequestException'), 'campo extra => 400');
  const rawAfter = (await q(`SELECT siod_settings AS s FROM tenants WHERE id = $1`, [A]))[0].s as Record<string, number>;
  ok(rawAfter.basePrepMinutes === 35 && (await q(`SELECT 1 FROM tenants WHERE id = $1`, [A])).length === 1, 'tentativas inválidas não alteram nada no banco');
  const s2 = await svc.resetSettings(A);
  ok(s2.isDefault && s2.params.basePrepMinutes === 20 && (await q(`SELECT siod_settings AS s FROM tenants WHERE id = $1`, [A]))[0].s === null, 'restaurar padrão => NULL no banco');
  ok(await rejectsAs(() => svc.saveSettings(randomUUID(), wanted), 'NotFoundException'), 'restaurante inexistente => 404 ao salvar');
  ok(await rejectsAs(() => svc.getSettings(randomUUID()), 'NotFoundException'), 'restaurante inexistente => 404 ao ler');
  // O motor passa a usar o que foi salvo e as sugestões comparam com o valor ATUAL.
  await svc.saveSettings(A, wanted);
  const ovSvc = (await svc.overview(A, 'custom', FROM, TO)) as typeof ov;
  ok(ovSvc.suggestions.basePrep.current === 35 && ovSvc.suggestions.queuePenalty.current === 4, 'visão geral usa os parâmetros salvos como "atual"');
  ok(ovSvc.counts.total === ov.counts.total, 'serviço (com resolveRange) devolve o mesmo total do núcleo');
  ok(await rejectsAs(() => svc.overview(A, 'custom', FROM, TO, "x' OR '1'='1"), 'BadRequestException'), 'locationId malformado => 400 (sem chegar ao SQL)');
  ok(await rejectsAs(() => svc.overview(A, 'periodo-inexistente'), 'BadRequestException'), 'período inválido => 400');
  ok(await rejectsAs(() => svc.overview(A, 'custom', '2026-13-45', '2026-14-99'), 'BadRequestException'), 'datas inválidas => 400');
  ok(await rejectsAs(() => svc.orders(A, { period: 'custom', from: FROM, to: TO, recordClass: 'hack' }), 'BadRequestException'), 'filtro inválido na listagem => 400');
  const page = (await svc.orders(A, { period: 'custom', from: FROM, to: TO, pageSize: '5' })) as { items: unknown[]; total: number };
  ok(page.items.length === 5 && page.total === ov.counts.total, 'serviço: listagem paginada funciona de ponta a ponta');
  for (const t of [A, B, C]) await svc.resetSettings(t);
}
