// Funções PURAS da visualização do SIOD (sem banco, sem Nest): classificação,
// arredondamento, taxas, qualidade da amostra, sugestões e rótulos. O SQL só
// agrega; toda regra de negócio verificável mora aqui e é coberta por teste.
import { SIOD_PARAM_LIMITS } from './siod.types';
import type { MetricsStatus } from './siod.types';
import type { SiodGranularity, SiodRecordClass, SiodSampleQuality, SiodSuggestion } from './siod-insights.types';

export const SIOD_MIN_SAMPLE_FOR_SUGGESTION = 30;

export const round2 = (v: number): number => Math.round(v * 100) / 100;

// Número vindo do Postgres (string/number/null) -> number | null. NaN/Infinity viram null.
export function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
export const num0 = (v: unknown): number => numOrNull(v) ?? 0;
export const r2OrNull = (v: unknown): number | null => {
  const n = numOrNull(v);
  return n === null ? null : round2(n);
};

export function ratePercent(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null;
  return round2((part / whole) * 100);
}

// Espelho em TS do CASE do SQL (usado como oráculo nos testes e na documentação).
// Partição: todo registro cai em EXATAMENTE uma classe.
export function classifyRecord(
  metricsStatus: MetricsStatus,
  orderStatus: string,
  hasActualMetrics: boolean,
): SiodRecordClass {
  if (orderStatus === 'cancelado') return 'cancelled';
  if (metricsStatus === 'VALID') return hasActualMetrics ? 'valid' : 'invalid';
  if (metricsStatus === 'INVALID_TIMESTAMPS') return 'invalid';
  if (orderStatus === 'entregue') return 'skipped';
  return 'in_progress';
}

export function sampleQuality(validCount: number): SiodSampleQuality {
  if (validCount <= 0) return 'none';
  if (validCount < 10) return 'insufficient';
  if (validCount < SIOD_MIN_SAMPLE_FOR_SUGGESTION) return 'low';
  return 'ok';
}

// Mediana exata (oráculo de teste e utilitário).
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Sugestão = valor central observado, inteiro e DENTRO dos limites do parâmetro.
// Só com amostra suficiente; caso contrário `value` é null com o motivo. É um
// conselho: a tela só preenche o campo, quem salva é o dono.
export function buildSuggestion(
  param: 'basePrepMinutes' | 'queuePenaltyMinutesPerOrder',
  observedMedian: number | null,
  sampleSize: number,
  current: number,
): SiodSuggestion {
  const limit = SIOD_PARAM_LIMITS[param];
  const base = { current, sampleSize, minSample: SIOD_MIN_SAMPLE_FOR_SUGGESTION };
  if (sampleSize < SIOD_MIN_SAMPLE_FOR_SUGGESTION || observedMedian === null || !Number.isFinite(observedMedian)) {
    return {
      ...base,
      value: null,
      reason: `Amostra insuficiente: ${sampleSize} de ${SIOD_MIN_SAMPLE_FOR_SUGGESTION} pedidos comparáveis.`,
    };
  }
  const value = Math.min(limit.max, Math.max(limit.min, Math.round(observedMedian)));
  return { ...base, value, reason: null };
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// bucket = 'AAAA-MM-DDTHH:MI:SS' (já no fuso do restaurante).
export function bucketLabel(bucket: string, g: SiodGranularity, multiDay: boolean): string {
  const [date, time = '00:00:00'] = bucket.split('T');
  const [y, m, d] = date.split('-');
  if (g === 'hour') return multiDay ? `${d}/${m} ${time.slice(0, 2)}h` : `${time.slice(0, 2)}h`;
  if (g === 'day') return `${d}/${m}`;
  return `${MONTHS[Number(m) - 1]}/${y.slice(2)}`;
}
