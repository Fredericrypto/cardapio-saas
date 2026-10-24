// P-01: promoção NUNCA ativa sozinha. Testes permanentes.
//   Rodar:  npx tsx test/cartPromotions.test.ts   (também em `npm run test:logic`)
//
// Duas camadas:
//  1) LÓGICA PURA (lib/cartPromotions.ts): transições, derivação, poda, storage.
//  2) GUARDAS ESTÁTICAS sobre o código-fonte das telas/contexto: provam a FIAÇÃO
//     (o bug do P-01 morava na fiação: efeito de auto-ativação e reidratação do
//     disco). Falham no código antigo e passam depois do patch. Não substituem o
//     teste manual no navegador (ver checklist em docs/AUDITORIA-PROMOCOES).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  EMPTY_PROMO_STATE,
  MAX_REMEMBERED,
  parsePersistedCart,
  promoActivate,
  promoApplyContext,
  promoClearAll,
  promoClearActive,
  promoDeactivate,
  promoHydrate,
  promoPrune,
  promoSelectedIds,
  promoSuggestionIds,
  promoToggle,
  serializeCart,
  type PromoContext,
  type PromoState,
} from '../src/lib/cartPromotions';

let pass = 0;
let fail = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    pass++;
    console.log('  OK    ' + name);
  } catch (e) {
    fail++;
    console.log('  FALHOU ' + name + '\n         ' + (e instanceof Error ? e.message.split('\n')[0] : String(e)));
  }
}

const GA: PromoContext = { scope: 'geral', locationId: 'L1' };
const GB: PromoContext = { scope: 'geral', locationId: 'L2' };
const MA: PromoContext = { scope: 'mesa', locationId: 'L1' };
const inCtx = (ctx: PromoContext, s: PromoState = EMPTY_PROMO_STATE) => promoApplyContext(s, ctx);
const ids = (s: PromoState) => promoSelectedIds(s);
const P = (id: string) => ({ id, alreadyUsedUp: false });

console.log('\n[lógica] ativação explícita');
test('sem contexto publicado, ativar não faz nada', () => {
  assert.deepEqual(ids(promoActivate(EMPTY_PROMO_STATE, 'p1')), []);
});
test('ativar explicitamente liga e lembra', () => {
  const s = promoActivate(inCtx(GA), 'p1');
  assert.deepEqual(ids(s), ['p1']);
  assert.equal(s.remembered.length, 1);
});
test('ativar duas vezes é idempotente (não duplica)', () => {
  const s = promoActivate(promoActivate(inCtx(GA), 'p1'), 'p1');
  assert.deepEqual(ids(s), ['p1']);
  assert.equal(s.remembered.length, 1);
});
test('ordem de ativação é preservada', () => {
  const s = promoActivate(promoActivate(inCtx(GA), 'b'), 'a');
  assert.deepEqual(ids(s), ['b', 'a']);
});
test('desativar explicitamente liga e esquece a lembrança', () => {
  const s = promoDeactivate(promoActivate(inCtx(GA), 'p1'), 'p1');
  assert.deepEqual(ids(s), []);
  assert.equal(s.remembered.length, 0);
});
test('toggle alterna ativa/desativa', () => {
  let s = promoToggle(inCtx(GA), 'p1');
  assert.deepEqual(ids(s), ['p1']);
  s = promoToggle(s, 'p1');
  assert.deepEqual(ids(s), []);
});

console.log('\n[lógica] reload / login / reabertura (reidratação do disco)');
test('reload: ativas voltam vazias, lembradas voltam do disco', () => {
  const before = promoActivate(inCtx(GA), 'p1');
  const raw = serializeCart([{ x: 1 }], before);
  const loaded = parsePersistedCart(raw)!;
  const after = promoHydrate(inCtx(GA), loaded);
  assert.deepEqual(ids(after), []);
  assert.equal(after.remembered.length, 1);
  assert.equal(loaded.items.length, 1);
});
test('reidratar nunca ativa, mesmo com lembrada do contexto atual', () => {
  const loaded = { remembered: [{ promotionId: 'p1', scope: 'geral' as const, locationId: 'L1' }], legacy: [] };
  assert.deepEqual(ids(promoHydrate(inCtx(GA), loaded)), []);
});
test('login/troca de conta: hydrate descarta ativas do dono anterior', () => {
  const s = promoActivate(inCtx(GA), 'p1');
  assert.deepEqual(ids(promoHydrate(s, null)), []);
});
test('logout/401/pedido concluído: clearAll zera ativas, lembradas e legado', () => {
  const s = promoClearAll({ ...promoActivate(inCtx(GA), 'p1'), legacy: ['x'] });
  assert.deepEqual([s.active.length, s.remembered.length, s.legacy.length], [0, 0, 0]);
});
test('clearActive desliga sem esquecer a intenção', () => {
  const s = promoClearActive(promoActivate(inCtx(GA), 'p1'));
  assert.deepEqual(ids(s), []);
  assert.equal(s.remembered.length, 1);
});

console.log('\n[lógica] troca de contexto (unidade, mesa x geral)');
test('troca de unidade: ativas descartadas, lembradas permanecem', () => {
  const s = promoApplyContext(promoActivate(inCtx(GA), 'p1'), GB);
  assert.deepEqual(ids(s), []);
  assert.equal(s.remembered.length, 1);
});
test('voltar à unidade anterior: só sugere, não reativa', () => {
  let s = promoApplyContext(promoActivate(inCtx(GA), 'p1'), GB);
  s = promoApplyContext(s, GA);
  assert.deepEqual(ids(s), []);
  assert.deepEqual(promoSuggestionIds(s, [P('p1')]), ['p1']);
});
test('mesa -> geral na MESMA loja: contextos distintos, nada migra', () => {
  const s = promoApplyContext(promoActivate(inCtx(MA), 'p1'), GA);
  assert.deepEqual(ids(s), []);
  assert.deepEqual(promoSuggestionIds(s, [P('p1')]), []);
});
test('geral -> mesa: idem inverso', () => {
  const s = promoApplyContext(promoActivate(inCtx(GA), 'p1'), MA);
  assert.deepEqual(ids(s), []);
  assert.deepEqual(promoSuggestionIds(s, [P('p1')]), []);
});
test('mesmo contexto publicado de novo (outra tela): nada muda', () => {
  const s = promoActivate(inCtx(GA), 'p1');
  assert.equal(promoApplyContext(s, { ...GA }), s);
  assert.deepEqual(ids(promoApplyContext(s, { ...GA })), ['p1']);
});
test('contexto inválido (sem locationId / scope estranho) é ignorado', () => {
  const s = promoActivate(inCtx(GA), 'p1');
  assert.equal(promoApplyContext(s, { scope: 'geral', locationId: '' }), s);
  assert.equal(promoApplyContext(s, { scope: 'x' as never, locationId: 'L9' }), s);
});
test('primeira publicação de contexto não descarta nada (nada ativo antes)', () => {
  const s = promoApplyContext({ ...EMPTY_PROMO_STATE, remembered: [{ promotionId: 'p1', scope: 'geral', locationId: 'L1' }] }, GA);
  assert.equal(s.remembered.length, 1);
  assert.deepEqual(ids(s), []);
});
test('ativa em contexto antigo + lembrada de outro contexto nunca vira ativa derivada', () => {
  const s: PromoState = {
    ctx: GA,
    active: [{ promotionId: 'zz', scope: 'mesa', locationId: 'L1' }],
    remembered: [],
    legacy: [],
  };
  assert.deepEqual(ids(s), []);
});

console.log('\n[lógica] sugestões (só Carrinho)');
test('sugere lembrada do contexto atual presente na lista', () => {
  const s = promoApplyContext(promoHydrate(EMPTY_PROMO_STATE, { remembered: [{ promotionId: 'p1', scope: 'geral', locationId: 'L1' }], legacy: [] }), GA);
  assert.deepEqual(promoSuggestionIds(s, [P('p1'), P('p2')]), ['p1']);
});
test('não sugere o que já está ativo', () => {
  const s = promoActivate(inCtx(GA), 'p1');
  assert.deepEqual(promoSuggestionIds(s, [P('p1')]), []);
});
test('não sugere promoção esgotada para o cliente nem ausente da lista', () => {
  const s = promoApplyContext(promoHydrate(EMPTY_PROMO_STATE, { remembered: [
    { promotionId: 'used', scope: 'geral', locationId: 'L1' },
    { promotionId: 'gone', scope: 'geral', locationId: 'L1' },
  ], legacy: [] }), GA);
  assert.deepEqual(promoSuggestionIds(s, [{ id: 'used', alreadyUsedUp: true }]), []);
});
test('mais recente primeiro', () => {
  const s = promoActivate(promoActivate(inCtx(GA), 'old'), 'new');
  const cleared = promoClearActive(s);
  assert.deepEqual(promoSuggestionIds(cleared, [P('old'), P('new')]), ['new', 'old']);
});

console.log('\n[lógica] poda (D4)');
test('promoção removida/expirada/desativada (ausente da lista) é podada do contexto atual', () => {
  const s = promoActivate(promoActivate(inCtx(GA), 'keep'), 'gone');
  const p = promoPrune(s, GA, ['keep']);
  assert.deepEqual(p.remembered.map((e) => e.promotionId), ['keep']);
  assert.deepEqual(ids(p), ['keep']);
});
test('lista que falhou ao carregar (null) NUNCA poda', () => {
  const s = promoActivate(inCtx(GA), 'p1');
  assert.equal(promoPrune(s, GA, null), s);
});
test('lista vazia carregada com sucesso poda; lista nula não', () => {
  const s = promoActivate(inCtx(GA), 'p1');
  assert.equal(promoPrune(s, GA, []).remembered.length, 0);
  assert.equal(promoPrune(s, GA, null).remembered.length, 1);
});
test('lembrada de OUTRO contexto não é podada', () => {
  const s = promoApplyContext(promoActivate(inCtx(GA), 'p1'), GB);
  assert.equal(promoPrune(s, GB, []).remembered.length, 1);
});
test('poda do contexto A não toca no contexto B (mesa x geral)', () => {
  let s = promoActivate(inCtx(MA), 'm1');
  s = promoApplyContext(s, GA);
  s = promoActivate(s, 'g1');
  const p = promoPrune(s, GA, []);
  assert.deepEqual(p.remembered.map((e) => e.promotionId), ['m1']);
});

console.log('\n[lógica] limite de 10');
test('mais antigas saem quando passa de 10', () => {
  let s = inCtx(GA);
  for (let i = 0; i < 13; i++) s = promoActivate(s, 'p' + i);
  assert.equal(s.remembered.length, MAX_REMEMBERED);
  assert.equal(s.remembered[0].promotionId, 'p3');
  assert.equal(s.remembered[9].promotionId, 'p12');
});
test('storage com mais de 10 entradas é cortado ao ler', () => {
  const many = Array.from({ length: 15 }, (_, i) => ({ promotionId: 'p' + i, scope: 'geral', locationId: 'L1' }));
  const parsed = parsePersistedCart(JSON.stringify({ v: 2, items: [], remembered: many }))!;
  assert.equal(parsed.remembered.length, MAX_REMEMBERED);
});

console.log('\n[lógica] storage legado e lixo');
test('legado: selectedPromotionIds vira legacy (nunca ativo)', () => {
  const parsed = parsePersistedCart(JSON.stringify({ items: [{ a: 1 }], selectedPromotionIds: ['p1', 'p2'] }))!;
  assert.deepEqual(parsed.legacy, ['p1', 'p2']);
  assert.deepEqual(parsed.remembered, []);
  assert.equal(parsed.items.length, 1);
  assert.deepEqual(ids(promoHydrate(inCtx(GA), parsed)), []);
});
test('legado vira lembrada {geral, unidade atual} na 1a publicação e só sugere', () => {
  const parsed = parsePersistedCart(JSON.stringify({ items: [], selectedPromotionIds: ['p1'] }))!;
  const s = promoApplyContext(promoHydrate(EMPTY_PROMO_STATE, parsed), GA);
  assert.deepEqual(s.remembered, [{ promotionId: 'p1', scope: 'geral', locationId: 'L1' }]);
  assert.deepEqual(s.legacy, []);
  assert.deepEqual(ids(s), []);
  assert.deepEqual(promoSuggestionIds(s, [P('p1')]), ['p1']);
});
test('legado com 1a publicação em MESA: ainda vira scope geral (decisão final)', () => {
  const parsed = parsePersistedCart(JSON.stringify({ items: [], selectedPromotionIds: ['p1'] }))!;
  const s = promoApplyContext(promoHydrate(EMPTY_PROMO_STATE, parsed), MA);
  assert.deepEqual(s.remembered, [{ promotionId: 'p1', scope: 'geral', locationId: 'L1' }]);
  assert.deepEqual(promoSuggestionIds(s, [P('p1')]), []);
});
test('legado hidratado com contexto JÁ publicado vira lembrada na hora (reload: tela publica antes do login resolver)', () => {
  const parsed = parsePersistedCart(JSON.stringify({ items: [], selectedPromotionIds: ['p1'] }))!;
  const s = promoHydrate(inCtx(GB), parsed);
  assert.deepEqual(s.remembered, [{ promotionId: 'p1', scope: 'geral', locationId: 'L2' }]);
  assert.deepEqual(s.legacy, []);
  assert.deepEqual(ids(s), []);
});
test('legado é preservado no disco enquanto nenhum contexto foi publicado', () => {
  const parsed = parsePersistedCart(JSON.stringify({ items: [], selectedPromotionIds: ['p1'] }))!;
  const s = promoHydrate(EMPTY_PROMO_STATE, parsed);
  assert.deepEqual(parsePersistedCart(serializeCart([], s))!.legacy, ['p1']);
});
test('JSON inválido, não-objeto e items ausente: null, sem lançar', () => {
  assert.equal(parsePersistedCart('{oops'), null);
  assert.equal(parsePersistedCart('42'), null);
  assert.equal(parsePersistedCart('null'), null);
  assert.equal(parsePersistedCart(JSON.stringify({ selectedPromotionIds: ['a'] })), null);
  assert.equal(parsePersistedCart(null), null);
  assert.equal(parsePersistedCart(''), null);
});
test('ids órfãos/lixo: tipos errados, vazios e duplicados são descartados', () => {
  const parsed = parsePersistedCart(JSON.stringify({
    v: 2,
    items: [{ ok: 1 }, 5, null, 'x'],
    remembered: [
      { promotionId: 'a', scope: 'geral', locationId: 'L1' },
      { promotionId: 'a', scope: 'geral', locationId: 'L1' },
      { promotionId: 7, scope: 'geral', locationId: 'L1' },
      { promotionId: 'b', scope: 'qrcode', locationId: 'L1' },
      { promotionId: 'c', scope: 'mesa' },
      { promotionId: '', scope: 'mesa', locationId: 'L1' },
      null,
      'lixo',
    ],
    legacy: ['z', 'z', 3, '', null],
  }))!;
  assert.deepEqual(parsed.remembered, [{ promotionId: 'a', scope: 'geral', locationId: 'L1' }]);
  assert.deepEqual(parsed.legacy, ['z']);
  assert.equal(parsed.items.length, 1);
});
test('selectedPromotionIds não-array no formato antigo é ignorado', () => {
  const parsed = parsePersistedCart(JSON.stringify({ items: [], selectedPromotionIds: 'p1' }))!;
  assert.deepEqual(parsed.legacy, []);
});
test('ida e volta do formato novo', () => {
  const s = promoActivate(inCtx(GA), 'p1');
  const back = parsePersistedCart(serializeCart([{ i: 1 }], s))!;
  assert.deepEqual(back.remembered, s.remembered);
  assert.equal(JSON.parse(serializeCart([], s)).v, 2);
  assert.equal('selectedPromotionIds' in JSON.parse(serializeCart([], s)), false);
});

console.log('\n[lógica] troca de cliente');
test('conta B não herda lembradas da conta A (hydrate substitui)', () => {
  const a = promoActivate(inCtx(GA), 'p1');
  const b = promoHydrate(a, null);
  assert.deepEqual(b.remembered, []);
  assert.deepEqual(ids(b), []);
});

// ------------------------------------------------------------ guardas estáticas
console.log('\n[fiação] guardas estáticas (código-fonte)');
const src = (rel: string) => readFileSync(fileURLToPath(new URL('../src/' + rel, import.meta.url)), 'utf8');

test('PromotionExplorePage não ativa promoção ao entrar (sem efeito de auto-seleção)', () => {
  const s = src('pages/PromotionExplorePage.tsx');
  assert.equal(/autoSelectedFor/.test(s), false, 'ainda existe autoSelectedFor');
  const calls = s.match(/selectPromotion\(/g) ?? [];
  assert.equal(calls.length, 1, 'selectPromotion deve aparecer só no botão "Ativar" (' + calls.length + ' usos)');
  assert.match(s, /onActivate=\{\(\) => selectPromotion\(promotion\.id\)\}/);
});
test('CartContext não reidrata selectedPromotionIds do disco', () => {
  const s = src('contexts/CartContext.tsx');
  assert.equal(/persisted\?\.selectedPromotionIds/.test(s), false, 'ainda reidrata do disco');
  assert.equal(/setSelectedPromotionIds/.test(s), false, 'selectedPromotionIds ainda é estado próprio');
});
test('CartContext persiste só o formato v2 (itens + lembradas), nunca selectedPromotionIds', () => {
  const s = src('contexts/CartContext.tsx');
  assert.match(s, /serializeCart\(/);
  assert.match(s, /parsePersistedCart\(/);
  assert.equal(/JSON\.stringify\(\{ items, selectedPromotionIds/.test(s), false);
});
test('toda tela que lê promoções ativas publica o contexto (useCartPromotionContext)', () => {
  for (const f of [
    'pages/MenuPage.tsx',
    'pages/CartPage.tsx',
    'pages/PromotionDetailPage.tsx',
    'pages/PromotionExplorePage.tsx',
    'pages/ProductDetailPage.tsx',
    'pages/CategoryProductsPage.tsx',
  ]) {
    assert.match(src(f), /useCartPromotionContext\(/, f + ' não publica o contexto');
  }
});
test('contexto nunca usa qrCodeToken (D5): hook publica só scope + locationId', () => {
  const s = src('hooks/useCartPromotionContext.ts');
  assert.equal(/qrCodeToken/.test(s), false);
  assert.match(s, /scope: isTableFlow \? 'mesa' : 'geral'/);
});
test('PromotionDetailPage ativa com selectPromotion (idempotente), não com toggle', () => {
  const s = src('pages/PromotionDetailPage.tsx');
  const m = s.match(/function handleApply\(\) \{[\s\S]*?\n  \}/);
  assert.ok(m, 'handleApply não encontrada');
  assert.equal(/togglePromotion/.test(m![0]), false, 'handleApply ainda usa toggle');
  assert.match(m![0], /selectPromotion\(/);
});
test('sugestão de promoção só existe no Carrinho (D3)', () => {
  for (const f of [
    'pages/MenuPage.tsx',
    'pages/ProductDetailPage.tsx',
    'pages/CategoryProductsPage.tsx',
    'pages/PromotionDetailPage.tsx',
    'pages/PromotionExplorePage.tsx',
    'components/ProductCard.tsx',
    'components/PromoCards.tsx',
  ]) {
    let text = '';
    try {
      text = src(f);
    } catch {
      continue; // arquivo ausente neste checkout: nada a checar
    }
    assert.equal(/promoSuggestionIds|promoAvailable|rememberedPromotions/.test(text), false, f + ' não pode mostrar sugestão');
  }
  assert.match(src('pages/CartPage.tsx'), /promoSuggestionIds\(/);
});
test('poda no Carrinho só roda no sucesso da busca (nunca no catch)', () => {
  const s = src('pages/CartPage.tsx');
  const m = s.match(/prunePromotions\(/g) ?? [];
  assert.equal(m.length, 1, 'prunePromotions deve ser chamado uma vez');
  const idx = s.indexOf('prunePromotions(');
  const catchIdx = s.lastIndexOf('.catch(', idx);
  const thenIdx = s.lastIndexOf('.then(', idx);
  assert.ok(thenIdx > catchIdx, 'prunePromotions não pode estar dentro do catch');
});
test('chaves de i18n do aviso existem em pt-BR, en e es', () => {
  for (const lang of ['pt-BR', 'en', 'es']) {
    const s = src('i18n/dictionaries/' + lang + '.ts');
    for (const key of ['cartPage.promoAvailable', 'cartPage.promoReactivate', 'cartPage.promoReactivateAria']) {
      assert.ok(s.includes("'" + key + "'"), lang + ' sem ' + key);
    }
  }
});

console.log('\nResultado: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail === 0 ? 0 : 1);
