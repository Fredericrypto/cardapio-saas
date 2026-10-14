import assert from 'node:assert/strict';
import {
  computeMinOrderProgress,
  computePromotionEligibility,
  isItemCoveredByPromotion,
  isProductCoveredByPromotion,
} from '../src/lib/promotionEligibility';
import { buildPromotionModeCatalog, buildPromotionModePaths } from '../src/lib/promotionMode';
import type { CartItem, Category, Product, Promotion } from '../src/types';

const product = (id: string, categoryId: string, extra: Partial<Product> = {}): Product => ({
  id, tenantId: 't', categoryId, name: id, description: null, price: 10, promoPrice: null,
  imageUrl: null, isAvailable: true, displayOrder: 0, ...extra,
});
const category = (id: string, order: number): Category => ({
  id, tenantId: 't', key: null, name: id, displayOrder: order, isActive: true,
});
const promo = (extra: Partial<Promotion> = {}): Promotion => ({
  id: 'p1', title: 'Promo', description: null, imageUrl: null, discountType: 'percentage',
  discountValue: 50, maxDiscountAmount: 100, minOrderValue: 0, scope: 'all', categoryIds: [], productIds: [],
  usageLimitPerCustomer: null, maxEligibleQuantity: null, endsAt: null, alreadyUsedUp: false, ...extra,
});

// ---- 1. rotas: as duas, sem perder slug/token ---------------------------------
const std = buildPromotionModePaths('loja', 'p1');
assert.equal(std.explore, '/loja/promocao/p1/explorar');
assert.equal(std.detail, '/loja/promocao/p1');
assert.equal(std.menu, '/loja');
assert.equal(std.cart, '/loja/carrinho');
assert.equal(std.product('x'), '/loja/produto/x');
const mesa = buildPromotionModePaths('loja', 'p1', 'tok-123');
assert.equal(mesa.explore, '/loja/mesa/tok-123/promocao/p1/explorar');
assert.equal(mesa.detail, '/loja/mesa/tok-123/promocao/p1');
assert.equal(mesa.menu, '/loja/mesa/tok-123');
assert.equal(mesa.cart, '/loja/mesa/tok-123/carrinho');
assert.equal(mesa.product('x'), '/loja/mesa/tok-123/produto/x');

// ---- 2. escopo por produto == escopo por item do carrinho ---------------------
const cats = [category('a', 0), category('b', 1), category('c', 2)];
const prods = [
  product('a1', 'a', { displayOrder: 2 }),
  product('a2', 'a', { displayOrder: 1 }),
  product('a3', 'a', { isAvailable: false }),
  product('b1', 'b'),
  product('c1', 'c'),
  product('orfao', 'zzz'), // categoria fora da lista (inativa): nunca conta
];
for (const p of [promo(), promo({ scope: 'category', categoryIds: ['a'] }), promo({ scope: 'product', productIds: ['b1', 'c1'] })]) {
  for (const pr of prods) {
    const item: CartItem = { lineKey: pr.id, product: pr, quantity: 1, selectedOptions: [] };
    assert.equal(isProductCoveredByPromotion(p, pr), isItemCoveredByPromotion(p, item), `${p.scope}/${pr.id}`);
  }
}

// ---- 3. contagem exata de elegíveis -------------------------------------------
let cat = buildPromotionModeCatalog(promo(), prods, cats);
assert.equal(cat.count, 4, 'all: a1,a2,b1,c1 (sem indisponível e sem categoria órfã)');
assert.deepEqual(cat.groups.map((g) => g.category.id), ['a', 'b', 'c']);
assert.deepEqual(cat.groups[0].products.map((p) => p.id), ['a2', 'a1'], 'ordena por displayOrder');
assert.equal(cat.count, cat.groups.reduce((n, g) => n + g.products.length, 0));
cat = buildPromotionModeCatalog(promo({ scope: 'category', categoryIds: ['b'] }), prods, cats);
assert.equal(cat.count, 1);
cat = buildPromotionModeCatalog(promo({ scope: 'product', productIds: ['a3', 'orfao'] }), prods, cats);
assert.equal(cat.count, 0, 'só indisponível/órfão => zero');
assert.deepEqual(cat.groups, []);

// ---- 4. progresso do pedido mínimo ---------------------------------------------
assert.equal(computeMinOrderProgress(promo({ minOrderValue: 0 }), 50), null, 'sem mínimo => null');
let m = computeMinOrderProgress(promo({ minOrderValue: 30 }), 0.1 + 0.2)!;
assert.equal(m.current, 0.3, 'float 0.1+0.2 vira 30 centavos exatos');
assert.equal(m.missing, 29.7);
assert.equal(m.percent, 1);
m = computeMinOrderProgress(promo({ minOrderValue: 30 }), 29.996)!;
assert.equal(m.reached, true, 'arredondamento em centavos igual ao do motor');
m = computeMinOrderProgress(promo({ minOrderValue: 30 }), 29.99)!;
assert.deepEqual([m.reached, m.missing, m.percent], [false, 0.01, 99], '99,96% nunca vira 100');
m = computeMinOrderProgress(promo({ minOrderValue: 30 }), 30)!;
assert.deepEqual([m.reached, m.missing, m.percent], [true, 0, 100]);
m = computeMinOrderProgress(promo({ minOrderValue: 30 }), 45)!;
assert.deepEqual([m.reached, m.missing, m.percent], [true, 0, 100], 'acima do mínimo satura em 100');
m = computeMinOrderProgress(promo({ minOrderValue: 30 }), -5)!;
assert.equal(m.percent, 0);

// ---- 5. paridade com o motor: mesmo "atingiu" e mesmo "faltam" ------------------
let checked = 0;
for (let minC = 100; minC <= 20000; minC += 137) {
  for (const delta of [-300, -1, 0, 1, 250]) {
    const totalC = Math.max(0, minC + delta);
    const min = minC / 100;
    const total = totalC / 100;
    const item: CartItem = { lineKey: 'l', product: product('x', 'a', { price: total || 0.01 }), quantity: 1, selectedOptions: [] };
    const engine = computePromotionEligibility(promo({ minOrderValue: min }), [item], total);
    const prog = computeMinOrderProgress(promo({ minOrderValue: min }), total)!;
    assert.equal(prog.reached, engine.reasonCode !== 'min_order', `min=${min} total=${total}`);
    if (engine.reasonCode === 'min_order') {
      assert.equal(engine.reasonParams?.missing, prog.missing.toFixed(2).replace('.', ','), `faltam min=${min} total=${total}`);
    }
    checked++;
  }
}
console.log(`promotionMode: ok (${checked} cenários de paridade com o motor)`);
