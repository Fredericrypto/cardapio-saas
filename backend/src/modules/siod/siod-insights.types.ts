// Contrato da API de visualização do SIOD (aba "Entregas"). Minutos com 2 casas;
// percentuais com 2 casas; `null` = sem dados para calcular (nunca 0 inventado).
export type SiodRecordClass = 'valid' | 'invalid' | 'skipped' | 'in_progress' | 'cancelled';
export const SIOD_RECORD_CLASSES: readonly SiodRecordClass[] = ['valid', 'invalid', 'skipped', 'in_progress', 'cancelled'];

export type SiodGranularity = 'hour' | 'day' | 'month';
export type SiodSampleQuality = 'none' | 'insufficient' | 'low' | 'ok';

export interface SiodCounts {
  total: number;
  valid: number; // métricas calculadas (entra na precisão)
  invalid: number; // timestamps contraditórios
  skipped: number; // entregue sem passar por preparo/pronto
  inProgress: number; // ainda não entregue
  cancelled: number;
  fallbackUsed: number; // rota estimada por Haversine
  fallbackRatePercent: number | null;
}

export interface SiodAccuracy {
  sample: number;
  biasMinutes: number; // real − estimado, médio (positivo = atrasou)
  maeMinutes: number; // erro absoluto médio
  medianAbsMinutes: number;
  p90AbsMinutes: number;
  biasPercent: number;
  mapePercent: number;
  withinWindowPercent: number;
  earlyPercent: number; // chegou antes do limite inferior da janela
  latePercent: number; // chegou depois do limite superior
  avgEstimatedTotalMinutes: number;
  avgActualTotalMinutes: number;
}

// Estimado x real por etapa. "Preparo" = do pedido até ficar pronto (inclui a espera
// na fila), porque é isso que o motor estima; `actualKitchenMinutes` = só preparando→pronto.
export interface SiodComponents {
  estimatedPrepMinutes: number;
  actualPrepMinutes: number;
  actualKitchenMinutes: number;
  actualWaitMinutes: number; // pedido → início do preparo
  estimatedRouteMinutes: number;
  actualRouteMinutes: number;
}

export interface SiodSeriesPoint {
  bucket: string;
  label: string;
  total: number;
  valid: number;
  avgEstimatedMinutes: number | null;
  avgActualMinutes: number | null;
  maeMinutes: number | null;
}

export interface SiodGroupRow {
  key: string;
  label: string;
  total: number;
  valid: number;
  maeMinutes: number | null;
  biasMinutes: number | null;
  withinWindowPercent: number | null;
}

export interface SiodSuggestion {
  value: number | null; // null = amostra insuficiente
  current: number;
  sampleSize: number;
  minSample: number;
  reason: string | null;
}

export interface SiodOverview {
  range: { period: string; from: string; to: string; granularity: SiodGranularity; timezone: string };
  counts: SiodCounts;
  sampleQuality: SiodSampleQuality;
  accuracy: SiodAccuracy | null;
  components: SiodComponents | null;
  series: SiodSeriesPoint[];
  byConfidence: SiodGroupRow[];
  byProvider: SiodGroupRow[];
  byQueue: SiodGroupRow[];
  byPeak: SiodGroupRow[];
  byPayment: SiodGroupRow[];
  suggestions: { basePrep: SiodSuggestion; queuePenalty: SiodSuggestion };
}

export interface SiodOrderRow {
  orderId: string;
  createdAt: string;
  customerName: string | null;
  orderStatus: string;
  paymentMethod: string | null;
  recordClass: SiodRecordClass;
  confidence: string;
  routeProvider: string;
  fallbackUsed: boolean;
  distanceKm: number;
  activeOrdersAtCreation: number;
  peakMultiplier: number;
  estimatedTotalMinutes: number;
  estimatedMinMinutes: number;
  estimatedMaxMinutes: number;
  actualTotalMinutes: number | null;
  errorMinutes: number | null;
}

export interface SiodOrdersPage {
  page: number;
  pageSize: number;
  total: number;
  items: SiodOrderRow[];
}
