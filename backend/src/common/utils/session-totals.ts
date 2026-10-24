import { toCents, fromCents } from './money';

// Fonte única dos totais de uma conta de mesa (cupom do cliente e do admin).
// Tudo em centavos inteiros: nenhum frontend soma dinheiro em ponto flutuante.
export interface SessionOrderLike {
  status: string;
  total: number | string | null;
  discountAmount?: number | string | null;
  cashbackUsed?: number | string | null;
  deliveryFee?: number | string | null;
  promotionTitlesSnapshot?: string[] | null;
  promotionTitleSnapshot?: string | null;
}

export interface SessionOrdersBreakdown {
  /** Cobrado nos pedidos não cancelados (já líquido de desconto e cashback do pedido). */
  total: number;
  discountTotal: number;
  cashbackUsedTotal: number;
  /** Itens dos pedidos não cancelados antes de desconto/cashback: total + desconto + cashback - taxa de entrega. */
  grossSubtotal: number;
  cancelledCount: number;
  /** Títulos das promoções dos pedidos não cancelados, sem repetição, na ordem em que aparecem. */
  promotionTitles: string[];
}

const cents = (v: number | string | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? toCents(n) : 0;
};

export function summarizeSessionOrders(orders: readonly SessionOrderLike[]): SessionOrdersBreakdown {
  let total = 0;
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
    total += cents(order.total);
    discount += cents(order.discountAmount);
    cashback += cents(order.cashbackUsed);
    fee += cents(order.deliveryFee);
    const orderTitles = order.promotionTitlesSnapshot?.length
      ? order.promotionTitlesSnapshot
      : order.promotionTitleSnapshot
        ? [order.promotionTitleSnapshot]
        : [];
    for (const title of orderTitles) if (!titles.includes(title)) titles.push(title);
  }
  return {
    total: fromCents(total),
    discountTotal: fromCents(discount),
    cashbackUsedTotal: fromCents(cashback),
    grossSubtotal: fromCents(total + discount + cashback - fee),
    cancelledCount,
    promotionTitles: titles,
  };
}
