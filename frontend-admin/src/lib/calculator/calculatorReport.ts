// Textos, CSV, JSON e relatório imprimível (PDF) de uma simulação.
// Tudo sai dos MESMOS números que a tela mostra (evaluateDraft): nada é recalculado à parte.
import type { CalculatorDraft } from '../../types/managerCalculator';
import { cmvStatus } from './calculatorMath';
import type { CalculationResult, CmvStatus, Evaluation } from './calculatorMath';
import { formatBRL, formatDateTime, formatDecimal, formatPercent } from './calculatorFormat';
import { CATEGORY_META, FIELD_SPECS } from './calculatorMeta';
import type { FieldSpec } from './calculatorMeta';

export interface ResultRow {
  label: string;
  value: string;
  tone?: 'good' | 'bad' | 'strong';
}

export const CMV_STATUS_TEXT: Record<CmvStatus, string> = {
  baixo: 'Abaixo da faixa ideal (28% a 32%): confira porções, desperdício e se o preço de venda não está alto demais.',
  ideal: 'Dentro da faixa ideal do setor (28% a 32%).',
  atencao: 'Um pouco acima do ideal (28% a 32%): vale revisar compras e porcionamento.',
  alto: 'ALERTA: acima de 35%. O custo dos ingredientes está acima da média saudável do setor (ideal entre 28% e 32%).',
};

export function describeResult(result: CalculationResult): ResultRow[] {
  switch (result.category) {
    case 'PRICING_MARKUP': {
      const rows: ResultRow[] = [
        { label: 'Preço de venda sugerido', value: formatBRL(result.suggestedPrice), tone: 'strong' },
        { label: 'Custo de produção', value: formatBRL(result.cost) },
        { label: 'Impostos', value: formatBRL(result.taxAmount) },
        { label: 'Taxa do cartão', value: formatBRL(result.cardAmount) },
        { label: 'Taxa de delivery', value: formatBRL(result.deliveryAmount) },
        { label: 'Lucro bruto', value: formatBRL(result.grossProfit), tone: result.grossProfit >= 0 ? 'good' : 'bad' },
        { label: 'Margem efetiva', value: formatPercent(result.effectiveMarginPercent) },
        { label: 'Markup (preço ÷ custo)', value: `${formatDecimal(result.markup)}x` },
        { label: 'Se apenas dobrasse o custo', value: `${formatBRL(result.naiveDoublePrice)} (lucro ${formatBRL(result.naiveDoubleProfit)})` },
      ];
      if (result.currentPrice !== undefined) {
        rows.push(
          { label: 'Preço atual', value: formatBRL(result.currentPrice) },
          {
            label: 'Lucro no preço atual',
            value: `${formatBRL(result.currentProfit)} (${formatPercent(result.currentMarginPercent)})`,
            tone: (result.currentProfit ?? 0) >= 0 ? 'good' : 'bad',
          },
        );
      }
      return rows;
    }
    case 'CMV':
      return [
        { label: 'CMV do período', value: formatBRL(result.cmvAmount) },
        { label: 'CMV %', value: formatPercent(result.cmvPercent), tone: 'strong' },
        { label: 'Sobra após ingredientes', value: formatPercent(result.grossMarginPercent) },
        { label: 'Faturamento bruto', value: formatBRL(result.revenue) },
      ];
    case 'BREAK_EVEN': {
      const rows: ResultRow[] = [
        { label: 'Margem de contribuição', value: formatPercent(result.contributionMarginPercent) },
        { label: 'Faturamento mínimo necessário', value: formatBRL(result.requiredRevenue), tone: 'strong' },
        { label: `Meta diária (${result.days} dias)`, value: formatBRL(result.dailyTarget), tone: 'strong' },
      ];
      if (result.ordersPerDay !== undefined) rows.push({ label: 'Pedidos por dia necessários', value: String(result.ordersPerDay) });
      return rows;
    }
    case 'DELIVERY_MARGIN': {
      const rows: ResultRow[] = [
        { label: 'Preço no app', value: formatBRL(result.price) },
        { label: 'Comissão do app', value: formatBRL(result.commissionAmount) },
        { label: 'Taxa de transação', value: formatBRL(result.transactionAmount) },
        { label: 'Valor recebido do app', value: formatBRL(result.receivedFromApp), tone: 'strong' },
        { label: 'Imposto', value: formatBRL(result.taxAmount) },
        { label: 'Custo do prato', value: formatBRL(result.cost) },
        { label: 'Lucro líquido real', value: formatBRL(result.netProfit), tone: result.netProfit >= 0 ? 'good' : 'bad' },
        { label: 'Margem líquida real', value: formatPercent(result.netMarginPercent), tone: result.netProfit >= 0 ? 'good' : 'bad' },
      ];
      if (result.suggestedPrice !== undefined) rows.push({ label: 'Preço no app para a margem desejada', value: formatBRL(result.suggestedPrice), tone: 'strong' });
      return rows;
    }
    case 'RECIPE_COST':
      return [
        { label: 'Custo total da receita', value: formatBRL(result.totalCost) },
        { label: 'Rendimento', value: `${result.portions} porç${result.portions === 1 ? 'ão' : 'ões'}` },
        { label: 'Custo por porção', value: formatBRL(result.costPerPortion), tone: 'strong' },
      ];
  }
}

// Uma frase de viabilidade (resumo executivo).
export function viabilityLine(result: CalculationResult): string {
  switch (result.category) {
    case 'PRICING_MARKUP':
      return `Vendendo a ${formatBRL(result.suggestedPrice)}, cada unidade deixa ${formatBRL(result.grossProfit)} de lucro (${formatPercent(result.effectiveMarginPercent)}).`;
    case 'CMV':
      return CMV_STATUS_TEXT[cmvStatus(result.cmvPercent)];
    case 'BREAK_EVEN':
      return `É preciso faturar ${formatBRL(result.requiredRevenue)} por mês (${formatBRL(result.dailyTarget)} por dia) para não ter prejuízo.`;
    case 'DELIVERY_MARGIN':
      return result.netProfit >= 0
        ? `Cada venda no app deixa ${formatBRL(result.netProfit)} de lucro real (${formatPercent(result.netMarginPercent)}).`
        : `PREJUÍZO: cada venda no app perde ${formatBRL(Math.abs(result.netProfit))}. Reajuste o preço ou renegocie a comissão.`;
    case 'RECIPE_COST':
      return `Cada porção custa ${formatBRL(result.costPerPortion)} para ser produzida.`;
  }
}

function formatInput(spec: FieldSpec, raw: string | number): string {
  const text = String(raw).trim();
  if (text === '') return '';
  const n = Number(text);
  if (!Number.isFinite(n)) return text;
  if (spec.kind === 'money') return formatBRL(n);
  if (spec.kind === 'percent') return formatPercent(n);
  return String(n);
}

export function describeInputs(draft: CalculatorDraft): ResultRow[] {
  const rows: ResultRow[] = [];
  for (const spec of FIELD_SPECS[draft.category]) {
    const value = formatInput(spec, draft.inputs[spec.key] ?? '');
    if (value !== '') rows.push({ label: spec.label.replace(/ \((?:R\$|%)\)$/, '').replace(/ \(opcional(?:, (?:R\$|%))?\)$/, ''), value });
  }
  if (draft.category === 'RECIPE_COST') {
    (draft.ingredients ?? []).forEach((i, idx) => {
      if (i.name.trim() === '' && i.usedQty.trim() === '' && i.packPrice.trim() === '') return;
      rows.push({
        label: `Ingrediente ${idx + 1}: ${i.name.trim() || 'sem nome'}`,
        value: `usa ${i.usedQty || '?'} de ${i.packQty || '?'} (embalagem ${formatInput({ key: '', label: '', kind: 'money' }, i.packPrice) || '?'})`,
      });
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Texto para WhatsApp
// ---------------------------------------------------------------------------
export function buildSummaryText(draft: CalculatorDraft, evaluation: Evaluation, storeName: string): string {
  const lines: string[] = [`*${CATEGORY_META[draft.category].label}* — ${draft.title}`, storeName, ''];
  const inputs = describeInputs(draft);
  if (inputs.length > 0) {
    lines.push('*Dados informados*');
    inputs.forEach((r) => lines.push(`• ${r.label}: ${r.value}`));
    lines.push('');
  }
  if (evaluation.status === 'ok') {
    lines.push('*Resultado*');
    describeResult(evaluation.result).forEach((r) => lines.push(`• ${r.label}: ${r.value}`));
    lines.push('', viabilityLine(evaluation.result));
  } else {
    lines.push(evaluation.message);
  }
  if (draft.notes?.trim()) lines.push('', `Obs.: ${draft.notes.trim()}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CSV (Excel/Sheets em português: separador ";", decimal com vírgula, BOM UTF-8)
// ---------------------------------------------------------------------------
function csvCell(value: string): string {
  // Texto que começa com = + - @ vira fórmula no Excel: neutraliza (número de verdade passa).
  const isPlainNumber = /^-?\d+(,\d+)?$/.test(value);
  const safe = !isPlainNumber && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[;"\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const csvNumber = (n: number): string => (Number.isFinite(n) ? String(Math.round((n + Number.EPSILON) * 10000) / 10000).replace('.', ',') : '');

export function buildCsv(draft: CalculatorDraft, evaluation: Evaluation, storeName: string): string {
  const rows: string[][] = [
    ['Calculadora de Gestão', ''],
    ['Restaurante', storeName],
    ['Simulação', draft.title],
    ['Categoria', CATEGORY_META[draft.category].label],
    ['Atualizada em', formatDateTime(draft.updatedAt)],
    ['', ''],
    ['PARÂMETROS', ''],
  ];
  FIELD_SPECS[draft.category].forEach((spec) => {
    const raw = draft.inputs[spec.key];
    const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(',', '.'));
    if (raw !== undefined && String(raw).trim() !== '' && Number.isFinite(n)) rows.push([spec.label, csvNumber(n)]);
  });
  (draft.ingredients ?? []).forEach((i, idx) => {
    if (i.name.trim() || i.usedQty.trim() || i.packPrice.trim()) {
      rows.push([`Ingrediente ${idx + 1}`, i.name], ['  quantidade usada', i.usedQty.replace('.', ',')], ['  quantidade da embalagem', i.packQty.replace('.', ',')], ['  preço da embalagem', i.packPrice.replace('.', ',')]);
    }
  });
  rows.push(['', ''], ['RESULTADOS', '']);
  if (evaluation.status === 'ok') {
    const r = evaluation.result;
    const numeric: Array<[string, number | undefined]> = [];
    switch (r.category) {
      case 'PRICING_MARKUP':
        numeric.push(['Preço sugerido (R$)', r.suggestedPrice], ['Custo (R$)', r.cost], ['Impostos (R$)', r.taxAmount], ['Taxa cartão (R$)', r.cardAmount], ['Taxa delivery (R$)', r.deliveryAmount], ['Lucro bruto (R$)', r.grossProfit], ['Margem efetiva (%)', r.effectiveMarginPercent], ['Markup (x)', r.markup]);
        break;
      case 'CMV':
        numeric.push(['CMV (R$)', r.cmvAmount], ['CMV (%)', r.cmvPercent], ['Faturamento (R$)', r.revenue]);
        break;
      case 'BREAK_EVEN':
        numeric.push(['Margem de contribuição (%)', r.contributionMarginPercent], ['Faturamento mínimo (R$)', r.requiredRevenue], ['Meta diária (R$)', r.dailyTarget], ['Pedidos por dia', r.ordersPerDay]);
        break;
      case 'DELIVERY_MARGIN':
        numeric.push(['Comissão (R$)', r.commissionAmount], ['Transação (R$)', r.transactionAmount], ['Recebido do app (R$)', r.receivedFromApp], ['Imposto (R$)', r.taxAmount], ['Custo (R$)', r.cost], ['Lucro líquido real (R$)', r.netProfit], ['Margem líquida real (%)', r.netMarginPercent], ['Preço para a margem desejada (R$)', r.suggestedPrice]);
        break;
      case 'RECIPE_COST':
        numeric.push(['Custo total (R$)', r.totalCost], ['Porções', r.portions], ['Custo por porção (R$)', r.costPerPortion]);
        break;
    }
    numeric.forEach(([label, value]) => {
      if (value !== undefined) rows.push([label, csvNumber(value)]);
    });
    rows.push(['Resumo', viabilityLine(r)]);
  } else {
    rows.push(['Situação', evaluation.message]);
  }
  if (draft.notes?.trim()) rows.push(['', ''], ['Observações', draft.notes.trim()]);
  return '\uFEFF' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
}

export function buildJson(draft: CalculatorDraft, evaluation: Evaluation, storeName: string): string {
  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      store: storeName,
      draft: { ...draft },
      evaluation: evaluation.status === 'ok' ? { status: 'ok', result: evaluation.result } : evaluation,
    },
    null,
    2,
  );
}

export function slugifyFileName(text: string): string {
  const base = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return base || 'simulacao';
}

export function downloadTextFile(fileName: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------
// PDF: abre o diálogo de impressão com um relatório limpo (escolha "Salvar como PDF").
// Fica num iframe oculto (sem pop-up bloqueado). Todo texto é escapado.
// ---------------------------------------------------------------------------
const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function rowsTable(title: string, rows: ResultRow[]): string {
  if (rows.length === 0) return '';
  const body = rows
    .map((r) => `<tr><td>${escapeHtml(r.label)}</td><td class="v ${r.tone ?? ''}">${escapeHtml(r.value)}</td></tr>`)
    .join('');
  return `<h2>${escapeHtml(title)}</h2><table>${body}</table>`;
}

export function printReport(args: {
  draft: CalculatorDraft;
  evaluation: Evaluation;
  storeName: string;
  logoUrl: string | null;
}): void {
  const { draft, evaluation, storeName, logoUrl } = args;
  const safeLogo = logoUrl && /^https?:\/\//i.test(logoUrl) ? logoUrl : null;
  const result =
    evaluation.status === 'ok'
      ? rowsTable('Resultados', describeResult(evaluation.result)) +
        `<p class="resumo"><strong>Resumo de viabilidade:</strong> ${escapeHtml(viabilityLine(evaluation.result))}</p>`
      : `<p class="resumo">${escapeHtml(evaluation.message)}</p>`;
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(draft.title)}</title>
<style>
  *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#18181b;margin:24px;font-size:13px}
  header{display:flex;align-items:center;gap:14px;border-bottom:2px solid #18181b;padding-bottom:12px;margin-bottom:8px}
  header img{width:56px;height:56px;border-radius:12px;object-fit:cover}
  h1{font-size:20px;margin:0} h2{font-size:14px;margin:20px 0 6px;text-transform:uppercase;letter-spacing:.04em;color:#52525b}
  .sub{color:#71717a;font-size:12px;margin:2px 0 0}
  table{width:100%;border-collapse:collapse} td{padding:7px 4px;border-bottom:1px solid #e4e4e7;vertical-align:top}
  td.v{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap} td.strong{font-weight:700} td.good{color:#15803d;font-weight:700} td.bad{color:#b91c1c;font-weight:700}
  .resumo{margin-top:16px;padding:10px 12px;background:#f4f4f5;border-radius:8px}
  footer{margin-top:28px;color:#71717a;font-size:11px}
</style></head><body>
<header>${safeLogo ? `<img src="${escapeHtml(safeLogo)}" alt="">` : ''}<div><h1>${escapeHtml(draft.title)}</h1>
<p class="sub">${escapeHtml(storeName)} · ${escapeHtml(CATEGORY_META[draft.category].label)} · ${escapeHtml(formatDateTime(new Date().toISOString()))}</p></div></header>
${rowsTable('Parâmetros de entrada', describeInputs(draft))}
${result}
${draft.notes?.trim() ? `<h2>Observações</h2><p>${escapeHtml(draft.notes.trim())}</p>` : ''}
<footer>Gerado pela Calculadora de Gestão — módulo financeiro. Valores calculados com precisão de centavos; não substitui a orientação do seu contador.</footer>
</body></html>`;

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  let printed = false;
  const run = () => {
    if (printed) return;
    printed = true;
    win.focus();
    win.print();
    window.setTimeout(() => frame.remove(), 2000);
  };
  const img = doc.querySelector('img');
  if (img && !img.complete) {
    img.addEventListener('load', run, { once: true });
    img.addEventListener('error', run, { once: true });
    window.setTimeout(run, 1500);
  } else {
    window.setTimeout(run, 50);
  }
}

