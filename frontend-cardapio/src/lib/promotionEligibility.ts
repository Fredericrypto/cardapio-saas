import type { Promotion, CartItem } from '../types';

export interface PromotionEligibility {
  isEligible: boolean;
  discountAmount: number;
  reason: string | null;
  // Quantas unidades de CADA linha do carrinho (por lineKey) entram no
  // cálculo do desconto — usado só pra ISOLAR visualmente no carrinho
  // (CartPage) as unidades com cupom das demais. Quando
  // `maxEligibleQuantity` da promoção é null, toda a quantidade elegível
  // de cada linha aparece aqui igual à quantidade real (sem "sobra" pra
  // isolar). O valor de verdade, cobrado, é sempre o do backend — isso
  // aqui é só preview.
  discountedQuantityByLine: Map<string, number>;
}

interface MatchingLine {
  lineKey: string;
  unitPrice: number;
  quantity: number;
}

function matchingLines(promo: Promotion, cartItems: CartItem[]): MatchingLine[] {
  return cartItems
    .filter((item) => isItemCoveredByPromotion(promo, item))
    .map((item) => {
      const unitPrice = item.product.promoPrice ?? item.product.price;
      const optionsDelta = item.selectedOptions.reduce((s, o) => s + o.priceDelta, 0);
      return { lineKey: item.lineKey, unitPrice: unitPrice + optionsDelta, quantity: item.quantity };
    });
}

// Espelha EXATAMENTE PromotionsService.claimEligibleCents no backend
// (mesmo critério de desempate: preço unitário decrescente, sort
// estável) — precisa dar o MESMO resultado pro preview bater com o que
// vai ser cobrado de verdade. Retorna tanto o total elegível (pra
// calcular o desconto) quanto quantas unidades de cada linha entraram
// nesse total (pra isolar visualmente no carrinho).
function computeEligibleAmount(
  promo: Promotion,
  cartItems: CartItem[],
): { eligibleTotal: number; discountedQuantityByLine: Map<string, number> } {
  const matching = matchingLines(promo, cartItems);
  const discountedQuantityByLine = new Map<string, number>();

  if (promo.maxEligibleQuantity == null) {
    let eligibleTotal = 0;
    for (const line of matching) {
      eligibleTotal += line.unitPrice * line.quantity;
      discountedQuantityByLine.set(line.lineKey, line.quantity);
    }
    return { eligibleTotal, discountedQuantityByLine };
  }

  const sorted = [...matching].sort((a, b) => b.unitPrice - a.unitPrice);
  let remaining = promo.maxEligibleQuantity;
  let eligibleTotal = 0;
  for (const line of sorted) {
    if (remaining <= 0) break;
    const takenQty = Math.min(remaining, line.quantity);
    eligibleTotal += takenQty * line.unitPrice;
    discountedQuantityByLine.set(line.lineKey, takenQty);
    remaining -= takenQty;
  }
  return { eligibleTotal, discountedQuantityByLine };
}

// Elegibilidade de uma promoção ISOLADA, como se fosse a única
// escolhida — usado pra decidir se ela aparece como "disponível" na
// contagem do carrinho (o cliente pode ou não ter escolhido outras) e
// pra dar o preview de "economize R$X" na lista de cupons.
export function computePromotionEligibility(
  promo: Promotion,
  cartItems: CartItem[],
  cartTotal: number,
): PromotionEligibility {
  const empty = new Map<string, number>();
  if (promo.alreadyUsedUp) {
    return { isEligible: false, discountAmount: 0, reason: 'Você já usou essa promoção.', discountedQuantityByLine: empty };
  }

  if (cartTotal < promo.minOrderValue) {
    const missing = promo.minOrderValue - cartTotal;
    return {
      isEligible: false,
      discountAmount: 0,
      reason: `Faltam R$ ${missing.toFixed(2).replace('.', ',')} pro pedido mínimo de R$ ${promo.minOrderValue.toFixed(2).replace('.', ',')}.`,
      discountedQuantityByLine: empty,
    };
  }

  const { eligibleTotal, discountedQuantityByLine } = computeEligibleAmount(promo, cartItems);

  if (eligibleTotal <= 0) {
    return {
      isEligible: false,
      discountAmount: 0,
      reason: 'Nenhum item do seu carrinho é elegível pra essa promoção.',
      discountedQuantityByLine: empty,
    };
  }

  const discountAmount =
    promo.discountType === 'percentage'
      ? Math.min(
          Math.round(eligibleTotal * promo.discountValue) / 100,
          promo.maxDiscountAmount ?? Infinity,
        )
      : Math.min(promo.discountValue, eligibleTotal);

  if (discountAmount <= 0) {
    return { isEligible: false, discountAmount: 0, reason: 'Essa promoção não gera desconto pra esse carrinho.', discountedQuantityByLine: empty };
  }

  return { isEligible: true, discountAmount, reason: null, discountedQuantityByLine };
}

export interface SinglePromoResult {
  discountAmount: number;
  isEligible: boolean;
  reason: string | null;
}

export interface MultiPromotionEligibility {
  totalDiscountAmount: number;
  // Merge de TODAS as promoções da lista — quantas unidades de cada
  // linha (por lineKey) ficaram com desconto, não importa qual das
  // promoções foi responsável. Usado pra isolar visualmente no carrinho.
  discountedQuantityByLine: Map<string, number>;
  // Resultado individual de cada promoção NESSA ordem — a mesma
  // promoção pode aparecer com desconto R$0/inelegível se as anteriores
  // da lista já consumiram tudo que ela cobriria.
  perPromo: Map<string, SinglePromoResult>;
}

// Espelha EXATAMENTE PromotionsService.validateSelectedPromotions: cada
// promoção da lista "reivindica" as unidades do carrinho que usa, na
// ORDEM em que aparece em `promos` — a próxima só vê o que sobrou.
// Assim, dois cupons pro MESMO item nunca descontam a mesma unidade
// duas vezes, mas cupons pra itens DIFERENTES (o caso comum: um cupom
// pro burger + outro pra coca-cola) funcionam em paralelo sem conflito
// nenhum. Preview apenas — o valor de verdade, cobrado, é sempre
// recalculado no backend na hora de criar o pedido.
export function computeSelectedPromotionsEligibility(
  promos: Promotion[],
  cartItems: CartItem[],
  cartTotal: number,
): MultiPromotionEligibility {
  const remainingQty = new Map<string, number>(cartItems.map((i) => [i.lineKey, i.quantity]));
  const unitPriceByLine = new Map<string, number>(
    cartItems.map((i) => {
      const base = i.product.promoPrice ?? i.product.price;
      const delta = i.selectedOptions.reduce((s, o) => s + o.priceDelta, 0);
      return [i.lineKey, base + delta];
    }),
  );

  const discountedQuantityByLine = new Map<string, number>();
  const perPromo = new Map<string, SinglePromoResult>();
  let totalDiscountAmount = 0;

  for (const promo of promos) {
    if (promo.alreadyUsedUp) {
      perPromo.set(promo.id, { discountAmount: 0, isEligible: false, reason: 'Você já usou essa promoção.' });
      continue;
    }
    if (cartTotal < promo.minOrderValue) {
      const missing = promo.minOrderValue - cartTotal;
      perPromo.set(promo.id, {
        discountAmount: 0,
        isEligible: false,
        reason: `Faltam R$ ${missing.toFixed(2).replace('.', ',')} pro pedido mínimo de R$ ${promo.minOrderValue.toFixed(2).replace('.', ',')}.`,
      });
      continue;
    }

    const matching = cartItems
      .filter((i) => (remainingQty.get(i.lineKey) ?? 0) > 0 && isItemCoveredByPromotion(promo, i))
      .map((i) => ({
        lineKey: i.lineKey,
        unitPrice: unitPriceByLine.get(i.lineKey)!,
        qty: remainingQty.get(i.lineKey)!,
      }));

    let eligibleTotal = 0;
    if (promo.maxEligibleQuantity == null) {
      for (const line of matching) {
        eligibleTotal += line.unitPrice * line.qty;
        discountedQuantityByLine.set(line.lineKey, (discountedQuantityByLine.get(line.lineKey) ?? 0) + line.qty);
        remainingQty.set(line.lineKey, 0);
      }
    } else {
      const sorted = [...matching].sort((a, b) => b.unitPrice - a.unitPrice);
      let cap = promo.maxEligibleQuantity;
      for (const line of sorted) {
        if (cap <= 0) break;
        const taken = Math.min(cap, line.qty);
        eligibleTotal += taken * line.unitPrice;
        discountedQuantityByLine.set(line.lineKey, (discountedQuantityByLine.get(line.lineKey) ?? 0) + taken);
        remainingQty.set(line.lineKey, line.qty - taken);
        cap -= taken;
      }
    }

    if (eligibleTotal <= 0) {
      perPromo.set(promo.id, {
        discountAmount: 0,
        isEligible: false,
        reason:
          promos.length > 1
            ? 'Nenhum item sobrou no carrinho pra esse cupom depois dos outros aplicados.'
            : 'Nenhum item do seu carrinho é elegível pra essa promoção.',
      });
      continue;
    }

    const discountAmount =
      promo.discountType === 'percentage'
        ? Math.min(Math.round(eligibleTotal * promo.discountValue) / 100, promo.maxDiscountAmount ?? Infinity)
        : Math.min(promo.discountValue, eligibleTotal);

    if (discountAmount <= 0) {
      perPromo.set(promo.id, {
        discountAmount: 0,
        isEligible: false,
        reason: 'Essa promoção não gera desconto pra esse carrinho.',
      });
      continue;
    }

    perPromo.set(promo.id, { discountAmount, isEligible: true, reason: null });
    totalDiscountAmount += discountAmount;
  }

  return { totalDiscountAmount, discountedQuantityByLine, perPromo };
}

// Quais itens do carrinho essa promoção afeta — usado pra destacar os
// itens no carrinho ("Promoção aplicada" ao lado do item certo).
export function isItemCoveredByPromotion(promo: Promotion, item: CartItem): boolean {
  if (promo.scope === 'all') return true;
  if (promo.scope === 'category') return promo.categoryIds.includes(item.product.categoryId);
  return promo.productIds.includes(item.product.id);
}

