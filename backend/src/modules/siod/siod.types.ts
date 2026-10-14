// SIOD — Sistema de Inteligência Operacional de Delivery.
// Tipos e constantes compartilhados. Sem dependência de NestJS/TypeORM de
// propósito: o motor (siod.math.ts) e o cliente de rotas (osrm.client.ts)
// são funções puras, testáveis sem banco e sem framework.

export const ESTIMATION_CONFIDENCES = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type EstimationConfidence = (typeof ESTIMATION_CONFIDENCES)[number];

export const ROUTE_PROVIDERS = ['OSRM', 'HAVERSINE', 'MANUAL'] as const;
export type RouteProvider = (typeof ROUTE_PROVIDERS)[number];

// VALID               = os 3 timestamps existem e são coerentes → métricas calculadas.
// INVALID_TIMESTAMPS  = existem mas se contradizem (ex.: pronto antes de preparando).
// MISSING_DATA        = falta algum timestamp (ex.: concluído direto, sem passar pela
//                       cozinha) ou o pedido ainda não terminou. É o estado inicial.
export const METRICS_STATUSES = ['VALID', 'INVALID_TIMESTAMPS', 'MISSING_DATA'] as const;
export type MetricsStatus = (typeof METRICS_STATUSES)[number];

export const SIOD_ESTIMATION_VERSION = 'v1-heuristica-base';
export const SIOD_ENGINE_VERSION = 'siod-engine-1.0.0';
export const SIOD_PAYLOAD_SCHEMA_VERSION = 1;

// Piso mínimo ESTRUTURAL: nenhuma estimativa (nem o limite inferior da janela)
// promete menos que isso, e o tenant não consegue configurar abaixo disto.
export const SIOD_STRUCTURAL_FLOOR_MINUTES = 15;

// Fallback Haversine (OSRM indisponível): linha reta × fator de malha urbana,
// percorrida a velocidade média constante.
export const HAVERSINE_URBAN_FACTOR = 1.3;
export const HAVERSINE_SPEED_KMH = 25;

// Parâmetros do motor, por restaurante (tenants.siod_settings; ausente = padrão).
export interface SiodParams {
  basePrepMinutes: number; // tempo base de preparo (cozinha vazia)
  queuePenaltyMinutesPerOrder: number; // minutos somados por pedido ativo na fila
  minTotalMinutes: number; // piso do total (>= SIOD_STRUCTURAL_FLOOR_MINUTES)
  windowBelowMinutes: number; // tolerância para menos (ex.: 5 → "-5 min")
  windowAboveMinutes: number; // tolerância para mais (ex.: 10 → "+10 min")
  peakThresholdActiveOrders: number; // a partir de quantos pedidos ativos o pico começa
  peakStepPerOrder: number; // acréscimo do multiplicador por pedido acima do limiar (ex.: 0.10)
  peakMaxMultiplier: number; // teto do multiplicador de pico
}

export const DEFAULT_SIOD_PARAMS: Readonly<SiodParams> = Object.freeze({
  basePrepMinutes: 20,
  queuePenaltyMinutesPerOrder: 2,
  minTotalMinutes: SIOD_STRUCTURAL_FLOOR_MINUTES,
  windowBelowMinutes: 5,
  windowAboveMinutes: 10,
  peakThresholdActiveOrders: 6,
  peakStepPerOrder: 0.1,
  peakMaxMultiplier: 1.5,
});

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

// Resultado de rota (OSRM ou fallback). Nunca representa erro: falha vira Haversine.
export interface RouteResult {
  provider: Extract<RouteProvider, 'OSRM' | 'HAVERSINE'>;
  fallbackUsed: boolean;
  fallbackReason: string | null; // null quando o OSRM respondeu
  distanceKm: number; // distância "bruta" devolvida pelo provedor (3 casas)
  durationSeconds: number; // duração bruta devolvida pelo provedor
  straightLineKm: number; // linha reta origem→destino (3 casas), para auditoria
}

export interface EngineInput {
  params: SiodParams;
  pendingOrders: number;
  preparingOrders: number;
  routeSeconds: number;
  routeProvider: RouteProvider;
}

export interface EngineOutput {
  pendingOrders: number;
  preparingOrders: number;
  activeOrders: number; // pending + preparing
  basePrepMinutes: number;
  queuePenaltyMinutes: number; // activeOrders × penalidade por pedido
  prepRawMinutes: number; // base + penalidade (antes do pico)
  peakMultiplier: number; // 1.00 quando não há pico
  prepAfterPeakMinutes: number;
  routeMinutes: number;
  totalBeforeFloorMinutes: number;
  floorApplied: boolean;
  estimatedPrepMinutes: number; // já com o ajuste do piso: prep + rota = total, sempre
  estimatedRouteMinutes: number;
  estimatedTotalMinutes: number;
  estimatedMinMinutes: number;
  estimatedMaxMinutes: number;
  confidence: EstimationConfidence;
  confidenceReasons: string[];
}

export interface LifecycleTimes {
  createdAt: Date;
  preparingAt: Date | null;
  readyAt: Date | null;
  deliveredAt: Date | null;
}

export interface ActualMetrics {
  metricsStatus: MetricsStatus;
  actualPrepSeconds: number | null;
  actualRouteSeconds: number | null;
  actualTotalSeconds: number | null;
  predictionErrorMinutes: number | null; // real − estimado (positivo = atrasou)
  predictionAbsoluteErrorMinutes: number | null;
  predictionErrorPercent: number | null; // erro ÷ estimado × 100
}

// Contexto integral congelado no checkout (coluna enginePayloadJson).
export interface SiodEnginePayloadV1 {
  schemaVersion: 1;
  engineVersion: string;
  estimationVersion: string;
  frozenAt: string; // ISO
  params: SiodParams;
  context: {
    orderId: string;
    tenantId: string;
    locationId: string | null;
    orderType: string;
    itemsCount: number;
    itemsValue: number;
    activeStatusesCounted: { pending: string[]; preparing: string[] };
    queueScope: 'location_all_order_types';
  };
  route: {
    provider: RouteProvider;
    fallbackUsed: boolean;
    fallbackReason: string | null;
    rawDistanceKm: number;
    rawDurationSeconds: number;
    straightLineKm: number;
    origin: GeoPoint;
    destination: GeoPoint;
  };
  computation: EngineOutput;
}
