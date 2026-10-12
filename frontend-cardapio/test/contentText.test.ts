import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { localizedField, localizedPlain } from '../src/i18n/contentText';
import { categoryLabel } from '../src/i18n/categoryLabel';
import { translate } from '../src/i18n/translate';

const store: Record<string, string> = {};
(globalThis as unknown as { localStorage: unknown }).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } };
const use = (l: string) => { store['cardapio_language'] = l; };
const t = (k: Parameters<typeof translate>[1], p?: Record<string, string | number>) => translate((store['cardapio_language'] as 'en') ?? 'pt-BR', k, p);

assert.equal(
  readFileSync(new URL('../src/i18n/menuGlossary.ts', import.meta.url), 'utf8'),
  readFileSync(new URL('../../backend/src/common/i18n/menu-glossary.ts', import.meta.url), 'utf8'),
  'menuGlossary.ts divergiu do backend: copie de novo',
);

const dumplings = { name: 'Dumplings de carne', description: 'Feitos na hora', translations: { en: { description: 'Made to order' } } };
use('pt-BR');
assert.equal(localizedField(dumplings, 'name'), 'Dumplings de carne', 'pt-BR: sempre o original');
assert.equal(localizedField(dumplings, 'description'), 'Feitos na hora');
use('en');
assert.equal(localizedField(dumplings, 'description'), 'Made to order', '1) tradução explícita vence');
assert.equal(localizedField(dumplings, 'name'), 'Beef dumplings', '2) sem explícita: glossário');
assert.equal(localizedField({ name: 'Prato do João', translations: null }, 'name'), 'Prato do João', '3) sem nada: original');
assert.equal(localizedField({ name: 'Promoções', translations: { en: { name: 'Hot deals' } } }, 'name'), 'Hot deals', 'explícita vence o glossário');
assert.equal(localizedField({ name: 'Pudim', translations: { en: { name: '   ' } } }, 'name'), 'Flan', 'explícita vazia não conta');
assert.equal(localizedField(null, 'name' as never), '', 'entidade ausente');
assert.equal(localizedField({ name: 'Pudim' }, 'name', 'es'), 'Flan');
assert.equal(localizedField({ name: 'Pudim', translations: { en: { name: 'Pudding' } } }, 'name', 'es'), 'Flan', 'não usa a tradução de outro idioma');
assert.equal(localizedPlain('Promoções'), 'Deals');
assert.equal(localizedPlain('Texto raro'), 'Texto raro');

assert.equal(categoryLabel({ key: 'entradas', name: 'Entradas' }, t), 'Starters', 'catálogo: dicionário');
assert.equal(categoryLabel({ key: null, name: 'Promoções' }, t), 'Deals', 'personalizada: glossário');
assert.equal(categoryLabel({ key: null, name: 'Minha seção' }, t), 'Minha seção', 'personalizada desconhecida: intacta');
use('pt-BR');
assert.equal(categoryLabel({ key: null, name: 'Promoções' }, t), 'Promoções');

console.log('conteúdo dinâmico (pratos/promoções/categorias) i18n: OK');
