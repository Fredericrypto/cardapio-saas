// Motor determinístico do SIOD (Camada 1) e cálculo das métricas reais /
// feedback (Camadas 3 e 4). TUDO aqui é função pura: sem banco, sem relógio,
// sem rede — mesma entrada, mesma saída. Aritmética em minutos INTEIROS
// (o multiplicador de pico é tratado em centésimos para não haver erro de
// ponto flutuante).
import {
  ActualMetrics,
  DEFAULT_SIOD_PARAMS,
  EngineInput,
  EngineOutput,
  EstimationConfidence,
  LifecycleTimes,
  SIOD_STRUCTURAL_FLOOR_MINUTES,
  SiodParams,
} from './siod.types';

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function clampDecimal(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value * 100) / 100));
}

function nonNegativeInt(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

// Aceita o JSON cru de tenants.siod_settings (desconhecido) e devolve parâmetros
// SEMPRE válidos: campo ausente/inválido vira o padrão; fora da faixa é limitado.
export function resolveSiodParams(raw: unknown): SiodParams {
  const source: Record<string, unknown> =
    raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_SIOD_PARAMS;
  return {
    basePrepMinutes: clampInt(source.basePrepMinutes, 0, 240, d.basePrepMinutes),
    queuePenaltyMinutesPerOrder: clampInt(source.queuePenaltyMinutesPerOrder, 0, 60, d.queuePenaltyMinutesPerOrder),
    minTotalMinutes: clampInt(source.minTotalMinutes, SIOD_STRUCTURAL_FLOOR_MINUTES, 480, d.minTotalMinutes),
    windowBelowMinutes: clampInt(source.windowBelowMinutes, 0, 60, d.windowBelowMinutes),
    windowAboveMinutes: clampInt(source.windowAboveMinutes, 0, 120, d.windowAboveMinutes),
    peakThresholdActiveOrders: clampInt(source.peakThresholdActiveOrders, 1, 200, d.peakThresholdActiveOrders),
    peakStepPerOrder: clampDecimal(source.peakStepPerOrder, 0, 1, d.peakStepPerOrder),
    peakMaxMultiplier: clampDecimal(source.peakMaxMultiplier, 1, 3, d.peakMaxMultiplier),
  };
}

// Multiplicador progressivo de sobrecarga de pico, em centésimos (100 = 1.00).
// Até o limiar não há efeito; acima dele cresce `step` por pedido, até o teto.
export function peakMultiplierHundredths(activeOrders: number, params: SiodParams): number {
  const over = activeOrders - params.peakThresholdActiveOrders;
  if (over <= 0) return 100;
  const stepH = Math.round(params.peakStepPerOrder * 100);
  const maxH = Math.round(params.peakMaxMultiplier * 100);
  return Math.min(maxH, 100 + over * stepH);
}

export function runSiodEngine(input: EngineInput): EngineOutput {
  const p = input.params;
  const pending = nonNegativeInt(input.pendingOrders);
  const preparing = nonNegativeInt(input.preparingOrders);
  const active = pending + preparing;

  const queuePenalty = active * p.queuePenaltyMinutesPerOrder;
  const prepRaw = p.basePrepMinutes + queuePenalty;
  const multH = peakMultiplierHundredths(active, p);
  // ceil em inteiros: nunca promete menos do que a conta dá.
  const prepAfterPeak = Math.ceil((prepRaw * multH) / 100);

  const routeSeconds = Number.isFinite(input.routeSeconds) && input.routeSeconds > 0 ? input.routeSeconds : 0;
  const routeMinutes = Math.max(1, Math.ceil(routeSeconds / 60));

  const totalBeforeFloor = prepAfterPeak + routeMinutes;
  const floorApplied = totalBeforeFloor < p.minTotalMinutes;
  const total = floorApplied ? p.minTotalMinutes : totalBeforeFloor;
  // Invariante: prep + rota = total. A folga do piso entra no preparo.
  const prep = total - routeMinutes;

  const min = Math.max(p.minTotalMinutes, total - p.windowBelowMinutes);
  const max = total + p.windowAboveMinutes;

  const reasons: string[] = [];
  let confidence: EstimationConfidence = 'HIGH';
  if (input.routeProvider !== 'OSRM') {
    confidence = 'LOW';
    reasons.push(`rota estimada por ${input.routeProvider === 'HAVERSINE' ? 'linha reta (fallback)' : 'ajuste manual'}`);
  }
  if (multH > 100) {
    if (confidence === 'HIGH') confidence = 'MEDIUM';
    reasons.push('cozinha acima do limiar de pico');
  } else if (active * 2 >= p.peakThresholdActiveOrders) {
    if (confidence === 'HIGH') confidence = 'MEDIUM';
    reasons.push('fila de pedidos ativos moderada');
  }
  if (floorApplied) reasons.push('piso mínimo aplicado');

  return {
    pendingOrders: pending,
    preparingOrders: preparing,
    activeOrders: active,
    basePrepMinutes: p.basePrepMinutes,
    queuePenaltyMinutes: queuePenalty,
    prepRawMinutes: prepRaw,
    peakMultiplier: multH / 100,
    prepAfterPeakMinutes: prepAfterPeak,
    routeMinutes,
    totalBeforeFloorMinutes: totalBeforeFloor,
    floorApplied,
    estimatedPrepMinutes: prep,
    estimatedRouteMinutes: routeMinutes,
    estimatedTotalMinutes: total,
    estimatedMinMinutes: min,
    estimatedMaxMinutes: max,
    confidence,
    confidenceReasons: reasons,
  };
}

function validTime(d: Date | null): d is Date {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

function emptyMetrics(status: ActualMetrics['metricsStatus']): ActualMetrics {
  return {
    metricsStatus: status,
    actualPrepSeconds: null,
    actualRouteSeconds: null,
    actualTotalSeconds: null,
    predictionErrorMinutes: null,
    predictionAbsoluteErrorMinutes: null,
    predictionErrorPercent: null,
  };
}

// Camadas 3 e 4. NUNCA lança: anomalia vira metricsStatus, sem métricas derivadas.
export function computeActualMetrics(times: LifecycleTimes, estimatedTotalMinutes: number): ActualMetrics {
  const { createdAt, preparingAt, readyAt, deliveredAt } = times;

  // Algum timestamp ausente → não dá para medir (não é erro operacional).
  if (preparingAt === null || readyAt === null || deliveredAt === null) return emptyMetrics('MISSING_DATA');
  if (!validTime(createdAt) || !validTime(preparingAt) || !validTime(readyAt) || !validTime(deliveredAt)) {
    return emptyMetrics('INVALID_TIMESTAMPS');
  }

  const c = createdAt.getTime();
  const p = preparingAt.getTime();
  const r = readyAt.getTime();
  const d = deliveredAt.getTime();

  // Linha do tempo precisa ser monotônica: criado ≤ preparando ≤ pronto ≤ entregue.
  if (p < c || r < p || d < r) return emptyMetrics('INVALID_TIMESTAMPS');

  const prepSeconds = Math.round((r - p) / 1000);
  const routeSeconds = Math.round((d - r) / 1000);
  const totalSeconds = Math.round((d - c) / 1000);
  if (routeSeconds < 0 || prepSeconds < 0 || totalSeconds < 0) return emptyMetrics('INVALID_TIMESTAMPS');

  const estimatedSeconds = estimatedTotalMinutes * 60;
  const diffSeconds = totalSeconds - estimatedSeconds;
  const errorMinutes = Math.round((diffSeconds * 100) / 60) / 100;
  const percent = estimatedSeconds > 0 ? Math.round((diffSeconds * 10000) / estimatedSeconds) / 100 : null;

  return {
    metricsStatus: 'VALID',
    actualPrepSeconds: prepSeconds,
    actualRouteSeconds: routeSeconds,
    actualTotalSeconds: totalSeconds,
    predictionErrorMinutes: errorMinutes,
    predictionAbsoluteErrorMinutes: Math.abs(errorMinutes),
    predictionErrorPercent: percent,
  };
}
