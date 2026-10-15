// Contrato da API do SIOD (aba "Entregas"). Espelha backend/src/modules/siod/siod-insights.types.ts.
// Minutos e percentuais com 2 casas; `null` = sem dados para calcular (a tela mostra "—").

export type SiodRecordClass = 'valid' | 'invalid' | 'skipped' | 'in_progress' | 'cancelled';
export type SiodGranularity = 'hour' | 'day' | 'month';
export type SiodSampleQuality = 'none' | 'insufficient' | 'low' | 'ok';

export interface SiodCounts {
  total: number;
  valid: number;
  invalid: number;
  skipped: number;
  inProgress: number;
  cancelled: number;
  fallbackUsed: number;
  fallbackRatePercent: number | null;
}

export interface SiodAccuracy {
  sample: number;
  biasMinutes: number;
  maeMinutes: number;
  medianAbsMinutes: number;
  p90AbsMinutes: number;
  biasPercent: number;
  mapePercent: number;
  withinWindowPercent: number;
  earlyPercent: number;
  latePercent: number;
  avgEstimatedTotalMinutes: number;
  avgActualTotalMinutes: number;
}

export interface SiodComponents {
  estimatedPrepMinutes: number;
  actualPrepMinutes: number;
  actualKitchenMinutes: number;
  actualWaitMinutes: number;
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
  value: number | null;
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

export const SIOD_PARAM_KEYS = [
  'basePrepMinutes',
  'queuePenaltyMinutesPerOrder',
  'minTotalMinutes',
  'windowBelowMinutes',
  'windowAboveMinutes',
  'peakThresholdActiveOrders',
  'peakStepPerOrder',
  'peakMaxMultiplier',
] as const;
export type SiodParamKey = (typeof SIOD_PARAM_KEYS)[number];
export type SiodParams = Record<SiodParamKey, number>;
export interface SiodParamLimit {
  min: number;
  max: number;
  integer: boolean;
}

export interface SiodSettingsView {
  params: SiodParams;
  defaults: SiodParams;
  limits: Record<SiodParamKey, SiodParamLimit>;
  labels: Record<SiodParamKey, string>;
  isDefault: boolean;
  structuralFloorMinutes: number;
}

export interface SiodOrdersQuery {
  period: string;
  from?: string;
  to?: string;
  locationId?: string;
  recordClass?: SiodRecordClass;
  confidence?: string;
  provider?: string;
  page?: number;
  pageSize?: number;
}
