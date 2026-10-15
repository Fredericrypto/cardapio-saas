// Validação ESTRITA dos parâmetros enviados pela tela de configuração do SIOD.
// Diferente de resolveSiodParams (que LIMITA valores ruins vindos do banco para
// o motor nunca quebrar), aqui o dono recebe um erro claro por campo: nada é
// corrigido em silêncio. Função pura — sem Nest, sem banco.
import { DEFAULT_SIOD_PARAMS, SIOD_PARAM_KEYS, SIOD_PARAM_LIMITS } from './siod.types';
import type { SiodParams } from './siod.types';

export interface SiodSettingsFieldError {
  field: string;
  message: string;
}

export type SiodSettingsValidation =
  | { ok: true; params: SiodParams }
  | { ok: false; errors: SiodSettingsFieldError[] };

export const SIOD_PARAM_LABELS: Readonly<Record<keyof SiodParams, string>> = Object.freeze({
  basePrepMinutes: 'Tempo base de preparo (min)',
  queuePenaltyMinutesPerOrder: 'Minutos por pedido na fila',
  minTotalMinutes: 'Prazo mínimo prometido (min)',
  windowBelowMinutes: 'Tolerância para menos (min)',
  windowAboveMinutes: 'Tolerância para mais (min)',
  peakThresholdActiveOrders: 'Pedidos ativos para iniciar o pico',
  peakStepPerOrder: 'Acréscimo por pedido acima do limiar',
  peakMaxMultiplier: 'Multiplicador máximo de pico',
});

const fmt = (n: number): string => n.toLocaleString('pt-BR');

function hasAtMostTwoDecimals(v: number): boolean {
  return Math.abs(v * 100 - Math.round(v * 100)) < 1e-9;
}

// Exige o conjunto COMPLETO dos 8 parâmetros (a tela sempre envia todos) e
// rejeita campos desconhecidos — nada de chave solta indo parar no jsonb.
export function validateSiodSettingsInput(raw: unknown): SiodSettingsValidation {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: [{ field: '_', message: 'Envie um objeto com os parâmetros do SIOD.' }] };
  }
  const source = raw as Record<string, unknown>;
  const errors: SiodSettingsFieldError[] = [];

  for (const key of Object.keys(source)) {
    if (!(SIOD_PARAM_KEYS as readonly string[]).includes(key)) {
      errors.push({ field: key, message: 'Parâmetro desconhecido.' });
    }
  }

  const params: Partial<Record<keyof SiodParams, number>> = {};
  for (const key of SIOD_PARAM_KEYS) {
    const label = SIOD_PARAM_LABELS[key];
    const limit = SIOD_PARAM_LIMITS[key];
    const value = source[key];
    if (value === undefined || value === null) {
      errors.push({ field: key, message: `${label}: informe um valor.` });
      continue;
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      errors.push({ field: key, message: `${label}: precisa ser um número.` });
      continue;
    }
    if (limit.integer && !Number.isInteger(value)) {
      errors.push({ field: key, message: `${label}: use um número inteiro.` });
      continue;
    }
    if (!limit.integer && !hasAtMostTwoDecimals(value)) {
      errors.push({ field: key, message: `${label}: use no máximo 2 casas decimais.` });
      continue;
    }
    if (value < limit.min || value > limit.max) {
      errors.push({ field: key, message: `${label}: use um valor entre ${fmt(limit.min)} e ${fmt(limit.max)}.` });
      continue;
    }
    params[key] = limit.integer ? value : Math.round(value * 100) / 100;
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, params: { ...DEFAULT_SIOD_PARAMS, ...params } as SiodParams };
}

// O que a tela de configuração recebe: valores em vigor (já validados/limitados),
// padrões, limites por campo e se o restaurante ainda usa o padrão.
export interface SiodSettingsView {
  params: SiodParams;
  defaults: SiodParams;
  limits: typeof SIOD_PARAM_LIMITS;
  labels: typeof SIOD_PARAM_LABELS;
  isDefault: boolean;
  structuralFloorMinutes: number;
}

export function buildSettingsView(stored: unknown, resolve: (raw: unknown) => SiodParams, floor: number): SiodSettingsView {
  return {
    params: resolve(stored),
    defaults: { ...DEFAULT_SIOD_PARAMS },
    limits: SIOD_PARAM_LIMITS,
    labels: SIOD_PARAM_LABELS,
    isDefault: stored === null || stored === undefined,
    structuralFloorMinutes: floor,
  };
}
