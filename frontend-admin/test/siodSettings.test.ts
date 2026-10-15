// Lógica do formulário de parâmetros do SIOD + PARIDADE com a validação do servidor:
// para milhares de entradas, "o formulário aceita" <=> "o backend aceita" (e os valores
// que o formulário envia são exatamente os que o backend guardaria).
import assert from 'node:assert/strict';
import {
  draftFromParams,
  formatForInput,
  hasErrors,
  isDraftSameAs,
  paramsFromDraft,
  parseDecimalInput,
  validateDraft,
} from '../src/lib/siodSettings';
import type { SiodDraft } from '../src/lib/siodSettings';
import { SIOD_PARAM_KEYS } from '../src/types/siod';
import type { SiodParams } from '../src/types/siod';
import { validateSiodSettingsInput } from '../../backend/src/modules/siod/siod-settings.validation';
import { DEFAULT_SIOD_PARAMS, SIOD_PARAM_LIMITS } from '../../backend/src/modules/siod/siod.types';

const limits = SIOD_PARAM_LIMITS as unknown as Parameters<typeof validateDraft>[1];
const defaults = DEFAULT_SIOD_PARAMS as unknown as SiodParams;

// leitura de números digitados
assert.equal(parseDecimalInput('12'), 12);
assert.equal(parseDecimalInput(' 0,15 '), 0.15);
assert.equal(parseDecimalInput('0.15'), 0.15);
for (const bad of ['', ' ', 'abc', '-1', '1,2,3', '1e2', '1,', ',5', '1..2', '0x10', '١٢']) {
  assert.ok(Number.isNaN(parseDecimalInput(bad)), `rejeita "${bad}"`);
}
assert.equal(formatForInput(0.1), '0,1');
assert.equal(formatForInput(20), '20');

// padrão válido, sem alterações, ida e volta idêntica
const dDefault = draftFromParams(defaults);
assert.equal(hasErrors(validateDraft(dDefault, limits)), false);
assert.equal(isDraftSameAs(dDefault, defaults), true);
assert.deepEqual(paramsFromDraft(dDefault), defaults);
assert.equal(isDraftSameAs({ ...dDefault, basePrepMinutes: '21' }, defaults), false);

// mensagens por campo
const errs = validateDraft({ ...dDefault, basePrepMinutes: '999', minTotalMinutes: '14', peakStepPerOrder: '0,001', windowBelowMinutes: 'x' }, limits);
assert.ok(errs.basePrepMinutes?.includes('240'));
assert.ok(errs.minTotalMinutes?.includes('15'));
assert.ok(errs.peakStepPerOrder?.includes('2 casas'));
assert.ok(errs.windowBelowMinutes?.includes('número'));
assert.equal(Object.keys(errs).length, 4);

// PARIDADE com o backend (semente fixa)
let a = 424242;
const rnd = (): number => {
  a = (a + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const sampleText = (k: (typeof SIOD_PARAM_KEYS)[number], cleanMode: boolean): string => {
  const L = SIOD_PARAM_LIMITS[k];
  if (cleanMode) {
    const v = L.integer ? Math.round(L.min + rnd() * (L.max - L.min)) : Math.round((L.min + rnd() * (L.max - L.min)) * 100) / 100;
    return String(v).replace('.', rnd() < 0.5 ? ',' : '.');
  }
  const r = rnd();
  if (r < 0.1) return ['', 'abc', '-3', '1e2', '1,2,3', '  '][Math.floor(rnd() * 6)];
  if (r < 0.2) return String(L.min - 1);
  if (r < 0.3) return String(L.max + 1);
  if (r < 0.4) return String(L.min);
  if (r < 0.5) return String(L.max);
  if (r < 0.65) return String(Math.round((L.min + rnd() * (L.max - L.min)) * 1000) / 1000).replace('.', rnd() < 0.5 ? ',' : '.');
  return String(Math.round(L.min + rnd() * (L.max - L.min))).replace('.', ',');
};
let agree = 0;
let valueMatch = 0;
let accepted = 0;
const N = 6000;
for (let i = 0; i < N; i++) {
  const draft = {} as SiodDraft;
  const cleanMode = rnd() < 0.5;
  for (const k of SIOD_PARAM_KEYS) draft[k] = sampleText(k, cleanMode);
  const front = !hasErrors(validateDraft(draft, limits));
  // valor digitado, SEM arredondar (NaN vira null no JSON e o backend rejeita): se o formulário
  // recusa, o servidor também precisa recusar exatamente o mesmo valor.
  const sent: Record<string, number> = {};
  for (const k of SIOD_PARAM_KEYS) sent[k] = parseDecimalInput(draft[k]);
  const back = validateSiodSettingsInput(JSON.parse(JSON.stringify(sent)));
  if (front === back.ok) agree++;
  else console.error('divergência:', JSON.stringify(draft), 'front', front, 'back', back.ok ? 'ok' : back.errors);
  if (front && back.ok) {
    accepted++;
    if (SIOD_PARAM_KEYS.every((k) => back.params[k] === paramsFromDraft(draft)[k])) valueMatch++;
  }
}
assert.equal(agree, N, 'formulário e servidor concordam em todas as entradas');
assert.equal(valueMatch, accepted, 'valores enviados = valores que o servidor guardaria');
assert.ok(accepted > 2000, `cobertura: ${accepted} entradas aceitas`);
console.log(`siodSettings: OK (${N} entradas, ${accepted} aceitas, paridade total com o backend)`);
