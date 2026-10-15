// Lógica PURA do formulário de parâmetros do SIOD (sem React): leitura de números
// digitados (vírgula ou ponto), validação e comparação. É um ESPELHO da validação
// do servidor (backend/.../siod-settings.validation.ts) — o servidor continua sendo
// a autoridade; aqui só evitamos ida e volta desnecessária. Um teste de paridade
// (test/siodSettings.test.ts) garante que as duas nunca divergem.
import { SIOD_PARAM_KEYS } from '../types/siod';
import type { SiodParamKey, SiodParamLimit, SiodParams } from '../types/siod';

export type SiodDraft = Record<SiodParamKey, string>;
export type SiodDraftErrors = Partial<Record<SiodParamKey, string>>;

const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

export function formatForInput(value: number): string {
  return String(value).replace('.', ',');
}

export function draftFromParams(params: SiodParams): SiodDraft {
  const out = {} as SiodDraft;
  for (const k of SIOD_PARAM_KEYS) out[k] = formatForInput(params[k]);
  return out;
}

// "12", "0,15" e "0.15" valem; vazio, texto, negativo, notação científica e
// separadores repetidos viram NaN.
export function parseDecimalInput(text: string): number {
  const t = text.trim();
  if (!/^\d+([.,]\d+)?$/.test(t)) return NaN;
  return Number(t.replace(',', '.'));
}

function atMostTwoDecimals(v: number): boolean {
  return Math.abs(v * 100 - Math.round(v * 100)) < 1e-9;
}

export function validateDraft(draft: SiodDraft, limits: Record<SiodParamKey, SiodParamLimit>): SiodDraftErrors {
  const errors: SiodDraftErrors = {};
  for (const k of SIOD_PARAM_KEYS) {
    const limit = limits[k];
    const v = parseDecimalInput(draft[k]);
    if (!Number.isFinite(v)) errors[k] = 'Informe um número.';
    else if (limit.integer && !Number.isInteger(v)) errors[k] = 'Use um número inteiro.';
    else if (!limit.integer && !atMostTwoDecimals(v)) errors[k] = 'Use no máximo 2 casas decimais.';
    else if (v < limit.min || v > limit.max) errors[k] = `Use um valor entre ${nf.format(limit.min)} e ${nf.format(limit.max)}.`;
  }
  return errors;
}

export function hasErrors(errors: SiodDraftErrors): boolean {
  return Object.keys(errors).length > 0;
}

// Só chame com um rascunho SEM erros.
export function paramsFromDraft(draft: SiodDraft): SiodParams {
  const out = {} as SiodParams;
  for (const k of SIOD_PARAM_KEYS) out[k] = Math.round(parseDecimalInput(draft[k]) * 100) / 100;
  return out;
}

export function isDraftSameAs(draft: SiodDraft, params: SiodParams): boolean {
  return SIOD_PARAM_KEYS.every((k) => parseDecimalInput(draft[k]) === params[k]);
}
