import { resolveReceiptBreakdown } from '../src/lib/receiptBreakdown';

let fails = 0;
let checks = 0;
function eq(name: string, got: unknown, want: unknown) {
  checks++;
  if (JSON.stringify(got) !== JSON.stringify(want)) { fails++; console.error(`FALHOU ${name}: obtido=${JSON.stringify(got)} esperado=${JSON.stringify(want)}`); }
  else console.log(`ok ${name}`);
}

type O = { status: string; total: number; discountAmount?: number | null; cashbackUsed?: number | null; promotionTitleSnapshot?: string | null; promotionTitlesSnapshot?: string[] | null };
const o = (status: string, total: number, discountAmount: number | undefined, titles: string[] = [], extra: Partial<O> = {}): O =>
  ({ status, total, discountAmount, promotionTitlesSnapshot: titles, ...extra });

const real: O[] = [
  o('entregue', 1.99, 2, ['50% OFF']),
  o('entregue', 9.88, 1.1, ['Daily Deals']),
  o('cancelado', 1.99, 2, ['50% OFF', 'SO CANCELADO']),
  o('cancelado', 1.99, 2, ['HOT DEALS']),
  o('cancelado', 1.99, 2, ['HOT DEALS']),
  o('pendente', 1.99, 2, ['HOT DEALS']),
];

// 1) Backend novo: usa o breakdown como veio, sem recalcular.
const fromServer = { total: 13.86, discountTotal: 5.1, cashbackUsedTotal: 0, grossSubtotal: 18.96, cancelledCount: 3, promotionTitles: ['X'] };
eq('usa breakdown do servidor', resolveReceiptBreakdown({ orders: real, total: 13.86, breakdown: fromServer }), fromServer);

// 2) Backend antigo: fallback em centavos, mesmo resultado da fixture real.
const fb = resolveReceiptBreakdown({ orders: real, total: 13.86 });
eq('fallback.total', fb.total, 13.86);
eq('fallback.discountTotal', fb.discountTotal, 5.1);
eq('fallback.grossSubtotal', fb.grossSubtotal, 18.96);
eq('fallback.cashbackUsedTotal', fb.cashbackUsedTotal, 0);
eq('fallback.cancelledCount', fb.cancelledCount, 3);
eq('fallback.promotionTitles', fb.promotionTitles, ['50% OFF', 'Daily Deals', 'HOT DEALS']);

// 3) Ponto flutuante.
const f = resolveReceiptBreakdown({ orders: [o('entregue', 0.1, 0.1), o('entregue', 0.2, 0.2)], total: 0.3 });
eq('float.discountTotal', f.discountTotal, 0.3);
eq('float.grossSubtotal', f.grossSubtotal, 0.6);

// 4) Cashback do pedido entra no bruto.
const c = resolveReceiptBreakdown({ orders: [o('entregue', 8, 1, [], { cashbackUsed: 1 })], total: 8 });
eq('cashback.grossSubtotal', c.grossSubtotal, 10);

// 5) Tudo cancelado e lista vazia.
eq('allCancelled', resolveReceiptBreakdown({ orders: [o('cancelado', 5, 1), o('cancelado', 5, 1)], total: 0 }),
  { total: 0, discountTotal: 0, cashbackUsedTotal: 0, grossSubtotal: 0, cancelledCount: 2, promotionTitles: [] });
eq('empty', resolveReceiptBreakdown({ orders: [], total: 0 }),
  { total: 0, discountTotal: 0, cashbackUsedTotal: 0, grossSubtotal: 0, cancelledCount: 0, promotionTitles: [] });

// 6) Titulo legado (singular).
eq('legacy.title', resolveReceiptBreakdown({ orders: [o('entregue', 4, 0, [], { promotionTitlesSnapshot: null, promotionTitleSnapshot: 'Antiga' })], total: 4 }).promotionTitles, ['Antiga']);

console.log(`\n${checks - fails}/${checks} ok, ${fails} falhas`);
process.exit(fails === 0 ? 0 : 1);
