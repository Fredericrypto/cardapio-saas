import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';
import type { Analytics } from '../types/analytics';

// Relatório executivo da aba Análise em PDF (A4 retrato), com os gráficos
// desenhados como VETOR direto no PDF (nítidos em qualquer zoom/impressão, e
// independentes do tema claro/escuro da tela).
//
// Regras de paginação: cada bloco (cartões de KPI, gráfico, tabela) só entra na
// página se couber inteiro; senão vai para a página seguinte — nenhum gráfico
// é cortado no meio. Todas as páginas levam cabeçalho corrido e rodapé "Página
// X de Y".

export interface AnalyticsPdfInput {
  data: Analytics;
  establishmentName: string;
  // Nome da loja filtrada; null = todas as lojas.
  locationName: string | null;
  // PNG ou JPEG já em bytes (o chamador converte WebP etc.). null = sem logo.
  logo: { bytes: Uint8Array; kind: 'png' | 'jpg' } | null;
  // Cor da marca (#RRGGBB) usada nos destaques.
  accentHex: string;
  generatedAt: Date;
}

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;
const TOP_FIRST = MARGIN;
const TOP_NEXT = MARGIN + 26; // sobra espaço para o cabeçalho corrido
const BOTTOM = PAGE_H - MARGIN - 18; // sobra espaço para o rodapé
const TZ = 'America/Sao_Paulo';

const INK = rgb(0.09, 0.09, 0.11);
const MUTED = rgb(0.45, 0.45, 0.5);
const LINE = rgb(0.88, 0.88, 0.9);
const SOFT = rgb(0.965, 0.965, 0.97);
const PROFIT = rgb(0.2, 0.62, 0.38);

function hexToRgb(hex: string, fallback: RGB): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function mix(a: RGB, b: RGB, t: number): RGB {
  const k = Math.max(0, Math.min(1, t));
  return rgb(a.red + (b.red - a.red) * k, a.green + (b.green - a.green) * k, a.blue + (b.blue - a.blue) * k);
}

// ---- formatação (pt-BR, fuso de Brasília) ----
const brlFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const intFmt = new Intl.NumberFormat('pt-BR');
const fmtBrl = (v: number | null | undefined) => (v == null ? 'Sem dados' : brlFmt.format(v));
const fmtInt = (v: number | null | undefined) => (v == null ? 'Sem dados' : intFmt.format(v));
const fmtPct = (v: number | null | undefined) =>
  v == null ? 'Sem dados' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

function brlCompact(v: number): string {
  const abs = Math.abs(v);
  const dec = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  if (abs >= 1_000_000) return `R$ ${dec(v / 1_000_000)} mi`;
  if (abs >= 1_000) return `R$ ${dec(v / 1_000)} mil`;
  return `R$ ${Math.round(v)}`;
}

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}
function fmtDateTime(d: Date): string {
  const date = fmtDate(d);
  const time = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return `${date} às ${time}`;
}

// `range.to` é EXCLUSIVO: o último dia mostrado é 1 ms antes dele.
export function formatPeriod(range: { from: string; to: string }): string {
  const from = new Date(range.from);
  const lastDay = new Date(new Date(range.to).getTime() - 1);
  const a = fmtDate(from);
  const b = fmtDate(lastDay);
  return a === b ? a : `${a} a ${b}`;
}

export function pdfFileName(slug: string, range: { from: string; to: string }): string {
  const iso = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d); // AAAA-MM-DD
  return `analise-${slug}-${iso(new Date(range.from))}_${iso(new Date(new Date(range.to).getTime() - 1))}.pdf`;
}

// ---- texto seguro para as fontes padrão do PDF (WinAnsi) ----
const REPLACEMENTS: Record<string, string> = {
  '\u2013': '-', '\u2014': '-', '\u2018': "'", '\u2019': "'", '\u201C': '"', '\u201D': '"',
  '\u2026': '...', '\u00A0': ' ', '\u2192': '->', '\u2605': '*', '\u2022': '-',
};
function makeSafe(font: PDFFont) {
  const supported = new Set(font.getCharacterSet());
  return (text: string): string => {
    let out = '';
    for (const ch of text.normalize('NFC')) {
      const mapped = REPLACEMENTS[ch] ?? ch;
      // Caractere que a fonte do PDF não tem (emoji, símbolos): descarta, não vira "?".
      for (const c of mapped) if (supported.has(c.codePointAt(0) as number)) out += c;
    }
    return out.replace(/\s{2,}/g, ' ').trim();
  };
}

class Writer {
  page!: PDFPage;
  y = 0; // distância do topo da página
  pageIndex = 0;
  readonly pages: PDFPage[] = [];
  readonly safe: (t: string) => string;
  // Campos explícitos (o tsconfig usa erasableSyntaxOnly: nada de parameter properties).
  readonly doc: PDFDocument;
  readonly regular: PDFFont;
  readonly bold: PDFFont;
  private readonly runningTitle: string;

  constructor(doc: PDFDocument, regular: PDFFont, bold: PDFFont, runningTitle: string) {
    this.doc = doc;
    this.regular = regular;
    this.bold = bold;
    this.runningTitle = runningTitle;
    this.safe = makeSafe(regular);
    this.newPage(true);
  }

  newPage(first = false) {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.pages.push(this.page);
    this.pageIndex = this.pages.length;
    this.y = first ? TOP_FIRST : TOP_NEXT;
    if (!first) {
      this.text(this.runningTitle, MARGIN, MARGIN + 6, 8, MUTED);
      this.line(MARGIN, MARGIN + 14, PAGE_W - MARGIN, MARGIN + 14, LINE, 0.6);
    }
  }

  // Garante `height` livre; senão abre outra página (bloco nunca é cortado).
  ensure(height: number) {
    if (this.y + height > BOTTOM) this.newPage();
  }

  py(top: number) {
    return PAGE_H - top;
  }

  text(t: string, x: number, top: number, size: number, color: RGB = INK, bold = false, align: 'left' | 'right' | 'center' = 'left') {
    const font = bold ? this.bold : this.regular;
    const s = this.safe(t);
    const w = font.widthOfTextAtSize(s, size);
    const px = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    this.page.drawText(s, { x: px, y: this.py(top) - size * 0.8, size, font, color });
  }

  width(t: string, size: number, bold = false) {
    return (bold ? this.bold : this.regular).widthOfTextAtSize(this.safe(t), size);
  }

  fit(t: string, size: number, maxW: number, bold = false): string {
    let s = this.safe(t);
    const font = bold ? this.bold : this.regular;
    if (font.widthOfTextAtSize(s, size) <= maxW) return s;
    while (s.length > 1 && font.widthOfTextAtSize(`${s}...`, size) > maxW) s = s.slice(0, -1);
    return `${s}...`;
  }

  wrap(t: string, size: number, maxW: number): string[] {
    const words = this.safe(t).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (this.regular.widthOfTextAtSize(candidate, size) <= maxW) current = candidate;
      else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  line(x1: number, t1: number, x2: number, t2: number, color: RGB, thickness = 0.8, dash?: number[]) {
    this.page.drawLine({
      start: { x: x1, y: this.py(t1) },
      end: { x: x2, y: this.py(t2) },
      color,
      thickness,
      dashArray: dash,
    });
  }

  rect(x: number, top: number, w: number, h: number, fill?: RGB, border?: RGB, radius = 0) {
    if (radius > 0) {
      // retângulo arredondado via caminho SVG (origem no canto superior esquerdo)
      const r = Math.min(radius, w / 2, h / 2);
      const d = `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} H ${r} A ${r} ${r} 0 0 1 0 ${h - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
      this.page.drawSvgPath(d, { x, y: this.py(top), color: fill, borderColor: border, borderWidth: border ? 0.7 : 0 });
      return;
    }
    this.page.drawRectangle({ x, y: this.py(top) - h, width: w, height: h, color: fill, borderColor: border, borderWidth: border ? 0.7 : 0 });
  }

  card(top: number, h: number) {
    this.rect(MARGIN, top, CONTENT_W, h, rgb(1, 1, 1), LINE, 6);
  }

  sectionTitle(title: string, subtitle?: string) {
    this.text(title, MARGIN + 14, this.y + 12, 10.5, INK, true);
    if (subtitle) this.text(subtitle, PAGE_W - MARGIN - 14, this.y + 13, 7.5, MUTED, false, 'right');
  }
}

// ------------------------------------------------------------------ blocos --

function drawHeader(w: Writer, input: AnalyticsPdfInput, accent: RGB, logo: PDFImage | null) {
  const { data } = input;
  w.rect(0, 0, PAGE_W, 8, accent);
  const top = w.y + 6;
  let textX = MARGIN;
  if (logo) {
    const box = 46;
    const scale = Math.min(box / logo.width, box / logo.height);
    const lw = logo.width * scale;
    const lh = logo.height * scale;
    w.page.drawImage(logo, { x: MARGIN, y: w.py(top) - lh, width: lw, height: lh });
    textX = MARGIN + lw + 12;
  }
  w.text(input.establishmentName, textX, top, 17, INK, true);
  w.text('Relatório de Análise', textX, top + 24, 10.5, MUTED);

  const meta: [string, string][] = [
    ['Período analisado', formatPeriod(data.range)],
    ['Loja', input.locationName ?? 'Todas as lojas'],
    ['Gerado em', fmtDateTime(input.generatedAt)],
  ];
  let metaY = top + 4;
  for (const [label, value] of meta) {
    w.text(label, PAGE_W - MARGIN - 200, metaY, 7.5, MUTED);
    w.text(value, PAGE_W - MARGIN, metaY, 8.5, INK, true, 'right');
    metaY += 13;
  }
  w.y = top + 58;
  w.line(MARGIN, w.y, PAGE_W - MARGIN, w.y, LINE, 0.8);
  w.y += 14;
}

function drawKpiRow(w: Writer, items: { label: string; value: string; hint?: string }[]) {
  const gap = 8;
  const cardW = (CONTENT_W - gap * (items.length - 1)) / items.length;
  const h = 56;
  w.ensure(h + 8);
  items.forEach((item, i) => {
    const x = MARGIN + i * (cardW + gap);
    w.rect(x, w.y, cardW, h, SOFT, undefined, 6);
    w.text(item.label, x + 10, w.y + 10, 7.5, MUTED);
    w.text(w.fit(item.value, 14, cardW - 20, true), x + 10, w.y + 24, 14, INK, true);
    if (item.hint) w.text(w.fit(item.hint, 7, cardW - 20), x + 10, w.y + 43, 7, MUTED);
  });
  w.y += h + 8;
}

// "Bons" valores de eixo (1, 2, 5 x 10^n).
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = 10 ** exp;
  const f = v / base;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * base;
}

function drawRevenueChart(w: Writer, data: Analytics, accent: RGB) {
  const h = 215;
  w.ensure(h + 10);
  const top = w.y;
  w.card(top, h);
  w.sectionTitle('Faturamento e lucro no período', data.range.granularity === 'hour' ? 'por hora' : data.range.granularity === 'month' ? 'por mês' : 'por dia');

  const series = data.series;
  const plotL = MARGIN + 52;
  const plotR = PAGE_W - MARGIN - 16;
  const plotT = top + 40;
  const plotB = top + h - 38;
  const plotW = plotR - plotL;
  const plotH = plotB - plotT;

  if (series.length === 0) {
    w.text('Sem dados no período', (plotL + plotR) / 2, (plotT + plotB) / 2, 9, MUTED, false, 'center');
    w.y += h + 10;
    return;
  }

  const maxV = niceMax(Math.max(...series.map((p) => Math.max(p.revenue, p.profit, 0)), 1));
  const minV = Math.min(0, ...series.map((p) => p.profit));
  const span = maxV - minV;
  const yAt = (v: number) => plotB - ((v - minV) / span) * plotH;
  const xAt = (i: number) => (series.length === 1 ? (plotL + plotR) / 2 : plotL + (i / (series.length - 1)) * plotW);

  for (let i = 0; i <= 4; i++) {
    const v = minV + (span * i) / 4;
    const yy = yAt(v);
    w.line(plotL, yy, plotR, yy, i === 0 ? rgb(0.7, 0.7, 0.74) : LINE, 0.5);
    w.text(brlCompact(v), plotL - 6, yy - 3, 7, MUTED, false, 'right');
  }

  // área sob o faturamento
  if (series.length > 1) {
    let d = `M ${xAt(0) - MARGIN} ${yAt(0) - top}`;
    series.forEach((p, i) => (d += ` L ${xAt(i) - MARGIN} ${yAt(p.revenue) - top}`));
    d += ` L ${xAt(series.length - 1) - MARGIN} ${yAt(0) - top} Z`;
    w.page.drawSvgPath(d, { x: MARGIN, y: w.py(top), color: accent, opacity: 0.12 });
  }

  const drawSeries = (key: 'revenue' | 'profit', color: RGB, thickness: number) => {
    for (let i = 1; i < series.length; i++) {
      const forecast = series[i].forecast === true;
      w.line(xAt(i - 1), yAt(series[i - 1][key]), xAt(i), yAt(series[i][key]), color, thickness, forecast ? [3, 2] : undefined);
    }
    if (series.length <= 40) {
      series.forEach((p, i) => w.page.drawCircle({ x: xAt(i), y: w.py(yAt(p[key])), size: 1.8, color }));
    }
  };
  drawSeries('profit', PROFIT, 1.2);
  drawSeries('revenue', accent, 1.8);

  // rótulos do eixo X (no máximo ~8, sem sobrepor)
  const labelEvery = Math.max(1, Math.ceil(series.length / 8));
  series.forEach((p, i) => {
    if (i % labelEvery !== 0 && i !== series.length - 1) return;
    w.text(p.label, xAt(i), plotB + 6, 7, MUTED, false, 'center');
  });

  // legenda
  const legendTop = top + h - 16;
  w.rect(MARGIN + 14, legendTop + 2, 10, 3, accent);
  w.text('Faturamento', MARGIN + 28, legendTop, 7.5, INK);
  w.rect(MARGIN + 92, legendTop + 2, 10, 3, PROFIT);
  w.text('Lucro bruto', MARGIN + 106, legendTop, 7.5, INK);
  if (series.some((p) => p.forecast)) w.text('Tracejado = previsão', MARGIN + 170, legendTop, 7.5, MUTED);

  w.y += h + 10;
}

const CHANNEL_SHADES = [0, 0.45, 0.75];

function drawChannelDonut(w: Writer, data: Analytics, accent: RGB) {
  const channels = data.channels;
  const h = 140;
  w.ensure(h + 10);
  const top = w.y;
  w.card(top, h);
  w.sectionTitle('Vendas por canal');

  const total = channels.reduce((s, c) => s + c.revenue, 0);
  const cx = MARGIN + 80;
  const cy = top + 78;
  const outer = 46;
  const inner = 27;
  const white = rgb(1, 1, 1);
  const colorOf = (i: number) => mix(accent, white, CHANNEL_SHADES[i % CHANNEL_SHADES.length]);

  if (total <= 0) {
    w.text('Sem vendas no período', cx, cy - 4, 8.5, MUTED, false, 'center');
  } else {
    const active = channels.map((c, i) => ({ c, i })).filter(({ c }) => c.revenue > 0);
    if (active.length === 1) {
      w.page.drawCircle({ x: cx, y: w.py(cy), size: outer, color: colorOf(active[0].i) });
      w.page.drawCircle({ x: cx, y: w.py(cy), size: inner, color: white });
    } else {
      let angle = -Math.PI / 2;
      for (const { c, i } of active) {
        const sweep = (c.revenue / total) * Math.PI * 2;
        const a0 = angle;
        const a1 = angle + sweep;
        angle = a1;
        const pt = (r: number, a: number) => `${(r * Math.cos(a)).toFixed(3)} ${(r * Math.sin(a)).toFixed(3)}`;
        const large = sweep > Math.PI ? 1 : 0;
        const d = `M ${pt(outer, a0)} A ${outer} ${outer} 0 ${large} 1 ${pt(outer, a1)} L ${pt(inner, a1)} A ${inner} ${inner} 0 ${large} 0 ${pt(inner, a0)} Z`;
        w.page.drawSvgPath(d, { x: cx, y: w.py(cy), color: colorOf(i), borderColor: white, borderWidth: 1 });
      }
    }
  }

  // legenda em tabela
  const lx = MARGIN + 160;
  const colOrders = PAGE_W - MARGIN - 130;
  const colRevenue = PAGE_W - MARGIN - 56;
  const colPct = PAGE_W - MARGIN - 14;
  let ly = top + 44;
  w.text('Canal', lx + 16, ly, 7.5, MUTED);
  w.text('Pedidos', colOrders, ly, 7.5, MUTED, false, 'right');
  w.text('Faturamento', colRevenue, ly, 7.5, MUTED, false, 'right');
  w.text('%', colPct, ly, 7.5, MUTED, false, 'right');
  ly += 16;
  channels.forEach((c, i) => {
    w.rect(lx, ly + 1, 8, 8, colorOf(i), undefined, 2);
    w.text(c.label, lx + 16, ly, 9, INK);
    w.text(fmtInt(c.orders), colOrders, ly, 9, INK, false, 'right');
    w.text(fmtBrl(c.revenue), colRevenue, ly, 9, INK, false, 'right');
    w.text(total > 0 ? fmtPct((c.revenue / total) * 100) : '-', colPct, ly, 9, MUTED, false, 'right');
    ly += 17;
  });

  w.y += h + 10;
}

function drawTopProducts(w: Writer, data: Analytics, accent: RGB) {
  const items = [...data.topProducts].sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  const rowH = 20;
  const h = 44 + Math.max(1, items.length) * rowH + 8;
  w.ensure(h + 10);
  const top = w.y;
  w.card(top, h);
  w.sectionTitle('Produtos mais vendidos', 'por faturamento');

  if (items.length === 0) {
    w.text('Sem vendas no período', MARGIN + 14, top + 44, 9, MUTED);
    w.y += h + 10;
    return;
  }
  const max = Math.max(...items.map((i) => i.revenue), 1);
  const nameW = 190;
  const barL = MARGIN + 14 + nameW + 8;
  const valueW = 118;
  const barMax = PAGE_W - MARGIN - 14 - valueW - barL;
  items.forEach((item, i) => {
    const ry = top + 38 + i * rowH;
    w.text(w.fit(item.name, 8.5, nameW), MARGIN + 14, ry + 3, 8.5, INK);
    w.rect(barL, ry + 1, Math.max(2, (item.revenue / max) * barMax), 11, accent, undefined, 2);
    w.text(`${fmtBrl(item.revenue)} · ${fmtInt(item.units)} un.`, PAGE_W - MARGIN - 14, ry + 3, 8, MUTED, false, 'right');
  });
  w.y += h + 10;
}

function drawHeatmap(w: Writer, data: Analytics, accent: RGB) {
  const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const h = 192;
  w.ensure(h + 10);
  const top = w.y;
  w.card(top, h);
  w.sectionTitle('Pedidos por dia e horário', 'mais escuro = mais pedidos');

  const cells = new Map(data.heatmap.map((c) => [`${c.weekday}-${c.hour}`, c]));
  const max = Math.max(1, ...data.heatmap.map((c) => c.orders));
  const gridL = MARGIN + 44;
  const cellW = (CONTENT_W - 44 - 14) / 24;
  const cellH = 13;
  const gridT = top + 52;
  const white = rgb(1, 1, 1);

  for (let hour = 0; hour < 24; hour += 2) {
    w.text(String(hour).padStart(2, '0'), gridL + hour * cellW + cellW / 2, gridT - 11, 6.5, MUTED, false, 'center');
  }
  days.forEach((label, d) => {
    w.text(label, MARGIN + 14, gridT + d * (cellH + 2) + 3, 7.5, MUTED);
    for (let hour = 0; hour < 24; hour++) {
      const orders = cells.get(`${d}-${hour}`)?.orders ?? 0;
      const fill = orders === 0 ? SOFT : mix(white, accent, 0.18 + 0.82 * (orders / max));
      w.rect(gridL + hour * cellW + 0.6, gridT + d * (cellH + 2), cellW - 1.2, cellH, fill, undefined, 1.5);
    }
  });

  const peak = data.heatmap.reduce<(typeof data.heatmap)[number] | null>((b, c) => (!b || c.orders > b.orders ? c : b), null);
  if (peak && peak.orders > 0) {
    w.text(`Pico: ${days[peak.weekday]} às ${String(peak.hour).padStart(2, '0')}h (${fmtInt(peak.orders)} pedidos)`, MARGIN + 14, top + h - 20, 8, MUTED);
  }
  w.y += h + 10;
}

function drawDre(w: Writer, data: Analytics) {
  const k = data.kpis;
  const rows: [string, string, boolean][] = [
    ['Faturamento bruto', fmtBrl(k.grossRevenue), true],
    ['(-) Descontos (cupons)', fmtBrl(k.discounts), false],
    ['(-) Taxas de pagamento', fmtBrl(k.paymentFees), false],
    ['(-) Impostos estimados', fmtBrl(k.taxes), false],
    ['Receita líquida', fmtBrl(k.netRevenue), true],
    ['(-) CMV (custo das mercadorias)', fmtBrl(k.cogs), false],
    ['Lucro bruto', fmtBrl(k.grossProfit), true],
    ['Margem bruta', fmtPct(k.grossMarginPercent), false],
  ];
  const rowH = 17;
  const h = 40 + rows.length * rowH + 8;
  w.ensure(h + 10);
  const top = w.y;
  w.card(top, h);
  w.sectionTitle('Resumo financeiro (DRE simplificado)');
  rows.forEach(([label, value, strong], i) => {
    const ry = top + 36 + i * rowH;
    if (strong) w.rect(MARGIN + 8, ry - 3, CONTENT_W - 16, rowH - 1, SOFT, undefined, 3);
    w.text(label, MARGIN + 16, ry + 1, 8.5, INK, strong);
    w.text(value, PAGE_W - MARGIN - 16, ry + 1, 8.5, INK, strong, 'right');
  });
  w.y += h + 10;
}

function drawNotes(w: Writer, data: Analytics) {
  if (data.notes.length === 0) return;
  const lines = data.notes.flatMap((n) => w.wrap(`- ${n}`, 7.5, CONTENT_W - 28));
  const h = 36 + lines.length * 10 + 6;
  w.ensure(h);
  const top = w.y;
  w.card(top, h);
  w.sectionTitle('Observações');
  lines.forEach((l, i) => w.text(l, MARGIN + 14, top + 32 + i * 10, 7.5, MUTED));
  w.y += h + 10;
}

// ------------------------------------------------------------------- entrada --

export async function buildAnalyticsPdf(input: AnalyticsPdfInput): Promise<Uint8Array> {
  const { data } = input;
  const doc = await PDFDocument.create();
  doc.setTitle(`Relatório de Análise - ${input.establishmentName}`);
  doc.setProducer('Cardápio SaaS');
  doc.setCreationDate(input.generatedAt);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const accent = hexToRgb(input.accentHex, rgb(0.09, 0.09, 0.11));

  let logo: PDFImage | null = null;
  if (input.logo) {
    try {
      logo = input.logo.kind === 'png' ? await doc.embedPng(input.logo.bytes) : await doc.embedJpg(input.logo.bytes);
    } catch {
      logo = null; // logo ilegível: o relatório sai só com o nome
    }
  }

  const w = new Writer(doc, regular, bold, `${input.establishmentName} - Relatório de Análise - ${formatPeriod(data.range)}`);
  drawHeader(w, input, accent, logo);

  const k = data.kpis;
  drawKpiRow(w, [
    { label: 'Faturamento bruto', value: fmtBrl(k.grossRevenue), hint: `Líquido ${fmtBrl(k.netRevenue)}` },
    { label: 'Pedidos', value: fmtInt(k.orders), hint: `${fmtInt(data.crm.customersServed)} clientes atendidos` },
    { label: 'Ticket médio', value: fmtBrl(k.averageTicketPerOrder), hint: 'por pedido' },
    { label: 'CMV médio', value: fmtPct(k.cmvPercent), hint: `custo real em ${fmtPct(k.cmvRealCoveragePercent)} das vendas` },
  ]);
  drawKpiRow(w, [
    { label: 'Lucro bruto', value: fmtBrl(k.grossProfit) },
    { label: 'Margem bruta', value: fmtPct(k.grossMarginPercent) },
    { label: 'Descontos', value: fmtBrl(k.discounts) },
    { label: 'Pedidos cancelados', value: fmtInt(data.losses.cancelledOrders), hint: fmtBrl(data.losses.cancelledValue) },
  ]);

  drawRevenueChart(w, data, accent);
  drawChannelDonut(w, data, accent);
  drawTopProducts(w, data, accent);
  drawHeatmap(w, data, accent);
  drawDre(w, data);
  drawNotes(w, data);

  // rodapé com numeração (só agora o total de páginas é conhecido)
  const total = w.pages.length;
  w.pages.forEach((page, i) => {
    w.page = page;
    w.text(`Página ${i + 1} de ${total}`, PAGE_W - MARGIN, PAGE_H - MARGIN + 2, 8, MUTED, false, 'right');
    w.text(`Gerado em ${fmtDateTime(input.generatedAt)}`, MARGIN, PAGE_H - MARGIN + 2, 8, MUTED);
  });

  return doc.save();
}
