import type { PromoReasonCode } from '../i18n/labels';
import type { Promotion, CartItem, Product, SelectedCartOption } from '../types';

// ---------------------------------------------------------------------------
// Dinheiro em CENTAVOS INTEIROS — espelha backend/src/common/utils/money.ts
// (toCents = Math.round(v * 100)). Todo cálculo abaixo é feito em centavos e só
// vira reais (number com 2 casas) na saída. Antes, o desconto percentual era
// calculado com soma em float de reais; em ~0,5% dos casos isso dava 1 centavo
// a MENOS que o backend (ex.: 29 centavos a 50% => backend 15, float 14).
// ---------------------------------------------------------------------------
const toCents = (value: number): number => Math.round(value * 100);
const fromCents = (cents: number): number => cents / 100;
const brl = (value: number): string => value.toFixed(2).replace('.', ',');

export interface PromotionEligibility {
  isEligible: boolean;
  discountAmount: number;
  reason: string | null;
  reasonCode?: PromoReasonCode;
  reasonParams?: { missing: string; minimum: string };
  // Quantas unidades de CADA linha do carrinho (por lineKey) entram no
  // cálculo do desconto — usado só pra ISOLAR visualmente no carrinho
  // (CartPage) as unidades com cupom das demais. Quando
  // `maxEligibleQuantity` da promoção é null, toda a quantidade elegível
  // de cada linha aparece aqui igual à quantidade real (sem "sobra" pra
  // isolar). O valor de verdade, cobrado, é sempre o do backend — isso
  // aqui é só preview.
  discountedQuantityByLine: Map<string, number>;
}

// Preço unitário de uma linha, em centavos. MESMA regra do backend
// (orders.service): toCents(promoPrice ?? price) + soma de toCents(delta).
function lineUnitPriceCents(item: CartItem): number {
  const base = toCents(item.product.promoPrice ?? item.product.price);
  const options = item.selectedOptions.reduce((sum, o) => sum + toCents(o.priceDelta), 0);
  return base + options;
}

// Desconto em centavos — MESMA fórmula de PromotionsService.validateSelectedPromotions.
// Percentual: teto maxDiscountAmount obrigatório (sem teto o backend recusa, então
// aqui também não prometemos desconto). Fixo: nunca passa do total elegível.
function discountCentsFor(promo: Promotion, eligibleCents: number): number {
  return promo.discountType === 'percentage'
    ? Math.min(Math.round((eligibleCents * promo.discountValue) / 100), toCents(promo.maxDiscountAmount ?? 0))
    : Math.min(toCents(promo.discountValue), eligibleCents);
}

interface MatchingLine {
  lineKey: string;
  unitPriceCents: number;
  quantity: number;
}

function matchingLines(promo: Promotion, cartItems: CartItem[]): MatchingLine[] {
  return cartItems
    .filter((item) => isItemCoveredByPromotion(promo, item))
    .map((item) => ({ lineKey: item.lineKey, unitPriceCents: lineUnitPriceCents(item), quantity: item.quantity }));
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
): { eligibleCents: number; discountedQuantityByLine: Map<string, number> } {
  const matching = matchingLines(promo, cartItems);
  const discountedQuantityByLine = new Map<string, number>();

  if (promo.maxEligibleQuantity == null) {
    let eligibleCents = 0;
    for (const line of matching) {
      eligibleCents += line.unitPriceCents * line.quantity;
      discountedQuantityByLine.set(line.lineKey, line.quantity);
    }
    return { eligibleCents, discountedQuantityByLine };
  }

  const sorted = [...matching].sort((a, b) => b.unitPriceCents - a.unitPriceCents);
  let remaining = promo.maxEligibleQuantity;
  let eligibleCents = 0;
  for (const line of sorted) {
    if (remaining <= 0) break;
    const takenQty = Math.min(remaining, line.quantity);
    eligibleCents += takenQty * line.unitPriceCents;
    discountedQuantityByLine.set(line.lineKey, takenQty);
    remaining -= takenQty;
  }
  return { eligibleCents, discountedQuantityByLine };
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
    return { isEligible: false, discountAmount: 0, reason: 'Você já usou essa promoção.', reasonCode: 'already_used', discountedQuantityByLine: empty };
  }

  if (toCents(cartTotal) < toCents(promo.minOrderValue)) {
    const missing = fromCents(toCents(promo.minOrderValue) - toCents(cartTotal));
    return {
      isEligible: false,
      discountAmount: 0,
      reason: `Faltam R$ ${brl(missing)} pro pedido mínimo de R$ ${brl(promo.minOrderValue)}.`,
      reasonCode: 'min_order',
      reasonParams: { missing: brl(missing), minimum: brl(promo.minOrderValue) },
      discountedQuantityByLine: empty,
    };
  }

  const { eligibleCents, discountedQuantityByLine } = computeEligibleAmount(promo, cartItems);

  if (eligibleCents <= 0) {
    return {
      isEligible: false,
      discountAmount: 0,
      reason: 'Nenhum item do seu carrinho é elegível pra essa promoção.',
      reasonCode: 'no_eligible_items',
      discountedQuantityByLine: empty,
    };
  }

  const discountCents = discountCentsFor(promo, eligibleCents);

  if (discountCents <= 0) {
    return { isEligible: false, discountAmount: 0, reason: 'Essa promoção não gera desconto pra esse carrinho.', reasonCode: 'no_discount', discountedQuantityByLine: empty };
  }

  return { isEligible: true, discountAmount: fromCents(discountCents), reason: null, discountedQuantityByLine };
}

export interface SinglePromoResult {
  discountAmount: number;
  isEligible: boolean;
  reason: string | null;
  reasonCode?: PromoReasonCode;
  reasonParams?: { missing: string; minimum: string };
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
  const cartTotalCents = toCents(cartTotal);
  const remainingQty = new Map<string, number>(cartItems.map((i) => [i.lineKey, i.quantity]));
  const unitPriceCentsByLine = new Map<string, number>(cartItems.map((i) => [i.lineKey, lineUnitPriceCents(i)]));

  const discountedQuantityByLine = new Map<string, number>();
  const perPromo = new Map<string, SinglePromoResult>();
  let totalDiscountCents = 0;

  for (const promo of promos) {
    if (promo.alreadyUsedUp) {
      perPromo.set(promo.id, { discountAmount: 0, isEligible: false, reason: 'Você já usou essa promoção.', reasonCode: 'already_used' });
      continue;
    }
    if (cartTotalCents < toCents(promo.minOrderValue)) {
      const missing = fromCents(toCents(promo.minOrderValue) - cartTotalCents);
      perPromo.set(promo.id, {
        discountAmount: 0,
        isEligible: false,
        reason: `Faltam R$ ${brl(missing)} pro pedido mínimo de R$ ${brl(promo.minOrderValue)}.`,
        reasonCode: 'min_order',
        reasonParams: { missing: brl(missing), minimum: brl(promo.minOrderValue) },
      });
      continue;
    }

    const matching = cartItems
      .filter((i) => (remainingQty.get(i.lineKey) ?? 0) > 0 && isItemCoveredByPromotion(promo, i))
      .map((i) => ({
        lineKey: i.lineKey,
        unitPriceCents: unitPriceCentsByLine.get(i.lineKey)!,
        qty: remainingQty.get(i.lineKey)!,
      }));

    let eligibleCents = 0;
    if (promo.maxEligibleQuantity == null) {
      for (const line of matching) {
        eligibleCents += line.unitPriceCents * line.qty;
        discountedQuantityByLine.set(line.lineKey, (discountedQuantityByLine.get(line.lineKey) ?? 0) + line.qty);
        remainingQty.set(line.lineKey, 0);
      }
    } else {
      const sorted = [...matching].sort((a, b) => b.unitPriceCents - a.unitPriceCents);
      let cap = promo.maxEligibleQuantity;
      for (const line of sorted) {
        if (cap <= 0) break;
        const taken = Math.min(cap, line.qty);
        eligibleCents += taken * line.unitPriceCents;
        discountedQuantityByLine.set(line.lineKey, (discountedQuantityByLine.get(line.lineKey) ?? 0) + taken);
        remainingQty.set(line.lineKey, line.qty - taken);
        cap -= taken;
      }
    }

    if (eligibleCents <= 0) {
      perPromo.set(promo.id, {
        discountAmount: 0,
        isEligible: false,
        reason:
          promos.length > 1
            ? 'Nenhum item sobrou no carrinho pra esse cupom depois dos outros aplicados.'
            : 'Nenhum item do seu carrinho é elegível pra essa promoção.',
        reasonCode: promos.length > 1 ? 'no_items_left' : 'no_eligible_items',
      });
      continue;
    }

    const discountCents = discountCentsFor(promo, eligibleCents);

    if (discountCents <= 0) {
      perPromo.set(promo.id, {
        discountAmount: 0,
        isEligible: false,
        reason: 'Essa promoção não gera desconto pra esse carrinho.',
        reasonCode: 'no_discount',
      });
      continue;
    }

    perPromo.set(promo.id, { discountAmount: fromCents(discountCents), isEligible: true, reason: null });
    totalDiscountCents += discountCents;
  }

  return { totalDiscountAmount: fromCents(totalDiscountCents), discountedQuantityByLine, perPromo };
}

// Quais itens do carrinho essa promoção afeta — usado pra destacar os
// itens no carrinho ("Promoção aplicada" ao lado do item certo).
export function isItemCoveredByPromotion(promo: Promotion, item: CartItem): boolean {
  return isProductCoveredByPromotion(promo, item.product);
}

// Mesma regra de escopo, por produto (sem carrinho) — usada pelo Modo Promoção
// pra listar/contar o que a promoção cobre. Única fonte da regra de escopo.
export function isProductCoveredByPromotion(promo: Promotion, product: Pick<Product, 'id' | 'categoryId'>): boolean {
  if (promo.scope === 'all') return true;
  if (promo.scope === 'category') return promo.categoryIds.includes(product.categoryId);
  return promo.productIds.includes(product.id);
}

// ===========================================================================
// PROGRESSO DO PEDIDO MÍNIMO (banner do Modo Promoção)
// ===========================================================================
//
// Mesma comparação do motor acima (`toCents(cartTotal) < toCents(minOrderValue)`
// => não atingiu) e mesma aritmética em centavos inteiros: o "faltam R$ X" do
// banner é SEMPRE idêntico ao do motivo de inelegibilidade.
export interface MinOrderProgress {
  required: number;
  current: number;
  missing: number;
  reached: boolean;
  // 0..100 inteiro. 100 só quando atingiu de fato (nunca arredonda 99,6% pra 100).
  percent: number;
}

export function computeMinOrderProgress(promo: Pick<Promotion, 'minOrderValue'>, cartTotal: number): MinOrderProgress | null {
  const requiredCents = toCents(promo.minOrderValue);
  if (!(requiredCents > 0)) return null;
  const currentCents = Math.max(0, toCents(cartTotal));
  const reached = currentCents >= requiredCents;
  const percent = reached ? 100 : Math.min(99, Math.floor((currentCents * 100) / requiredCents));
  return {
    required: fromCents(requiredCents),
    current: fromCents(currentCents),
    missing: fromCents(Math.max(0, requiredCents - currentCents)),
    reached,
    percent,
  };
}

// ===========================================================================
// PREVIEW POR ITEM (Modo Promoção e páginas individuais)
// ===========================================================================
//
// O desconto do backend é do PEDIDO (teto e quantidade máxima valem pro
// pedido todo), então "R$ 20 → R$ 6" no card de um produto é uma SIMULAÇÃO:
// roda o MESMO motor acima com um carrinho sintético de 1 produto (a
// quantidade escolhida, com as opções escolhidas). Nada de regra paralela.
//
// Decisões de produto:
//  - Pedido mínimo NÃO bloqueia o preview (estímulo visual com transparência):
//    o preço promocional aparece e `minOrder.missing` diz quanto falta.
//    Quem decide se o desconto vale no pedido continua sendo o backend.
//  - "Já usou" bloqueia (o cliente não pode mais usar a promoção).
//  - Base do desconto = o que o backend cobra hoje: promoPrice ?? price
//    (+ opções). `listUnitPrice` traz o preço de tabela (price) à parte.
//
// `lineKey` fixo: o carrinho sintético tem uma única linha.

const PREVIEW_LINE_KEY = 'preview';

export interface ItemPromotionPreview {
  // O escopo da promoção cobre o produto.
  covered: boolean;
  // Coberto E o cliente ainda pode usar E gera desconto > 0.
  isEligible: boolean;
  // Preço de tabela por unidade (price + opções), ignorando promoPrice.
  listUnitPrice: number;
  // Preço por unidade ANTES da promoção (promoPrice ?? price + opções) — é o
  // valor riscado e a base do desconto.
  unitPriceBeforePromo: number;
  // Preço por unidade DEPOIS da promoção (simulando 1 unidade).
  unitPriceAfterPromo: number;
  unitDiscount: number;
  // Linha inteira para `quantity` unidades (respeita maxEligibleQuantity).
  quantity: number;
  discountedUnits: number;
  lineTotalBeforePromo: number;
  lineDiscount: number;
  lineTotalAfterPromo: number;
  // Motivo quando !isEligible (texto pronto pra exibir).
  reason: string | null;
  // Só informativo: pedido mínimo da promoção e quanto falta (null se não há
  // mínimo ou se já foi atingido).
  minOrder: { required: number; missing: number } | null;
}

export interface ItemPreviewOptions {
  selectedOptions?: SelectedCartOption[];
  quantity?: number;
  // Total atual do carrinho em reais — só serve pra calcular `minOrder.missing`.
  cartTotal?: number;
}

export function previewItemPromotion(
  promo: Promotion,
  product: Product,
  options: ItemPreviewOptions = {},
): ItemPromotionPreview {
  const selectedOptions = options.selectedOptions ?? [];
  const quantity = Math.max(1, Math.floor(options.quantity ?? 1));
  const build = (q: number): CartItem => ({ lineKey: PREVIEW_LINE_KEY, product, quantity: q, selectedOptions });

  const single = build(1);
  const beforeCents = lineUnitPriceCents(single);
  const listCents =
    toCents(product.price) + selectedOptions.reduce((sum, o) => sum + toCents(o.priceDelta), 0);

  const minRequiredCents = toCents(promo.minOrderValue);
  const missingCents = Math.max(0, minRequiredCents - toCents(options.cartTotal ?? 0));
  const minOrder =
    minRequiredCents > 0 && missingCents > 0
      ? { required: fromCents(minRequiredCents), missing: fromCents(missingCents) }
      : null;

  const base = {
    covered: false,
    isEligible: false,
    listUnitPrice: fromCents(listCents),
    unitPriceBeforePromo: fromCents(beforeCents),
    unitPriceAfterPromo: fromCents(beforeCents),
    unitDiscount: 0,
    quantity,
    discountedUnits: 0,
    lineTotalBeforePromo: fromCents(beforeCents * quantity),
    lineDiscount: 0,
    lineTotalAfterPromo: fromCents(beforeCents * quantity),
    reason: null as string | null,
    minOrder,
  };

  const covered = isItemCoveredByPromotion(promo, single);
  if (!covered) return { ...base, reason: 'Esse item não participa dessa promoção.' };
  if (promo.alreadyUsedUp) return { ...base, covered, reason: 'Você já usou essa promoção.' };

  const one = computeEligibleAmount(promo, [single]);
  const unitDiscountCents = one.eligibleCents > 0 ? discountCentsFor(promo, one.eligibleCents) : 0;
  if (unitDiscountCents <= 0) {
    return { ...base, covered, reason: 'Essa promoção não gera desconto pra esse item.' };
  }

  const many = quantity === 1 ? one : computeEligibleAmount(promo, [build(quantity)]);
  const lineDiscountCents = discountCentsFor(promo, many.eligibleCents);

  return {
    ...base,
    covered,
    isEligible: true,
    unitPriceAfterPromo: fromCents(beforeCents - unitDiscountCents),
    unitDiscount: fromCents(unitDiscountCents),
    discountedUnits: many.discountedQuantityByLine.get(PREVIEW_LINE_KEY) ?? 0,
    lineDiscount: fromCents(lineDiscountCents),
    lineTotalAfterPromo: fromCents(beforeCents * quantity - lineDiscountCents),
  };
}
