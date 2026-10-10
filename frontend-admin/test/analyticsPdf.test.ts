import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { buildAnalyticsPdf, formatPeriod, pdfFileName } from '../src/lib/analyticsPdf';
import type { Analytics } from '../src/types/analytics';
import { writeFileSync } from 'node:fs';

const days = 31;
const series = Array.from({ length: days }, (_, i) => {
  const revenue = 2400 + Math.sin(i / 3) * 900 + (i % 7 === 5 ? 1500 : 0) + i * 20;
  return { bucket: `2026-10-${String(i + 1).padStart(2, '0')}T03:00:00.000Z`, label: `${String(i + 1).padStart(2, '0')}/10`, revenue, profit: revenue * 0.38, forecast: i >= 29 };
});
const product = (n: number) => ({
  productId: `p${n}`, name: n === 2 ? 'Açaí 500ml com granola — “especial” ✓ 🍓' : `Produto número ${n} com nome razoavelmente longo`,
  units: 400 - n * 30, revenue: (400 - n * 30) * 22.9, unitPrice: 22.9, unitCost: 9, unitMargin: 13.9, marginPercent: 60, costSource: 'real' as const,
});
const heatmap = Array.from({ length: 7 }, (_, weekday) => Array.from({ length: 24 }, (_, hour) => ({ weekday, hour, orders: hour >= 11 && hour <= 22 ? Math.round(3 + (weekday >= 5 ? 6 : 0) + (hour === 20 ? 9 : 0)) : 0, revenue: 0 }))).flat();
const data = {
  range: { period: 'mes', from: '2026-10-01T03:00:00.000Z', to: '2026-11-01T03:00:00.000Z', granularity: 'day', timezone: 'America/Sao_Paulo' },
  params: { defaultCmvPercent: 35, cardFeePercent: 2.5, pixFeePercent: 0.8, taxPercent: 6 },
  kpis: { grossRevenue: 98234.5, discounts: 2100, cashbackRedeemed: 340, paymentFees: 1900, taxes: 5894, netRevenue: 88340, cogs: 34400, grossProfit: 53940, grossMarginPercent: 61, cmvPercent: 35.02, cmvRealCoveragePercent: 82.4, orders: 2891, averageTicketPerOrder: 33.98, averageTicketPerCustomer: 41.2 },
  losses: { cancelledOrders: 41, cancelledValue: 1320.9, abandonedUnpaidOrders: 12, refundedDishes: null, byReason: [] },
  cash: { changeGiven: 0, bleedTotal: null, supplyTotal: null, cashbackIssued: 0, cashbackRedeemed: 0, cashbackExpiredUnused: 0, cashbackRedemptionRatePercent: null },
  crm: { customersServed: 1204, identifiedCustomers: 800, newCustomers: 200, returningCustomers: 600, retentionRatePercent: 50, averageLtv: 120, verifiedCustomers: 10, verifiedPercent: 1 },
  series, forecast: null,
  topProducts: Array.from({ length: 10 }, (_, i) => product(i + 1)), bottomProducts: [],
  matrix: { items: [], averageVolume: 0, averageMargin: 0 }, heatmap,
  channels: [
    { channel: 'mesa', label: 'Mesa', orders: 1500, revenue: 52000 },
    { channel: 'balcao', label: 'Balcão', orders: 900, revenue: 30000 },
    { channel: 'entrega', label: 'Entrega', orders: 491, revenue: 16234.5 },
  ],
  notes: ['CMV estimado em 17,6% das vendas por falta de custo cadastrado.', 'Previsão por regressão linear simples; confiança baixa com menos de 14 pontos.'],
} as unknown as Analytics;

const bytes = await buildAnalyticsPdf({
  data, establishmentName: 'Açaí da Praia', locationName: 'Centro', logo: null, accentHex: '#7c3aed', generatedAt: new Date('2026-10-10T15:30:00Z'),
});
assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), '%PDF-');
const reloaded = await PDFDocument.load(bytes);
assert.ok(reloaded.getPageCount() >= 1 && reloaded.getPageCount() <= 3, `páginas: ${reloaded.getPageCount()}`);
for (const page of reloaded.getPages()) assert.deepEqual([Math.round(page.getWidth()), Math.round(page.getHeight())], [595, 842], 'A4');

assert.equal(formatPeriod(data.range), '01/10/2026 a 31/10/2026', 'to é exclusivo: último dia = 31/10');
assert.equal(pdfFileName('acai', data.range), 'analise-acai-2026-10-01_2026-10-31.pdf');

// Sem nenhum dado também gera (relatório vazio não pode quebrar).
const empty = { ...data, series: [], topProducts: [], heatmap: [], channels: [], notes: [] } as Analytics;
const emptyBytes = await buildAnalyticsPdf({ data: empty, establishmentName: 'Loja', locationName: null, logo: null, accentHex: 'inválido', generatedAt: new Date() });
assert.ok((await PDFDocument.load(emptyBytes)).getPageCount() >= 1);

writeFileSync(process.env.PDF_OUT ?? '/tmp/analise.pdf', bytes);
console.log('analyticsPdf: OK,', reloaded.getPageCount(), 'página(s)');
