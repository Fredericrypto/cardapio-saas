import type { ReceiptBreakdown } from '../types';

// Totais do cupom de mesa. O backend manda `breakdown` (centavos, cancelados fora
// das somas); aqui só há fallback para backend antigo e para o histórico, que ainda
// não manda o campo. Dinheiro sempre somado em centavos inteiros.
interface OrderLike {
  status: string;
  discountAmount?: number | string | null;
  cashbackUsed?: number | string | null;
  deliveryFee?: number | string | null;
  promotionTitleSnapshot?: string | null;
  promotionTitlesSnapshot?: string[] | null;
}

const toCents = (v: number | string | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

export function resolveReceiptBreakdown(input: {
  orders: readonly OrderLike[];
  total: number;
  breakdown?: ReceiptBreakdown | null;
}): ReceiptBreakdown {
  const { orders, total, breakdown } = input;
  if (breakdown && typeof breakdown.grossSubtotal === 'number' && Array.isArray(breakdown.promotionTitles)) {
    return breakdown;
  }
  let discount = 0;
  let cashback = 0;
  let fee = 0;
  let cancelledCount = 0;
  const titles: string[] = [];
  for (const order of orders) {
    if (order.status === 'cancelado') {
      cancelledCount++;
      continue;
    }
    discount += toCents(order.discountAmount);
    cashback += toCents(order.cashbackUsed);
    fee += toCents(order.deliveryFee);
    const own = order.promotionTitlesSnapshot?.length
      ? order.promotionTitlesSnapshot
      : order.promotionTitleSnapshot
        ? [order.promotionTitleSnapshot]
        : [];
    for (const title of own) if (!titles.includes(title)) titles.push(title);
  }
  const totalCents = toCents(total);
  return {
    total: totalCents / 100,
    discountTotal: discount / 100,
    cashbackUsedTotal: cashback / 100,
    grossSubtotal: (totalCents + discount + cashback - fee) / 100,
    cancelledCount,
    promotionTitles: titles,
  };
}
