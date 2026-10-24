import { summarizeSessionOrders } from '../src/common/utils/session-totals';

let fails = 0;
let checks = 0;
function eq(name: string, got: unknown, want: unknown) {
  checks++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.error(`FALHOU ${name}: obtido=${JSON.stringify(got)} esperado=${JSON.stringify(want)}`); }
  else console.log(`ok ${name}`);
}

type O = { status: string; total: number; discountAmount?: number | null; cashbackUsed?: number | null; deliveryFee?: number | null; promotionTitlesSnapshot?: string[] | null; items: { subtotal: number }[] };
const o = (status: string, total: number, discountAmount: number | null | undefined, items: number[], titles: string[] = [], extra: Partial<O> = {}): O => ({
  status, total, discountAmount, promotionTitlesSnapshot: titles, items: items.map((subtotal) => ({ subtotal })), ...extra,
});

// Fixture: Mesa 1 real (24/10/2026) — 3 cancelados, 2 entregues, 1 pendente.
const real: O[] = [
  o('entregue', 1.99, 2, [3.99], ['50% OFF']),
  o('entregue', 9.88, 1.1, [6.99, 3.99], ['Daily Deals']),
  o('cancelado', 1.99, 2, [3.99], ['50% OFF', 'SO CANCELADO']),
  o('cancelado', 1.99, 2, [3.99], ['HOT DEALS']),
  o('cancelado', 1.99, 2, [3.99], ['HOT DEALS']),
  o('pendente', 1.99, 2, [3.99], ['HOT DEALS']),
];
const r = summarizeSessionOrders(real);
eq('real.total', r.total, 13.86);
eq('real.discountTotal', r.discountTotal, 5.1);
eq('real.grossSubtotal', r.grossSubtotal, 18.96);
eq('real.cashbackUsedTotal', r.cashbackUsedTotal, 0);
eq('real.cancelledCount', r.cancelledCount, 3);
eq('real.promotionTitles (sem cancelados, ordem de aparição)', r.promotionTitles, ['50% OFF', 'Daily Deals', 'HOT DEALS']);
const itemsCents = real.filter((x) => x.status !== 'cancelado').flatMap((x) => x.items).reduce((s, i) => s + Math.round(i.subtotal * 100), 0);
eq('real.bruto == soma dos itens dos nao cancelados', Math.round(r.grossSubtotal * 100), itemsCents);
eq('real.invariante bruto - desconto - cashback == total', Math.round((r.grossSubtotal - r.discountTotal - r.cashbackUsedTotal) * 100), Math.round(r.total * 100));

// Ponto flutuante: 0,10 + 0,20 tem que dar exatamente 0,30.
const f = summarizeSessionOrders([o('entregue', 0.1, 0.1, [0.2]), o('entregue', 0.2, 0.2, [0.4])]);
eq('float.total', f.total, 0.3);
eq('float.discountTotal', f.discountTotal, 0.3);
eq('float.grossSubtotal', f.grossSubtotal, 0.6);

// Cashback usado no pedido entra no bruto (ja foi abatido do total).
const c = summarizeSessionOrders([o('entregue', 8, 1, [10], [], { cashbackUsed: 1 })]);
eq('cashback.grossSubtotal', c.grossSubtotal, 10);
eq('cashback.cashbackUsedTotal', c.cashbackUsedTotal, 1);

// Taxa de entrega esta dentro do total e nao e item.
const d = summarizeSessionOrders([o('entregue', 15, 0, [10], [], { deliveryFee: 5 })]);
eq('fee.grossSubtotal', d.grossSubtotal, 10);

// Tudo cancelado.
const z = summarizeSessionOrders([o('cancelado', 5, 1, [6]), o('cancelado', 5, 1, [6])]);
eq('allCancelled', [z.total, z.discountTotal, z.grossSubtotal, z.cancelledCount, z.promotionTitles], [0, 0, 0, 2, []]);

// Campos ausentes/nulos (pedidos legados) nao quebram.
const l = summarizeSessionOrders([o('entregue', 4, undefined, [4], undefined as any, { cashbackUsed: null, deliveryFee: null, promotionTitlesSnapshot: null })]);
eq('legacy', [l.total, l.discountTotal, l.cashbackUsedTotal, l.grossSubtotal, l.promotionTitles], [4, 0, 0, 4, []]);

// Lista vazia.
eq('empty', summarizeSessionOrders([]), { total: 0, discountTotal: 0, cashbackUsedTotal: 0, grossSubtotal: 0, cancelledCount: 0, promotionTitles: [] });

console.log(`\n${checks - fails}/${checks} ok, ${fails} falhas`);
process.exit(fails === 0 ? 0 : 1);
