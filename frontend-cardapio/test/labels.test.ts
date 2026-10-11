import assert from 'node:assert/strict';
import { translate } from '../src/i18n/translate';
import type { AppLanguage } from '../src/i18n/languages';
import { addonGroupHint, genderLabel, orderStatusLabel, paymentMethodLabel, pixKeyTypeLabel, promotionReasonLabel, sessionStatusLabel } from '../src/i18n/labels';
import { computePromotionEligibility, computeSelectedPromotionsEligibility } from '../src/lib/promotionEligibility';
import type { Promotion } from '../src/types';

const T = (l: AppLanguage) => (k: Parameters<typeof translate>[1], p?: Record<string, string | number>) => translate(l, k, p);

assert.equal(orderStatusLabel('preparando', T('en')), 'Preparing');
assert.equal(orderStatusLabel('aguardando_pagamento', T('es')), 'Esperando Pix');
assert.equal(orderStatusLabel('desconhecido', T('en')), 'desconhecido');
assert.equal(sessionStatusLabel('fechada', T('en')), 'Closed');
assert.equal(paymentMethodLabel('dinheiro', T('en')), 'Cash');
assert.equal(paymentMethodLabel('cartao', T('es')), 'Tarjeta');
assert.equal(pixKeyTypeLabel('aleatoria', T('en')), 'Random key');
assert.equal(genderLabel('prefiro_nao_dizer', T('en')), 'Prefer not to say');
assert.equal(genderLabel('feminino', T('pt-BR')), 'Feminino');

assert.equal(addonGroupHint(0, 1, T('en')), null);
assert.equal(addonGroupHint(0, 3, T('en')), 'Choose up to 3');
assert.equal(addonGroupHint(1, 1, T('es')), 'Elige 1');
assert.equal(addonGroupHint(2, 2, T('en')), 'Choose 2');
assert.equal(addonGroupHint(1, 4, T('pt-BR')), 'Escolha de 1 a 4');

const promo = {
  id: 'p1', minOrderValue: 50, discountType: 'fixed', discountValue: 5, alreadyUsedUp: false, scope: 'all',
  productIds: [], categoryIds: [], maxDiscountAmount: null, maxEligibleQuantity: null,
} as unknown as Promotion;
const r = computePromotionEligibility(promo, [], 30);
assert.equal(r.isEligible, false);
assert.equal(r.reasonCode, 'min_order');
assert.equal(promotionReasonLabel(r, T('pt-BR')), 'Faltam R$ 20,00 pro pedido mínimo de R$ 50,00.');
assert.equal(promotionReasonLabel(r, T('en')), 'R$ 20,00 short of the R$ 50,00 minimum order.');
assert.equal(promotionReasonLabel(r, T('es')), 'Faltan R$ 20,00 para el pedido mínimo de R$ 50,00.');
assert.equal(promotionReasonLabel({ ...r, reason: 'Texto livre' , reasonCode: undefined }, T('en')), 'Texto livre');
assert.equal(promotionReasonLabel(null, T('en')), null);
const used = computePromotionEligibility({ ...promo, alreadyUsedUp: true } as Promotion, [], 100);
assert.equal(promotionReasonLabel(used, T('en')), 'You already used this promotion.');
const multi = computeSelectedPromotionsEligibility([promo], [], 30);
assert.equal(promotionReasonLabel(multi.perPromo.get('p1'), T('en')), 'R$ 20,00 short of the R$ 50,00 minimum order.');

console.log('labels/promoções/status/pagamento/gênero i18n: OK');
