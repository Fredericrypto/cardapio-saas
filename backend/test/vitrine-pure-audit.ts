// Modo Vitrine — auditoria PURA (sem banco): validação estrutural, leitura
// tolerante e resolução de referências em slides.
// Rodar: npm run test:vitrine   (exit 0 = tudo certo)
import { createChecker } from './helpers';
import {
  VITRINE_FALLBACK_PRODUCTS,
  VITRINE_MAX_ITEMS,
  buildVitrineSlides,
  parseStoredVitrine,
  validateVitrineSettings,
} from '../src/modules/tenants/vitrine-settings';
import type { VitrineProductRow } from '../src/modules/tenants/vitrine-settings';

const t = createChecker();
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// ---------- validação estrutural ----------
const valid = validateVitrineSettings({ v: 1, items: [{ k: 'banner' }, { k: 'product', id: U(1) }] });
t.ok(valid.ok && valid.value.items.length === 2, 'aceita banner + produto');

const upper = validateVitrineSettings({ v: 1, items: [{ k: 'product', id: U(1).toUpperCase() }] });
t.ok(upper.ok && upper.value.items[0].k === 'product' && (upper.value.items[0] as { id: string }).id === U(1), 'normaliza UUID para minúsculas');

const empty = validateVitrineSettings({ v: 1, items: [] });
t.ok(empty.ok && empty.value.items.length === 0, 'aceita lista vazia (vira padrão ao gravar)');

const bad: Array<[string, unknown]> = [
  ['null', null],
  ['string', 'x'],
  ['array', []],
  ['sem v', { items: [] }],
  ['v errado', { v: 2, items: [] }],
  ['v string', { v: '1', items: [] }],
  ['items ausente', { v: 1 }],
  ['items não-lista', { v: 1, items: {} }],
  ['campo extra no topo', { v: 1, items: [], x: 1 }],
  ['item não-objeto', { v: 1, items: ['a'] }],
  ['item null', { v: 1, items: [null] }],
  ['tipo desconhecido', { v: 1, items: [{ k: 'logo' }] }],
  ['produto sem id', { v: 1, items: [{ k: 'product' }] }],
  ['produto id inválido', { v: 1, items: [{ k: 'product', id: 'abc' }] }],
  ['produto id número', { v: 1, items: [{ k: 'product', id: 5 }] }],
  ['produto id com lixo', { v: 1, items: [{ k: 'product', id: `${U(1)}; DROP` }] }],
  ['produto campo extra', { v: 1, items: [{ k: 'product', id: U(1), name: 'x' }] }],
  ['banner campo extra', { v: 1, items: [{ k: 'banner', url: 'http://x' }] }],
  ['banner repetido', { v: 1, items: [{ k: 'banner' }, { k: 'banner' }] }],
  ['produto repetido', { v: 1, items: [{ k: 'product', id: U(1) }, { k: 'product', id: U(1).toUpperCase() }] }],
  ['mais que o limite', { v: 1, items: Array.from({ length: VITRINE_MAX_ITEMS + 1 }, (_, i) => ({ k: 'product', id: U(i + 1) })) }],
];
for (const [label, input] of bad) t.ok(!validateVitrineSettings(input).ok, `recusa: ${label}`);

const atLimit = validateVitrineSettings({ v: 1, items: Array.from({ length: VITRINE_MAX_ITEMS }, (_, i) => ({ k: 'product', id: U(i + 1) })) });
t.ok(atLimit.ok, `aceita exatamente ${VITRINE_MAX_ITEMS} itens`);

// ---------- leitura tolerante ----------
t.ok(parseStoredVitrine(null) === null, 'banco null → padrão');
t.ok(parseStoredVitrine({ v: 1, items: [] }) === null, 'banco com lista vazia → padrão');
t.ok(parseStoredVitrine({ lixo: true }) === null, 'banco corrompido → padrão (sem lançar)');
t.ok(parseStoredVitrine({ v: 1, items: [{ k: 'banner' }] })?.items.length === 1, 'banco válido é lido');

// ---------- resolução em slides ----------
const row = (n: number, over: Partial<VitrineProductRow> = {}): VitrineProductRow => ({
  id: U(n), name: `Prato ${n}`, imageUrl: `https://img/${n}.jpg`, images: [`https://img/${n}.jpg`], isAvailable: true, ...over,
});
const rows = [row(1), row(2), row(3, { isAvailable: false }), row(4, { imageUrl: null, images: ['https://img/4-g.jpg'] }), row(5, { imageUrl: null, images: [] })];
const COVER = 'https://img/banner.jpg';

const sel = { v: 1 as const, items: [{ k: 'product' as const, id: U(2) }, { k: 'banner' as const }, { k: 'product' as const, id: U(1) }] };
const s1 = buildVitrineSlides(sel, COVER, rows);
t.ok(s1.map((s) => s.id).join() === `${U(2)},banner,${U(1)}`, 'respeita a ORDEM escolhida');
t.ok(s1[1].kind === 'banner' && s1[1].name === null, 'banner não tem legenda');
t.ok(s1[0].name === 'Prato 2', 'produto leva o nome atual');

const s2 = buildVitrineSlides({ v: 1, items: [{ k: 'product', id: U(3) }, { k: 'product', id: U(5) }, { k: 'product', id: U(99) }, { k: 'product', id: U(4) }] }, COVER, rows);
t.ok(s2.length === 1 && s2[0].id === U(4) && s2[0].imageUrl === 'https://img/4-g.jpg', 'descarta indisponível, sem foto e inexistente; usa images[0] quando imageUrl é nulo');

const s3 = buildVitrineSlides({ v: 1, items: [{ k: 'banner' }] }, null, rows);
t.ok(s3.length === 0, 'banner sem capa cadastrada some (e não cai no padrão)');

const s4 = buildVitrineSlides({ v: 1, items: [{ k: 'product', id: U(99) }] }, COVER, rows);
t.ok(s4.length === 0, 'seleção toda removida → vazio (a vitrine não abre), sem inventar imagens');

const s5 = buildVitrineSlides(null, COVER, rows);
t.ok(s5[0].kind === 'banner' && s5.map((s) => s.id).join() === `banner,${U(1)},${U(2)},${U(4)}`, 'padrão: banner primeiro, depois produtos disponíveis com foto');

const many = Array.from({ length: 30 }, (_, i) => row(i + 1));
t.ok(buildVitrineSlides(null, COVER, many).length === VITRINE_FALLBACK_PRODUCTS + 1, 'padrão respeita o teto de produtos');
t.ok(buildVitrineSlides(null, null, [row(5, { imageUrl: null, images: [] })]).length === 0, 'padrão sem nada utilizável → vazio');

process.exit(t.finish());
