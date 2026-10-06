import type { Analytics } from '../types/analytics';

// Exportação do relatório analítico.
//  - XLSX: células NUMÉRICAS de verdade (com formato R$/%), várias abas —
//    abre igual no Excel, Google Sheets e LibreOffice Calc.
//  - CSV: UTF-8 com BOM, separador ";" e decimal com vírgula (padrão pt-BR do
//    Excel/LibreOffice/Sheets em português). Para qualquer outro idioma de
//    planilha, prefira o XLSX.
// "Sem dados" (null) vai como texto, nunca como 0.

type Cell = string | number | null;
type Row = Cell[];
interface Sheet {
  name: string;
  rows: Row[];
  money?: number[]; // índices de coluna formatados como R$
  percent?: number[]; // índices de coluna que já vêm em % (ex.: 58.59)
  widths?: number[];
}

const NO = 'Sem dados';

function periodLabel(d: Analytics): string {
  const f = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  return `${f(d.range.from)} a ${f(d.range.to)} (Brasília)`;
}

function dreRows(d: Analytics): Row[] {
  const k = d.kpis;
  const pct = (v: number | null) => (v == null ? 'N/A' : v);
  return [
    ['DRE simplificado', null],
    ['Período', periodLabel(d)],
    [],
    ['Linha', 'Valor (R$)'],
    ['(+) Receita bruta (pedidos válidos)', k.grossRevenue],
    ['(−) Cupons de desconto', -k.discounts],
    ['(−) Taxas de pagamento (cartão/Pix)', -k.paymentFees],
    ['(−) Impostos estimados', -k.taxes],
    ['(=) Receita líquida', k.netRevenue],
    ['(−) CMV (custo da mercadoria vendida)', -k.cogs],
    ['(=) Lucro bruto', k.grossProfit],
    [],
    ['Margem bruta (%)', pct(k.grossMarginPercent)],
    ['CMV sobre receita líquida (%)', pct(k.cmvPercent)],
    ['Cobertura de custo real nas vendas (%)', k.cmvRealCoveragePercent],
    [],
    ['Observações'],
    ['Não inclui despesas operacionais (folha, aluguel, energia etc.).'],
    [`CMV: custo real quando cadastrado; senão estimativa de ${d.params.defaultCmvPercent}% do preço.`],
    ['Cashback resgatado é forma de pagamento e não é deduzido da receita líquida.'],
  ];
}

function sheets(d: Analytics): Sheet[] {
  const k = d.kpis;
  const c = d.cash;
  const r = d.crm;
  const l = d.losses;
  const summary: Sheet = {
    name: 'Resumo',
    rows: [
      ['Indicador', 'Valor'],
      ['Período', periodLabel(d)],
      ['Faturamento bruto', k.grossRevenue],
      ['Cupons de desconto', k.discounts],
      ['Taxas de pagamento', k.paymentFees],
      ['Impostos estimados', k.taxes],
      ['Faturamento líquido', k.netRevenue],
      ['CMV', k.cogs],
      ['Lucro bruto', k.grossProfit],
      ['Margem bruta (%)', k.grossMarginPercent ?? 'N/A'],
      ['CMV sobre receita (%)', k.cmvPercent ?? 'N/A'],
      ['Cobertura de custo real (%)', k.cmvRealCoveragePercent],
      ['Pedidos válidos', k.orders],
      ['Ticket médio por pedido', k.averageTicketPerOrder ?? NO],
      ['Ticket médio por cliente', k.averageTicketPerCustomer ?? NO],
      ['Pedidos cancelados (perda operacional, fora do bruto e do líquido)', l.cancelledOrders],
      ['Perda por cancelamentos (valor)', l.cancelledValue],
      ['Pedidos sem pagamento (não é perda)', l.abandonedUnpaidOrders],
      ['Pratos estornados', NO],
      ['Troco fornecido', c.changeGiven],
      ['Sangrias de caixa', c.bleedTotal ?? NO],
      ['Suprimentos de caixa', c.supplyTotal ?? NO],
      ['Cashback emitido', c.cashbackIssued],
      ['Cashback resgatado', c.cashbackRedeemed],
      ['Cashback vencido sem uso', c.cashbackExpiredUnused],
      ['Taxa de resgate de cashback (%)', c.cashbackRedemptionRatePercent ?? 'N/A'],
      ['Clientes atendidos', r.customersServed],
      ['Clientes com conta', r.identifiedCustomers],
      ['Clientes novos', r.newCustomers],
      ['Clientes recorrentes', r.returningCustomers],
      ['Retenção (%)', r.retentionRatePercent ?? 'N/A'],
      ['LTV médio', r.averageLtv ?? NO],
      ['Clientes verificados', r.verifiedCustomers],
      ['Verificados (%)', r.verifiedPercent ?? 'N/A'],
    ],
    money: [1],
    widths: [38, 30],
  };
  const series: Sheet = {
    name: 'Série temporal',
    rows: [['Período', 'Receita líquida', 'Lucro bruto', 'Tipo'], ...d.series.map((p): Row => [p.label, p.revenue, p.profit, p.forecast ? 'Projeção' : 'Realizado'])],
    money: [1, 2],
    widths: [16, 18, 16, 12],
  };
  const menu: Sheet = {
    name: 'Cardápio',
    rows: [
      ['Item', 'Unidades', 'Receita', 'Preço médio', 'Custo unitário', 'Margem unitária', 'Margem (%)', 'Fonte do custo', 'Classificação'],
      ...d.matrix.items.map((i): Row => [i.name, i.units, i.revenue, i.unitPrice, i.unitCost, i.unitMargin, i.marginPercent ?? 'N/A', i.costSource, i.classification.replace(/_/g, ' ')]),
    ],
    money: [2, 3, 4, 5],
    percent: [6],
    widths: [30, 10, 14, 14, 14, 16, 12, 14, 18],
  };
  const top: Sheet = {
    name: 'Top e menos vendidos',
    rows: [
      ['Ranking', 'Posição', 'Item', 'Unidades', 'Receita'],
      ...d.topProducts.map((i, n): Row => ['Mais vendidos', n + 1, i.name, i.units, i.revenue]),
      ...d.bottomProducts.map((i, n): Row => ['Menos vendidos', n + 1, i.name, i.units, i.revenue]),
    ],
    money: [4],
    widths: [16, 9, 30, 10, 14],
  };
  const heat: Sheet = {
    name: 'Mapa de calor',
    rows: [['Dia da semana', 'Hora', 'Pedidos', 'Receita líquida'], ...d.heatmap.map((h): Row => [['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][h.weekday], h.hour, h.orders, h.revenue])],
    money: [3],
    widths: [16, 8, 10, 16],
  };
  const channels: Sheet = {
    name: 'Canais',
    rows: [['Canal', 'Pedidos', 'Receita líquida'], ...d.channels.map((x): Row => [x.label, x.orders, x.revenue])],
    money: [2],
    widths: [20, 10, 16],
  };
  const cancel: Sheet = {
    name: 'Cancelamentos',
    rows: [['Motivo', 'Pedidos', 'Valor'], ...l.byReason.map((x): Row => [x.reason, x.orders, x.value])],
    money: [2],
    widths: [44, 10, 14],
  };
  const dre: Sheet = { name: 'DRE', rows: dreRows(d), money: [1], widths: [44, 30] };
  return [summary, series, menu, top, heat, channels, cancel, dre];
}

function fileStamp(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Neutraliza injeção de fórmula (=, +, -, @) em textos vindos de clientes/itens.
function safeText(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

function csvCell(v: Cell): string {
  if (v == null) return '';
  if (typeof v === 'number') return String(v).replace('.', ',');
  const t = safeText(v);
  return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

function toCsv(rows: Row[]): string {
  return rows.map((r) => r.map(csvCell).join(';')).join('\r\n');
}

export async function exportAnalyticsXlsx(d: Analytics, only?: 'DRE'): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const s of sheets(d).filter((x) => !only || x.name === only)) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows.map((r) => r.map((v) => (typeof v === 'string' ? safeText(v) : v))));
    const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
    for (let R = range.s.r + 1; R <= range.e.r; R++) {
      for (const col of s.money ?? []) {
        const cell = ws[XLSX.utils.encode_cell({ r: R, c: col })];
        if (cell && cell.t === 'n') cell.z = '"R$" #,##0.00';
      }
      for (const col of s.percent ?? []) {
        const cell = ws[XLSX.utils.encode_cell({ r: R, c: col })];
        if (cell && cell.t === 'n') cell.z = '0.00"%"';
      }
    }
    if (s.widths) ws['!cols'] = s.widths.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  download(
    new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${only ? 'dre-simplificado' : 'relatorio-analitico'}-${fileStamp()}.xlsx`,
  );
}

export function exportAnalyticsCsv(d: Analytics, only?: 'DRE'): void {
  const parts = sheets(d)
    .filter((x) => !only || x.name === only)
    .map((s) => (only ? toCsv(s.rows) : `${s.name}\r\n${toCsv(s.rows)}`));
  const csv = `\uFEFF${parts.join('\r\n\r\n')}`;
  download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${only ? 'dre-simplificado' : 'relatorio-analitico'}-${fileStamp()}.csv`);
}
