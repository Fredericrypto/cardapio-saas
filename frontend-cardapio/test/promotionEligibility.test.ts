import assert from 'node:assert/strict';
import {
  computePromotionEligibility,
  computeSelectedPromotionsEligibility,
  previewItemPromotion,
} from '../src/lib/promotionEligibility';
import type { CartItem, Product, Promotion, SelectedCartOption } from '../src/types';

// ---- fábricas -------------------------------------------------------------
const product = (id: string, price: number, extra: Partial<Product> = {}): Product => ({
  id, tenantId: 't', categoryId: 'cat-a', name: id, description: null, price, promoPrice: null,
  imageUrl: null, isAvailable: true, displayOrder: 0, ...extra,
});
const promo = (extra: Partial<Promotion> = {}): Promotion => ({
  id: 'p1', title: 'Hot Deals', description: null, imageUrl: null, discountType: 'percentage',
  discountValue: 70, maxDiscountAmount: 100, minOrderValue: 0, scope: 'all', categoryIds: [], productIds: [],
  usageLimitPerCustomer: null, maxEligibleQuantity: null, endsAt: null, alreadyUsedUp: false, ...extra,
});
const line = (p: Product, quantity: number, opts: SelectedCartOption[] = [], lineKey = p.id): CartItem =>
  ({ lineKey, product: p, quantity, selectedOptions: opts });
const total = (items: CartItem[]) =>
  items.reduce((s, i) => s + i.quantity * ((i.product.promoPrice ?? i.product.price) + i.selectedOptions.reduce((a, o) => a + o.priceDelta, 0)), 0);

// ---- 1. paridade com a fórmula do BACKEND (inteiros) ------------------------
// Referência: PromotionsService.validateSelectedPromotions, 1 linha, sem cap de quantidade.
function backendPercentCents(unitCents: number, qty: number, pct: number, maxCents: number): number {
  return Math.min(Math.round((unitCents * qty * pct) / 100), maxCents);
}
let checked = 0;
for (let cents = 1; cents <= 20000; cents += 3) {
  for (const pct of [5, 10, 15, 25, 33, 35, 45, 50, 55, 65, 70, 90]) {
    for (const qty of [1, 3]) {
      const p = product('x', cents / 100);
      const items = [line(p, qty)];
      const got = computePromotionEligibility(promo({ discountValue: pct, maxDiscountAmount: 100000 }), items, total(items));
      const want = backendPercentCents(cents, qty, pct, 100000 * 100) / 100;
      assert.equal(got.discountAmount, want, `cents=${cents} qty=${qty} pct=${pct}`);
      checked++;
    }
  }
}
assert.ok(checked > 70000);

// regressão do bug antigo (float em reais dava 14 centavos; backend dá 15)
{
  const items = [line(product('x', 0.29), 1)];
  assert.equal(computePromotionEligibility(promo({ discountValue: 50 }), items, 0.29).discountAmount, 0.15);
  const items2 = [line(product('y', 1.14), 3)];
  assert.equal(computePromotionEligibility(promo({ discountValue: 25 }), items2, 3.42).discountAmount, 0.86);
}

// ---- 2. teto, valor fixo, mínimo, já usou ----------------------------------
{
  const items = [line(product('b', 100), 5)];
  const r = computePromotionEligibility(promo({ discountValue: 50, maxDiscountAmount: 40 }), items, 500);
  assert.equal(r.discountAmount, 40, 'teto maxDiscountAmount');
  const fx = computePromotionEligibility(promo({ discountType: 'fixed', discountValue: 30, maxDiscountAmount: null }), [line(product('c', 20), 1)], 20);
  assert.equal(fx.discountAmount, 20, 'fixo nunca passa do elegível');
  const min = computePromotionEligibility(promo({ minOrderValue: 50 }), [line(product('d', 20), 1)], 20);
  assert.equal(min.isEligible, false);
  assert.match(min.reason ?? '', /Faltam R\$ 30,00 pro pedido mínimo de R\$ 50,00/);
  assert.equal(computePromotionEligibility(promo({ alreadyUsedUp: true }), items, 500).isEligible, false);
  // sem teto em percentual o backend recusa => preview não promete desconto
  assert.equal(computePromotionEligibility(promo({ maxDiscountAmount: null }), items, 500).isEligible, false);
}

// ---- 3. maxEligibleQuantity: só as N unidades mais caras --------------------
{
  const cheap = product('cheap', 10);
  const dear = product('dear', 30);
  const items = [line(cheap, 2), line(dear, 2)];
  const r = computePromotionEligibility(promo({ discountValue: 50, maxEligibleQuantity: 3 }), items, total(items));
  // 2x30 + 1x10 = 70 elegível => 50% = 35
  assert.equal(r.discountAmount, 35);
  assert.equal(r.discountedQuantityByLine.get('dear'), 2);
  assert.equal(r.discountedQuantityByLine.get('cheap'), 1);
}

// ---- 4. várias promoções: nunca a mesma unidade duas vezes ------------------
{
  const items = [line(product('burger', 20), 1)];
  const a = promo({ id: 'a', discountValue: 50 });
  const b = promo({ id: 'b', discountValue: 50 });
  const r = computeSelectedPromotionsEligibility([a, b], items, 20);
  assert.equal(r.perPromo.get('a')?.discountAmount, 10);
  assert.equal(r.perPromo.get('b')?.isEligible, false);
  assert.equal(r.totalDiscountAmount, 10);
}

// ---- 5. previewItemPromotion ------------------------------------------------
{
  const burger = product('burger', 20);
  const p = promo({ discountValue: 70, maxDiscountAmount: 100, minOrderValue: 50 });
  const v = previewItemPromotion(p, burger, { cartTotal: 0 });
  assert.equal(v.isEligible, true);
  assert.equal(v.unitPriceBeforePromo, 20);
  assert.equal(v.unitPriceAfterPromo, 6);
  assert.equal(v.unitDiscount, 14);
  assert.deepEqual(v.minOrder, { required: 50, missing: 50 }, 'mínimo NÃO bloqueia o preço, só informa');
  assert.equal(previewItemPromotion(p, burger, { cartTotal: 80 }).minOrder, null);

  // quantidade com cap de quantidade: 3 un., só 1 com desconto
  const cap = promo({ discountValue: 50, maxEligibleQuantity: 1 });
  const q = previewItemPromotion(cap, burger, { quantity: 3 });
  assert.equal(q.discountedUnits, 1);
  assert.equal(q.lineDiscount, 10);
  assert.equal(q.lineTotalBeforePromo, 60);
  assert.equal(q.lineTotalAfterPromo, 50);
  assert.equal(q.unitPriceAfterPromo, 10, 'preço do card = 1 unidade');

  // opções entram na base; promoPrice é a base cobrada, price fica em listUnitPrice
  const opt: SelectedCartOption = { valueId: 'v', groupName: 'g', label: 'bacon', priceDelta: 4.5 };
  const withPromoPrice = product('pp', 20, { promoPrice: 16 });
  const o = previewItemPromotion(promo({ discountValue: 50 }), withPromoPrice, { selectedOptions: [opt] });
  assert.equal(o.listUnitPrice, 24.5);
  assert.equal(o.unitPriceBeforePromo, 20.5);
  assert.equal(o.unitPriceAfterPromo, 10.25);

  // escopo: categoria e produto
  const cat = promo({ scope: 'category', categoryIds: ['outra'] });
  const nc = previewItemPromotion(cat, burger);
  assert.equal(nc.covered, false);
  assert.equal(nc.isEligible, false);
  assert.equal(nc.unitPriceAfterPromo, 20);
  assert.equal(previewItemPromotion(promo({ scope: 'product', productIds: ['burger'] }), burger).isEligible, true);

  // já usou: coberto, mas sem desconto
  const used = previewItemPromotion(promo({ alreadyUsedUp: true }), burger);
  assert.equal(used.covered, true);
  assert.equal(used.isEligible, false);
  assert.equal(used.unitPriceAfterPromo, 20);

  // fixo maior que o preço => 0, nunca negativo
  const fx = previewItemPromotion(promo({ discountType: 'fixed', discountValue: 50, maxDiscountAmount: null }), burger);
  assert.equal(fx.unitPriceAfterPromo, 0);
}

// ---- 6. preview de 1 unidade == desconto do motor com carrinho de 1 item -----
for (let cents = 1; cents <= 20000; cents += 11) {
  for (const pct of [10, 33, 45, 70]) {
    const p = product('z', cents / 100);
    const pr = promo({ discountValue: pct, maxDiscountAmount: 50 });
    const items = [line(p, 1, [], 'preview')];
    const engine = computePromotionEligibility(pr, items, total(items)).discountAmount;
    const prev = previewItemPromotion(pr, p);
    assert.equal(prev.unitDiscount, engine, `cents=${cents} pct=${pct}`);
    assert.equal(Math.round((prev.unitPriceBeforePromo - prev.unitPriceAfterPromo) * 100), Math.round(engine * 100));
  }
}

console.log('promotionEligibility: ok');
