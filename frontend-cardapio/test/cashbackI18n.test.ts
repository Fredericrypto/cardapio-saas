import assert from 'node:assert/strict';
import { formatCashbackExpiry, formatDateBR, formatDateTimeBR } from '../src/lib/cashbackFormat';
import { translate } from '../src/i18n/translate';
import { cashbackDescriptionLabel } from '../src/i18n/cashbackDescription';
import { verificationReasonLabel } from '../src/i18n/verificationReason';
import { formatPronouns, pronounGroupLabel } from '../src/i18n/pronouns';
import { categoryLabel, localizedText } from '../src/i18n/categoryLabel';
import { activeDateLocale } from '../src/i18n/languages';
import type { AppLanguage } from '../src/i18n/languages';

const store: Record<string, string> = {};
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
};
const use = (l: AppLanguage) => { store['cardapio_language'] = l; };
const T = (l: AppLanguage) => (k: Parameters<typeof translate>[1], p?: Record<string, string | number>) => translate(l, k, p);
const now = Date.parse('2026-10-08T15:00:00Z');
const at = (h: number, m = 0) => new Date(now + h * 3_600_000 + m * 60_000).toISOString();

use('en');
assert.equal(activeDateLocale(), 'en-US');
assert.equal(formatDateBR('2026-09-13T19:00:00Z'), '09/13/2026', 'en: MM/DD/YYYY (fuso da loja)');
assert.equal(formatCashbackExpiry('2026-09-13T19:00:00Z', Date.parse('2026-09-01T00:00:00Z'), undefined, T('en')), 'Expires on 09/13/2026 at 16:00');
assert.equal(formatCashbackExpiry(at(5, 20), now, undefined, T('en')), 'Expires in 5h 20min');
assert.equal(formatCashbackExpiry(at(0, 12), now, undefined, T('en')), 'Expires in 12 min');
assert.equal(formatCashbackExpiry(at(-1), now, undefined, T('en')).startsWith('Expired on 10/08/2026'), true);
use('es');
assert.equal(activeDateLocale(), 'es-ES');
assert.equal(formatCashbackExpiry('2026-09-13T19:00:00Z', Date.parse('2026-09-01T00:00:00Z'), undefined, T('es')), 'Vence el 13/09/2026 a las 16:00');
assert.equal(formatDateTimeBR('2026-10-09T03:00:00Z', undefined, T('es')), '09/10/2026 a las 00:00');
use('pt-BR');
assert.equal(formatCashbackExpiry(at(5, 20), now, undefined, T('pt-BR')), 'Vence em 5h 20min');

assert.equal(cashbackDescriptionLabel('Cashback do pedido', T('en')), 'Order cashback');
assert.equal(cashbackDescriptionLabel('Prêmio de fidelidade', T('es')), 'Premio de fidelidad');
assert.equal(cashbackDescriptionLabel('Texto novo do backend', T('en')), 'Texto novo do backend');
assert.equal(translate('en', 'cashback.tab.available'), 'Available');
assert.equal(translate('es', 'cashback.tab.expired'), 'Vencidos');
assert.equal(translate('en', 'cashback.tab.used'), 'Used');

assert.equal(verificationReasonLabel('A foto mostra mais de uma pessoa', T('en')), 'The photo shows more than one person');
assert.equal(verificationReasonLabel('A foto mostra mais de uma pessoa', T('pt-BR')), 'A foto mostra mais de uma pessoa');
assert.equal(verificationReasonLabel('Motivo desconhecido', T('es')), 'Motivo desconhecido');

assert.equal(formatPronouns('ela/dela', T('pt-BR')), 'ela/dela');
assert.equal(formatPronouns('ela/dela', T('en')), 'she/her');
assert.equal(formatPronouns('ele/dele', T('en')), 'he/him');
assert.equal(formatPronouns('elas/delas', T('en')), 'they/them');
assert.equal(formatPronouns('ele', T('es')), 'él');
assert.equal(formatPronouns('ela', T('es')), 'ella');
assert.equal(pronounGroupLabel('Tradicionais Femininos', T('en')), 'Traditional feminine');

assert.equal(categoryLabel({ key: 'entradas', name: 'Entradas' }, T('en')), 'Starters');
assert.equal(categoryLabel({ key: null, name: 'Minha categoria' }, T('en')), 'Minha categoria');
assert.equal(categoryLabel({ key: 'chave-inexistente', name: 'Nome' }, T('es')), 'Nome');
use('en');
assert.equal(localizedText('Pizza'), 'Pizza');
assert.equal(localizedText({ 'pt-BR': 'Suco', en: 'Juice' }), 'Juice');
assert.equal(localizedText({ 'pt-BR': 'Suco' }), 'Suco', 'sem tradução: cai no pt-BR');
assert.equal(localizedText(null), '');

console.log('cashback/pronomes/motivos/categorias i18n: OK');
