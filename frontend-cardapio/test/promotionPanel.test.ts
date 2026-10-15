import assert from 'node:assert/strict';
import {
  allocateProportionally,
  computeSelectedPromotionsEligibility,
  pickItemPromotion,
} from '../src/lib/promotionEligibility';
import { buildPromotionModeCatalog, findCatalogProduct, toggleSelectedProductId } from '../src/lib/promotionMode';
import { buildSelectedOptions, findUnmetOptionGroup, toggleOptionValue, visibleOptionGroups } from '../src/lib/productOptions';
import type { CartItem, Category, Product, ProductOptionGroup, Promotion } from '../src/types';

const product = (id: string, categoryId: string, extra: Partial<Product> = {}): Product => ({
  id, tenantId: 't', categoryId, name: id, description: null, price: 10, promoPrice: null,
  imageUrl: null, isAvailable: true, displayOrder: 0, ...extra,
});
const category = (id: string, order: number): Category => ({ id, tenantId: 't', key: null, name: id, displayOrder: order, isActive: true });
const promo = (extra: Partial<Promotion> = {}): Promotion => ({
  id: 'p1', title: 'Promo', description: null, imageUrl: null, discountType: 'percentage', discountValue: 50,
  maxDiscountAmount: 100, minOrderValue: 0, scope: 'all', categoryIds: [], productIds: [],
  usageLimitPerCustomer: null, maxEligibleQuantity: null, endsAt: null, alreadyUsedUp: false, ...extra,
});
const line = (p: Product, quantity: number, key = p.id): CartItem => ({ lineKey: key, product: p, quantity, selectedOptions: [] });

// ---- 1. rateio por maior resto: soma exata, sem fatia acima do peso -----------------
assert.deepEqual(allocateProportionally(100, [1, 1, 1]), [34, 33, 33]);
assert.deepEqual(allocateProportionally(0, [5, 5]), [0, 0]);
assert.deepEqual(allocateProportionally(10, [0, 0]), [0, 0]);
let seed = 12345;
const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
for (let i = 0; i < 3000; i++) {
  const weights = Array.from({ length: 1 + rnd(5) }, () => 1 + rnd(5000));
  const sum = weights.reduce((a, b) => a + b, 0);
  const total = rnd(sum + 1);
  const shares = allocateProportionally(total, weights);
  assert.equal(shares.reduce((a, b) => a + b, 0), total, 'soma fecha em centavos');
  shares.forEach((s, k) => assert.ok(s >= 0 && s <= weights[k], 'fatia dentro do peso'));
}

// ---- 2. atribuição por linha == desconto de cada promoção ---------------------------
const a = product('a', 'c1', { price: 12.35 });
const b = product('b', 'c1', { price: 7.99 });
const c = product('c', 'c2', { price: 3.33 });
for (let i = 0; i < 400; i++) {
  const cart = [line(a, 1 + rnd(4)), line(b, 1 + rnd(4)), line(c, 1 + rnd(4))];
  const total = cart.reduce((s, l) => s + l.product.price * l.quantity, 0);
  const promos = [
    promo({ id: 'x', scope: 'category', categoryIds: ['c1'], discountValue: 1 + rnd(60), maxEligibleQuantity: rnd(2) ? null : 1 + rnd(4) }),
    promo({ id: 'y', discountType: 'fixed', discountValue: 1 + rnd(8), maxEligibleQuantity: rnd(2) ? null : 1 + rnd(3) }),
  ];
  const r = computeSelectedPromotionsEligibility(promos, cart, total);
  for (const p of promos) {
    const res = r.perPromo.get(p.id)!;
    let cents = 0;
    for (const apps of r.applicationsByLine.values()) for (const ap of apps) if (ap.promotionId === p.id) cents += Math.round(ap.discountAmount * 100);
    assert.equal(cents, res.isEligible ? Math.round(res.discountAmount * 100) : 0, `fatias de ${p.id} somam o desconto`);
  }
  for (const [key, apps] of r.applicationsByLine) {
    const units = apps.reduce((s, ap) => s + ap.units, 0);
    assert.equal(units, r.discountedQuantityByLine.get(key), 'unidades por linha batem');
  }
}

// ---- 3. catálogo: duas seções, cada produto em exatamente uma ------------------------
const cats = [category('a', 0), category('b', 1)];
const prods = [
  product('a1', 'a', { displayOrder: 1 }), product('a2', 'a', { displayOrder: 0 }), product('a3', 'a', { isAvailable: false }),
  product('b1', 'b'), product('orfao', 'zzz'),
];
const cat = buildPromotionModeCatalog(promo({ scope: 'category', categoryIds: ['a'] }), prods, cats);
assert.deepEqual(cat.groups.map((g) => g.products.map((p) => p.id)), [['a2', 'a1']]);
assert.deepEqual(cat.otherGroups.map((g) => [g.category.id, g.products.map((p) => p.id)]), [['a', ['a3']], ['b', ['b1']]]);
assert.equal(cat.count, 2);
assert.equal(cat.otherCount, 2);
assert.equal(cat.count + cat.otherCount, prods.length - 1, 'só o órfão fica de fora');
assert.equal(findCatalogProduct(cat, 'a1')?.section, 'eligible');
assert.equal(findCatalogProduct(cat, 'b1')?.section, 'other');
assert.equal(findCatalogProduct(cat, 'a3')?.section, 'other', 'indisponível segue visível');
assert.equal(findCatalogProduct(cat, 'orfao'), null);
assert.equal(findCatalogProduct(cat, null), null);

// ---- 4. master-detail: clicar de novo recolhe, outro troca ---------------------------
assert.equal(toggleSelectedProductId(null, 'x'), 'x');
assert.equal(toggleSelectedProductId('x', 'x'), null);
assert.equal(toggleSelectedProductId('x', 'y'), 'y');

// ---- 5. promoção escolhida para um item fora do modo ---------------------------------
const first = promo({ id: 'f', scope: 'product', productIds: ['a1'], discountValue: 10 });
const second = promo({ id: 's', discountValue: 50 });
assert.equal(pickItemPromotion([first, second], product('a1', 'a'))?.promotion.id, 'f', 'ordem da seleção');
assert.equal(pickItemPromotion([first, second], product('zz', 'a'))?.promotion.id, 's');
assert.equal(pickItemPromotion([first], product('zz', 'a')), null, 'fora do escopo: sem destaque');
assert.equal(pickItemPromotion([], product('a1', 'a')), null, 'nenhuma ativada: sem destaque');
assert.equal(pickItemPromotion([promo({ alreadyUsedUp: true })], product('a1', 'a')), null, 'já usada: sem destaque');
const picked = pickItemPromotion([second], product('p', 'a', { price: 20 }))!;
assert.deepEqual([picked.preview.unitPriceBeforePromo, picked.preview.unitPriceAfterPromo], [20, 10]);

// ---- 6. adicionais: mínimo, máximo, rádio --------------------------------------------
const group = (id: string, min: number, max: number, n = 3): ProductOptionGroup => ({
  id, name: id, minSelect: min, maxSelect: max, displayOrder: 0,
  values: Array.from({ length: n }, (_, i) => ({ id: `${id}${i}`, label: `${id}${i}`, priceDelta: i, isAvailable: true })),
} as ProductOptionGroup);
const radio = group('r', 1, 1);
const multi = group('m', 0, 2);
let sel = toggleOptionValue({}, radio, 'r0').selections;
assert.deepEqual(sel, { r: ['r0'] });
assert.deepEqual(toggleOptionValue(sel, radio, 'r1').selections, { r: ['r1'] }, 'rádio troca');
assert.deepEqual(toggleOptionValue(sel, radio, 'r0').selections, { r: [] }, 'rádio desmarca');
sel = toggleOptionValue(toggleOptionValue({}, multi, 'm0').selections, multi, 'm1').selections;
const over = toggleOptionValue(sel, multi, 'm2');
assert.equal(over.error?.maxSelect, 2);
assert.equal(over.selections, sel, 'acima do máximo não muda a seleção');
assert.equal(findUnmetOptionGroup([radio, multi], {})?.id, 'r');
assert.equal(findUnmetOptionGroup([radio, multi], { r: ['r1'] }), null);
assert.deepEqual(buildSelectedOptions([radio, multi], { r: ['r2'], m: ['m1'] }).map((o) => [o.valueId, o.priceDelta]), [['r2', 2], ['m1', 1]]);
assert.equal(visibleOptionGroups({ options: [group('vazio', 0, 1, 0), radio] }).length, 1, 'grupo sem valores some');

console.log('promotionPanel: ok');
