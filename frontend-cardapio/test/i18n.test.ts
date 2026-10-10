import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ptBR, type TranslationKey } from '../src/i18n/dictionaries/pt-BR';
import { en } from '../src/i18n/dictionaries/en';
import { es } from '../src/i18n/dictionaries/es';
import { translate } from '../src/i18n/translate';
import { normalizeLanguage, SUPPORTED_LANGUAGES } from '../src/i18n/languages';
import { getStoreStatus } from '../src/lib/storeStatus';
import { formatNextOpening, getWeekScheduleLines } from '../src/lib/openingHours';

const keys = Object.keys(ptBR) as TranslationKey[];
const dictionaries = { 'pt-BR': ptBR as Record<TranslationKey, string>, en, es };

// 1) Paridade total de chaves e de placeholders {param} entre os 3 idiomas.
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
for (const lang of ['en', 'es'] as const) {
  assert.deepEqual(Object.keys(dictionaries[lang]).sort(), [...keys].sort(), `${lang}: mesmas chaves do pt-BR`);
  for (const key of keys) {
    assert.ok(dictionaries[lang][key].trim().length > 0, `${lang}.${key} não pode ser vazio`);
    assert.equal(placeholders(dictionaries[lang][key]), placeholders(ptBR[key]), `${lang}.${key}: placeholders iguais ao pt-BR`);
  }
}

// 2) Regra do projeto: sem emoji em lugar nenhum.
const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;
for (const lang of SUPPORTED_LANGUAGES) for (const key of keys) assert.ok(!emoji.test(dictionaries[lang][key]), `${lang}.${key} sem emoji`);

// 3) Aviso da tela de idioma: texto pt-BR exatamente como pedido.
assert.equal(
  ptBR['language.notice'],
  'Todo o aplicativo e notificações serão traduzidos para o idioma selecionado, exceto valores monetários (R$), nomes de estabelecimentos/clientes e endereços.',
);

// 4) Moeda nunca é convertida pelo dicionário: nenhum texto traduzido troca R$ por outra moeda.
for (const lang of SUPPORTED_LANGUAGES) for (const key of keys) assert.ok(!/USD|US\$|EUR|€/.test(dictionaries[lang][key]), `${lang}.${key} sem outra moeda`);

// 5) Interpolação e fallback.
assert.equal(translate('en', 'store.closesIn', { minutes: 15 }), 'Closes in 15 min');
assert.equal(translate('es', 'language.confirmMessage', { language: 'English' }), '¿Cambiar el idioma de la aplicación a English?');
assert.equal(translate('pt-BR', 'store.opensWhen', { when: 'x' }), 'Abre x às {time}', 'placeholder sem valor fica visível, nunca vira "undefined"');
assert.equal(normalizeLanguage('fr'), 'pt-BR');
assert.equal(normalizeLanguage('es'), 'es');

// 6) schedule.ts do app é cópia idêntica da do backend (mesmo algoritmo nos dois lados).
assert.equal(
  readFileSync(new URL('../src/lib/schedule.ts', import.meta.url), 'utf8'),
  readFileSync(new URL('../../backend/src/common/utils/schedule.ts', import.meta.url), 'utf8'),
  'schedule.ts divergiu do backend: copie de novo',
);

// 7) Status e previsão do próximo expediente (America/Sao_Paulo).
const days = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
const allDays = (value: string) => Object.fromEntries(days.map((d) => [d, value]));
const t = (lang: 'pt-BR' | 'en' | 'es') => (key: TranslationKey, params?: Record<string, string | number>) => translate(lang, key, params);
const at = (iso: string) => new Date(iso);

// Domingo 2026-10-04, 09:00 BRT = 12:00Z.
const sun9 = at('2026-10-04T12:00:00Z');
const open24h = { isOpen: true, isOpenNow: true, openingHours: allDays('00:00-00:00'), scheduleOpenState: true };
let s = getStoreStatus(open24h, sun9);
assert.ok(s.isOpen && s.isOpen24h && s.nextOpening === null, 'loja 24h aberta: sem previsão');

// Bug do app: toggle FECHADO + horário 24h => tem de mostrar fechado, nunca "aberto 24h".
const manuallyClosed = { ...open24h, isOpen: false, isOpenNow: false };
s = getStoreStatus(manuallyClosed, sun9);
assert.ok(!s.isOpen && !s.isOpen24h, 'fechada na mão: Fechado e sem "aberto 24h"');
assert.equal(formatNextOpening(s.nextOpening, t('pt-BR')), 'Abre Segunda-feira às 00:00');

// Estado real do servidor fora do horário: toggle desligado pelo cron, scheduleOpenState=false.
const evening = { isOpen: false, isOpenNow: false, openingHours: { ...allDays('fechado'), domingo: '18:00-23:00' }, scheduleOpenState: false };
s = getStoreStatus(evening, sun9);
assert.ok(!s.isOpen, 'antes de abrir: fechada');
assert.equal(formatNextOpening(s.nextOpening, t('pt-BR')), 'Abre Hoje às 18:00');
assert.equal(formatNextOpening(s.nextOpening, t('en')), 'Opens today at 18:00');
assert.equal(formatNextOpening(s.nextOpening, t('es')), 'Abre hoy a las 18:00');

// Virada exata: 17:59 fechada, 18:00 aberta (sem nova requisição ao servidor).
assert.ok(!getStoreStatus(evening, at('2026-10-04T20:59:00Z')).isOpen, '17:59 ainda fechada');
assert.ok(getStoreStatus(evening, at('2026-10-04T21:00:00Z')).isOpen, '18:00 abre na hora');
assert.ok(!getStoreStatus(evening, at('2026-10-05T02:00:00Z')).isOpen, '23:00 em ponto fecha');
assert.equal(getStoreStatus(evening, at('2026-10-04T21:00:00Z')).closingInMinutes, null, 'faltam 300 min: sem aviso de "fecha em"');
assert.equal(getStoreStatus(evening, at('2026-10-05T01:15:00Z')).closingInMinutes, 45, '22:15: fecha em 45 min');

const mon = { isOpen: false, isOpenNow: false, openingHours: { ...allDays('fechado'), segunda: '09:30-18:00' }, scheduleOpenState: false };
assert.equal(formatNextOpening(getStoreStatus(mon, sun9).nextOpening, t('pt-BR')), 'Abre Segunda-feira às 09:30');
assert.equal(formatNextOpening(getStoreStatus(mon, sun9).nextOpening, t('es')), 'Abre lunes a las 09:30');
assert.equal(formatNextOpening(getStoreStatus({ ...mon, openingHours: allDays('fechado') }, sun9).nextOpening, t('pt-BR')), null, 'sem nenhum dia aberto: sem previsão');

// Sem `isOpen` no payload (backend antigo): confia no isOpenNow do servidor.
const legacy = { isOpenNow: false, openingHours: null } as unknown as Parameters<typeof getStoreStatus>[0];
assert.ok(!getStoreStatus(legacy, sun9).isOpen);
assert.ok(getStoreStatus(null, sun9).isOpen, 'loja ainda não carregada: não bloqueia a tela');

// Horário da semana traduzido (nomes de dias; os horários são os mesmos).
const lines = getWeekScheduleLines({ ...allDays('fechado'), segunda: '09:30-18:00', terca: '00:00-00:00' }, t('en'));
assert.deepEqual(lines?.slice(0, 3), [
  { day: 'Monday', hours: '09:30 to 18:00' },
  { day: 'Tuesday', hours: 'Open 24h' },
  { day: 'Wednesday', hours: 'Closed' },
]);

console.log('i18n + status da loja: OK');
