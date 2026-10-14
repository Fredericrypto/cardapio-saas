// Auditoria do SIOD (sem banco, sem rede): motor determinístico, métricas reais /
// feedback, carimbos do ciclo de vida e cliente OSRM com fallback Haversine
// (fetch simulado). Rodar: npm run test:siod
import { computeActualMetrics, peakMultiplierHundredths, resolveSiodParams, runSiodEngine } from '../src/modules/siod/siod.math';
import {
  computeRoute,
  DEFAULT_OSRM_URL,
  FetchLike,
  haversineFallback,
  normalizeOsrmBaseUrl,
  normalizeOsrmTimeout,
} from '../src/modules/siod/osrm.client';
import { DEFAULT_SIOD_PARAMS, EngineOutput, SiodParams } from '../src/modules/siod/siod.types';
import { stampOrderLifecycle, LifecycleStamps } from '../src/modules/orders/order-lifecycle';

let passed = 0;
let failed = 0;
function ok(cond: boolean, label: string): void {
  if (cond) {
    passed++;
    console.log(`  ok  ${label}`);
  } else {
    failed++;
    console.log(`  FALHOU  ${label}`);
  }
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const at = (s: string) => new Date(`2026-10-13T${s}Z`);
const P: SiodParams = { ...DEFAULT_SIOD_PARAMS };

function engine(pending: number, preparing: number, routeSeconds: number, params: SiodParams = P, provider: 'OSRM' | 'HAVERSINE' = 'OSRM'): EngineOutput {
  return runSiodEngine({ params, pendingOrders: pending, preparingOrders: preparing, routeSeconds, routeProvider: provider });
}

async function main(): Promise<void> {
  console.log('1) Motor — casos à mão');
  let e = engine(0, 0, 600);
  ok(e.estimatedPrepMinutes === 20 && e.estimatedRouteMinutes === 10 && e.estimatedTotalMinutes === 30, 'cozinha vazia, rota 10 min → 20 + 10 = 30');
  ok(e.estimatedMinMinutes === 25 && e.estimatedMaxMinutes === 40, 'janela -5/+10 → 25 a 40');
  ok(e.confidence === 'HIGH' && e.peakMultiplier === 1 && !e.floorApplied, 'confiança ALTA, sem pico, sem piso');

  e = engine(2, 1, 600);
  ok(e.activeOrders === 3 && e.queuePenaltyMinutes === 6 && e.prepRawMinutes === 26 && e.estimatedTotalMinutes === 36, 'active = pending + preparing (3); penalidade 3×2 = 6; prep 26; total 36');

  e = engine(0, 0, 61, { ...P, basePrepMinutes: 0, queuePenaltyMinutesPerOrder: 0 });
  ok(e.floorApplied && e.estimatedTotalMinutes === 15 && e.estimatedRouteMinutes === 2 && e.estimatedPrepMinutes === 13, 'piso 15 min: a folga entra no preparo (13 + 2 = 15)');
  ok(e.estimatedMinMinutes === 15 && e.estimatedMaxMinutes === 25, 'limite inferior da janela nunca fica abaixo do piso (15)');

  e = engine(5, 3, 600); // active 8, limiar 6 → +2 × 0,10 = 1,20
  ok(e.peakMultiplier === 1.2 && e.prepRawMinutes === 36 && e.prepAfterPeakMinutes === 44, 'pico: 8 ativos → ×1,20; 36 × 1,2 = 43,2 → ceil 44');
  ok(e.confidence === 'MEDIUM', 'pico rebaixa a confiança para MÉDIA');

  e = engine(100, 0, 600);
  ok(e.peakMultiplier === 1.5 && e.prepAfterPeakMinutes === Math.ceil((20 + 200) * 1.5), 'multiplicador de pico limitado ao teto 1,50');

  ok(peakMultiplierHundredths(6, P) === 100 && peakMultiplierHundredths(7, P) === 110, 'limiar: 6 ativos sem efeito, 7 → ×1,10');

  e = engine(0, 0, 600, P, 'HAVERSINE');
  ok(e.confidence === 'LOW' && e.confidenceReasons.some((r) => r.includes('linha reta')), 'fallback Haversine → confiança BAIXA');

  e = engine(0, 0, 0);
  ok(e.estimatedRouteMinutes === 1, 'rota de 0 s vira no mínimo 1 min');
  e = engine(-3, Number.NaN, Number.NaN);
  ok(e.activeOrders === 0 && Number.isFinite(e.estimatedTotalMinutes), 'entradas inválidas (negativo/NaN) não quebram o motor');

  console.log('2) Motor — invariantes em 2000 casos aleatórios (semente fixa)');
  let seed = 123456789;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  let bad = 0;
  for (let i = 0; i < 2000; i++) {
    const params = resolveSiodParams({
      basePrepMinutes: Math.floor(rnd() * 60),
      queuePenaltyMinutesPerOrder: Math.floor(rnd() * 8),
      minTotalMinutes: 10 + Math.floor(rnd() * 40),
      windowBelowMinutes: Math.floor(rnd() * 15),
      windowAboveMinutes: Math.floor(rnd() * 30),
      peakThresholdActiveOrders: 1 + Math.floor(rnd() * 12),
      peakStepPerOrder: Math.round(rnd() * 30) / 100,
      peakMaxMultiplier: 1 + Math.round(rnd() * 200) / 100,
    });
    const pending = Math.floor(rnd() * 25);
    const preparing = Math.floor(rnd() * 25);
    const sec = Math.floor(rnd() * 7200);
    const o = runSiodEngine({ params, pendingOrders: pending, preparingOrders: preparing, routeSeconds: sec, routeProvider: 'OSRM' });
    const more = runSiodEngine({ params, pendingOrders: pending + 1, preparingOrders: preparing, routeSeconds: sec, routeProvider: 'OSRM' });
    const good =
      o.estimatedPrepMinutes + o.estimatedRouteMinutes === o.estimatedTotalMinutes &&
      o.estimatedTotalMinutes >= 15 &&
      o.estimatedTotalMinutes >= params.minTotalMinutes &&
      o.estimatedMinMinutes <= o.estimatedTotalMinutes &&
      o.estimatedTotalMinutes <= o.estimatedMaxMinutes &&
      o.estimatedMinMinutes >= 15 &&
      o.peakMultiplier >= 1 && o.peakMultiplier <= params.peakMaxMultiplier + 1e-9 &&
      o.activeOrders === pending + preparing &&
      Number.isInteger(o.estimatedTotalMinutes) && Number.isInteger(o.estimatedPrepMinutes) &&
      more.estimatedTotalMinutes >= o.estimatedTotalMinutes;
    if (!good) bad++;
  }
  ok(bad === 0, `prep + rota = total; total ≥ piso; min ≤ total ≤ max; min ≥ 15; multiplicador em [1, teto]; inteiros; total monotônico na fila (${bad} violações)`);

  console.log('3) Parâmetros por tenant — sempre válidos');
  ok(eq(resolveSiodParams(null), DEFAULT_SIOD_PARAMS) && eq(resolveSiodParams('x'), DEFAULT_SIOD_PARAMS) && eq(resolveSiodParams([1]), DEFAULT_SIOD_PARAMS), 'null / texto / array → padrão');
  const r = resolveSiodParams({ basePrepMinutes: -5, queuePenaltyMinutesPerOrder: 'abc', minTotalMinutes: 5, peakStepPerOrder: 9, peakMaxMultiplier: 0.2, windowAboveMinutes: 9999, peakThresholdActiveOrders: 0 });
  ok(r.basePrepMinutes === 0 && r.queuePenaltyMinutesPerOrder === 2 && r.minTotalMinutes === 15 && r.peakStepPerOrder === 1 && r.peakMaxMultiplier === 1 && r.windowAboveMinutes === 120 && r.peakThresholdActiveOrders === 1, 'valores fora da faixa são limitados; tipo errado vira padrão; piso estrutural ≥ 15');
  ok(resolveSiodParams({ basePrepMinutes: 33.6 }).basePrepMinutes === 34, 'minutos fracionados arredondam');

  console.log('4) Métricas reais e feedback (Camadas 3–4)');
  let m = computeActualMetrics({ createdAt: at('12:00:00'), preparingAt: at('12:02:00'), readyAt: at('12:20:00'), deliveredAt: at('12:45:00') }, 40);
  ok(m.metricsStatus === 'VALID' && m.actualPrepSeconds === 1080 && m.actualRouteSeconds === 1500 && m.actualTotalSeconds === 2700, 'prep 18 min, rota 25 min, total 45 min (em segundos)');
  ok(m.predictionErrorMinutes === 5 && m.predictionAbsoluteErrorMinutes === 5 && m.predictionErrorPercent === 12.5, 'real 45 vs estimado 40 → +5,00 min, |5,00|, +12,50%');
  m = computeActualMetrics({ createdAt: at('12:00:00'), preparingAt: at('12:02:00'), readyAt: at('12:20:00'), deliveredAt: at('12:45:00') }, 50);
  ok(m.predictionErrorMinutes === -5 && m.predictionAbsoluteErrorMinutes === 5 && m.predictionErrorPercent === -10, 'entregou antes: erro -5,00 (abs 5,00), -10,00%');
  m = computeActualMetrics({ createdAt: at('12:00:00'), preparingAt: at('12:00:00'), readyAt: at('12:00:00'), deliveredAt: at('12:00:00') }, 30);
  ok(m.metricsStatus === 'VALID' && m.actualTotalSeconds === 0 && m.predictionErrorMinutes === -30 && m.predictionErrorPercent === -100, 'timestamps iguais são válidos (zeros)');
  m = computeActualMetrics({ createdAt: at('12:00:00'), preparingAt: at('12:00:00'), readyAt: at('12:10:07'), deliveredAt: at('12:30:00') }, 33);
  ok(m.predictionErrorMinutes === -3 && m.actualPrepSeconds === 607, 'erro em minutos com 2 casas (30:00 vs 33 → -3,00)');
  m = computeActualMetrics({ createdAt: at('12:00:00'), preparingAt: at('12:00:00'), readyAt: at('12:00:00'), deliveredAt: at('12:41:40') }, 40);
  ok(m.predictionErrorMinutes === 1.67 && m.predictionErrorPercent === 4.17, 'arredondamento a 2 casas: 41:40 vs 40 → +1,67 min / +4,17%');

  const invalidCases: Array<[string, Parameters<typeof computeActualMetrics>[0]]> = [
    ['readyAt < preparingAt', { createdAt: at('12:00:00'), preparingAt: at('12:20:00'), readyAt: at('12:10:00'), deliveredAt: at('12:45:00') }],
    ['deliveredAt < readyAt', { createdAt: at('12:00:00'), preparingAt: at('12:02:00'), readyAt: at('12:30:00'), deliveredAt: at('12:25:00') }],
    ['preparingAt < createdAt', { createdAt: at('12:05:00'), preparingAt: at('12:02:00'), readyAt: at('12:30:00'), deliveredAt: at('12:45:00') }],
    ['data inválida (NaN)', { createdAt: at('12:00:00'), preparingAt: new Date('lixo'), readyAt: at('12:30:00'), deliveredAt: at('12:45:00') }],
  ];
  for (const [name, t] of invalidCases) {
    let threw = false;
    let res: ReturnType<typeof computeActualMetrics> | null = null;
    try { res = computeActualMetrics(t, 40); } catch { threw = true; }
    ok(!threw && res !== null && res.metricsStatus === 'INVALID_TIMESTAMPS' && res.actualPrepSeconds === null && res.actualRouteSeconds === null && res.actualTotalSeconds === null && res.predictionErrorMinutes === null && res.predictionAbsoluteErrorMinutes === null && res.predictionErrorPercent === null, `${name} → INVALID_TIMESTAMPS, sem exceção, sem métricas derivadas`);
  }
  for (const [name, t] of [
    ['sem preparingAt', { createdAt: at('12:00:00'), preparingAt: null, readyAt: at('12:30:00'), deliveredAt: at('12:45:00') }],
    ['sem readyAt', { createdAt: at('12:00:00'), preparingAt: at('12:02:00'), readyAt: null, deliveredAt: at('12:45:00') }],
    ['sem deliveredAt', { createdAt: at('12:00:00'), preparingAt: at('12:02:00'), readyAt: at('12:30:00'), deliveredAt: null }],
  ] as const) {
    const res = computeActualMetrics(t, 40);
    ok(res.metricsStatus === 'MISSING_DATA' && res.actualTotalSeconds === null && res.predictionErrorMinutes === null, `${name} → MISSING_DATA`);
  }

  console.log('5) Carimbos do ciclo de vida (Order)');
  const mk = (status: string): LifecycleStamps => ({ status, preparingAt: null, readyAt: null, deliveredAt: null });
  let o = mk('pendente');
  stampOrderLifecycle(o, 'preparando', at('12:02:00'));
  ok(eq(o.preparingAt, at('12:02:00')) && o.readyAt === null && o.deliveredAt === null, 'preparando carimba preparingAt');
  o.status = 'preparando';
  stampOrderLifecycle(o, 'preparando', at('12:09:00'));
  ok(eq(o.preparingAt, at('12:02:00')), 'mesmo status de novo não mexe no carimbo');
  stampOrderLifecycle(o, 'pronto', at('12:20:00'));
  o.status = 'pronto';
  stampOrderLifecycle(o, 'preparando', at('12:21:00'));
  o.status = 'preparando';
  ok(eq(o.preparingAt, at('12:02:00')) && eq(o.readyAt, at('12:20:00')), 'voltar para preparando não apaga os primeiros instantes');
  stampOrderLifecycle(o, 'entregue', at('12:45:00'));
  ok(eq(o.deliveredAt, at('12:45:00')), 'entregue carimba deliveredAt');
  o = mk('pendente');
  stampOrderLifecycle(o, 'entregue', at('12:45:00'));
  ok(o.preparingAt === null && o.readyAt === null && eq(o.deliveredAt, at('12:45:00')), 'concluir direto da fila deixa preparingAt/readyAt nulos (→ MISSING_DATA)');
  stampOrderLifecycle(o, 'cancelado', at('12:46:00'));
  ok(eq(o.deliveredAt, at('12:45:00')), 'cancelar não carimba nada');

  console.log('6) Rota — OSRM com fallback Haversine (fetch simulado)');
  const origin = { latitude: -23.5505, longitude: -46.6333 };
  const dest = { latitude: -23.5614, longitude: -46.6559 };
  // referência independente (fórmula de Haversine escrita de outro jeito)
  const rad = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(rad(dest.latitude - origin.latitude) / 2) ** 2 + Math.cos(rad(origin.latitude)) * Math.cos(rad(dest.latitude)) * Math.sin(rad(dest.longitude - origin.longitude) / 2) ** 2;
  const refStraight = 2 * 6371 * Math.asin(Math.sqrt(a));
  const cfg = (fetchImpl: FetchLike) => ({ baseUrl: 'https://osrm.test', timeoutMs: 80, fetchImpl });

  let seenUrl = '';
  const good: FetchLike = async (url) => {
    seenUrl = url;
    return { ok: true, status: 200, json: async () => ({ code: 'Ok', routes: [{ distance: 5321.4, duration: 612.4 }] }) };
  };
  let rt = await computeRoute(origin, dest, cfg(good));
  ok(rt.provider === 'OSRM' && !rt.fallbackUsed && rt.fallbackReason === null && rt.distanceKm === 5.321 && rt.durationSeconds === 612, 'OSRM ok → provider OSRM, 5,321 km, 612 s, sem fallback');
  ok(seenUrl.startsWith('https://osrm.test/route/v1/driving/-46.6333000,-23.5505000;-46.6559000,-23.5614000?'), 'URL: lon,lat (ordem do OSRM), origem;destino');
  ok(Math.abs(rt.straightLineKm - Math.round(refStraight * 1000) / 1000) < 0.002, 'linha reta registrada confere com o cálculo independente');

  const expectedFallbackKm = Math.round(refStraight * 1.3 * 1000) / 1000;
  const expectedFallbackSec = Math.round((refStraight * 1.3 / 25) * 3600);
  const failing: Array<[string, FetchLike, string]> = [
    ['HTTP 500', async () => ({ ok: false, status: 500, json: async () => ({}) }), 'http_500'],
    ['code NoRoute', async () => ({ ok: true, status: 200, json: async () => ({ code: 'NoRoute', routes: [] }) }), 'invalid_response'],
    ['JSON sem rotas válidas', async () => ({ ok: true, status: 200, json: async () => ({ code: 'Ok', routes: [{ distance: 'x', duration: 1 }] }) }), 'invalid_response'],
    ['corpo não é objeto', async () => ({ ok: true, status: 200, json: async () => null }), 'invalid_response'],
    ['json() lança', async () => ({ ok: true, status: 200, json: async () => { throw new Error('json quebrado'); } }), 'network_error'],
    ['rede fora', async () => { throw new Error('ECONNREFUSED'); }, 'network_error'],
    ['timeout', (_url, init) => new Promise((_res, rej) => { init.signal.addEventListener('abort', () => { const err = new Error('aborted'); err.name = 'AbortError'; rej(err); }); }), 'timeout'],
  ];
  for (const [name, f, reason] of failing) {
    let threw = false;
    let res: Awaited<ReturnType<typeof computeRoute>> | null = null;
    try { res = await computeRoute(origin, dest, cfg(f)); } catch { threw = true; }
    ok(!threw && res !== null && res.provider === 'HAVERSINE' && res.fallbackUsed && res.fallbackReason === reason && Math.abs(res.distanceKm - expectedFallbackKm) < 0.0015 && Math.abs(res.durationSeconds - expectedFallbackSec) <= 1, `${name} → Haversine × 1,3 a 25 km/h (${reason}), sem exceção`);
  }
  rt = await computeRoute({ latitude: Number.NaN, longitude: 0 }, dest, cfg(good));
  ok(rt.provider === 'HAVERSINE' && rt.fallbackReason === 'invalid_coordinates' && rt.distanceKm === 0, 'coordenada inválida → fallback seguro, sem exceção');
  rt = haversineFallback(origin, dest, 'x');
  ok(rt.provider === 'HAVERSINE' && rt.fallbackUsed, 'haversineFallback direto');
  ok(normalizeOsrmBaseUrl(undefined) === DEFAULT_OSRM_URL && normalizeOsrmBaseUrl('  ') === DEFAULT_OSRM_URL && normalizeOsrmBaseUrl('ftp://x') === DEFAULT_OSRM_URL && normalizeOsrmBaseUrl('lixo') === DEFAULT_OSRM_URL, 'OSRM_URL ausente/inválida → API pública');
  ok(normalizeOsrmBaseUrl('http://osrm:5000/') === 'http://osrm:5000' && normalizeOsrmBaseUrl('https://meu.osrm.com//') === 'https://meu.osrm.com', 'OSRM_URL própria (container) aceita; barra final removida');
  ok(normalizeOsrmTimeout(undefined) === 3000 && normalizeOsrmTimeout('abc') === 3000 && normalizeOsrmTimeout('10') === 500 && normalizeOsrmTimeout('999999') === 10000 && normalizeOsrmTimeout('2500') === 2500, 'OSRM_TIMEOUT_MS: padrão 3000, limitado a 500–10000');

  // ponta a ponta puro: rota em fallback → motor → confiança BAIXA e totais coerentes
  const fb = haversineFallback(origin, dest, 'timeout');
  const full = runSiodEngine({ params: P, pendingOrders: 1, preparingOrders: 1, routeSeconds: fb.durationSeconds, routeProvider: fb.provider });
  ok(full.confidence === 'LOW' && full.estimatedPrepMinutes + full.estimatedRouteMinutes === full.estimatedTotalMinutes, 'fallback → motor: confiança BAIXA e prep + rota = total');

  console.log(`\n${passed} verificações ok, ${failed} falhas`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
