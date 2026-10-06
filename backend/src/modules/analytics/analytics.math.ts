import type { Forecast, Granularity, MatrixClass, MatrixItem, MenuItemStat, SeriesPoint } from './analytics.types';

const r2 = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;
const cents = (v: number): number => Math.round(v * 100);

// ---------------------------------------------------------------------------
// Projeção de tendência: regressão linear simples (mínimos quadrados) sobre o
// histórico de receita e de lucro. O último ponto (bucket em andamento, ainda
// incompleto) fica de fora do ajuste quando há dados suficientes.
// ---------------------------------------------------------------------------
function ols(ys: number[]): { slope: number; intercept: number; r2: number } {
  const n = ys.length;
  const xs = ys.map((_, i) => i);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = my - slope * mx;
  const rSq = sxx === 0 || syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  return { slope, intercept, r2: rSq };
}

function nextBucket(bucket: string, g: Granularity): string {
  // `bucket` é horário LOCAL (sem fuso) — só usamos Date como calculadora.
  const d = new Date(`${bucket}Z`);
  if (g === 'hour') d.setUTCHours(d.getUTCHours() + 1);
  else if (g === 'day') d.setUTCDate(d.getUTCDate() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 19);
}

function labelOf(bucket: string, g: Granularity): string {
  const [date, time] = bucket.split('T');
  const [y, m, d] = date.split('-');
  if (g === 'hour') return `${d}/${m} ${time.slice(0, 2)}h`;
  if (g === 'day') return `${d}/${m}`;
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${months[Number(m) - 1]}/${y.slice(2)}`;
}

// Trava de segurança de cada ponto projetado (pedido do Felipe, 05/10):
//  - receita projetada nunca é negativa;
//  - receita projetada zerada => lucro projetado obrigatoriamente 0;
//  - lucro projetado nunca é negativo (não há custos fixos modelados) e nunca
//    passa da própria receita (lucro = receita − CMV, e CMV >= 0).
// Vale só para a PROJEÇÃO — os valores reais do histórico nunca são alterados.
export function lockProjectedPoint(regressionRevenue: number, regressionProfit: number): { revenue: number; profit: number } {
  const revenue = r2(Math.max(0, regressionRevenue));
  const profit = revenue === 0 ? 0 : Math.min(revenue, r2(Math.max(0, regressionProfit)));
  return { revenue, profit };
}

export function buildForecast(
  series: SeriesPoint[],
  g: Granularity,
): { points: SeriesPoint[]; forecast: Forecast } | null {
  if (series.length < 3) return null;
  // Sem nenhuma venda no período não há tendência a projetar.
  if (series.every((p) => p.revenue === 0 && p.profit === 0)) return null;
  const fitSeries = series.length >= 4 ? series.slice(0, -1) : series;
  const rev = ols(fitSeries.map((p) => p.revenue));
  const prof = ols(fitSeries.map((p) => p.profit));

  const horizon = g === 'hour' ? 6 : g === 'day' ? 7 : 3;
  const points: SeriesPoint[] = [];
  let bucket = series[series.length - 1].bucket;
  let nextRevenueCents = 0;
  let nextProfitCents = 0;
  for (let step = 1; step <= horizon; step++) {
    bucket = nextBucket(bucket, g);
    const idx = fitSeries.length - 1 + step + (series.length - fitSeries.length);
    const { revenue, profit } = lockProjectedPoint(rev.intercept + rev.slope * idx, prof.intercept + prof.slope * idx);
    nextRevenueCents += cents(revenue);
    nextProfitCents += cents(profit);
    points.push({ bucket, label: labelOf(bucket, g), revenue, profit, forecast: true });
  }

  const mean = fitSeries.reduce((a, p) => a + p.revenue, 0) / fitSeries.length;
  const drift = mean > 0 ? (rev.slope * fitSeries.length) / mean : 0;
  const trend: Forecast['trend'] = drift > 0.05 ? 'alta' : drift < -0.05 ? 'queda' : 'estavel';
  return {
    points,
    forecast: {
      method: 'linear-regression',
      horizon,
      // Soma EXATA (em centavos) dos pontos que o gráfico desenha.
      nextPeriodRevenue: nextRevenueCents / 100,
      nextPeriodProfit: nextProfitCents / 100,
      trend,
      r2: r2(rev.r2),
      lowConfidence: fitSeries.length < 6 || rev.r2 < 0.2,
    },
  };
}

// ---------------------------------------------------------------------------
// FONTE ÚNICA do cardápio. Todas as visões (Top 10, Menos vendidos, matriz 2x2,
// pontos do gráfico e cards dos quadrantes) saem da MESMA lista, calculada aqui.
// ---------------------------------------------------------------------------
export interface CatalogRow {
  productId: string;
  name: string;
  units: number;
  revenue: number; // soma dos itens vendidos (pedidos válidos) — antes de cupons
  cost: number; // custo total das unidades vendidas (real ou estimado, em centavos exatos)
  allReal: boolean;
  listPrice: number | null; // preço de tabela atual
  listCost: number | null; // custo cadastrado atual
  active: boolean; // existe no catálogo hoje (não excluído)
}

export type CatalogItem = MenuItemStat & { active: boolean };

export function buildCatalog(rows: CatalogRow[], defaultCmvPercent: number): CatalogItem[] {
  return rows.map((r): CatalogItem => {
    if (r.units > 0) {
      const revenueC = cents(r.revenue);
      const costC = cents(r.cost);
      const unitPrice = r2(revenueC / r.units / 100);
      // Margem unitária EXATA ((receita − custo) ÷ unidades), arredondada uma
      // vez só; o custo unitário é derivado dela para preço − custo = margem.
      const unitMargin = r2((revenueC - costC) / r.units / 100);
      return {
        productId: r.productId,
        name: r.name,
        units: r.units,
        revenue: r2(revenueC / 100),
        unitPrice,
        unitCost: r2(unitPrice - unitMargin),
        unitMargin,
        marginPercent: revenueC > 0 ? r2(((revenueC - costC) / revenueC) * 100) : null,
        costSource: r.allReal ? 'real' : 'estimada',
        active: r.active,
      };
    }
    // Sem vendas no período: referência com o preço de tabela e o custo
    // (real se cadastrado, senão o % padrão).
    const price = r2(r.listPrice ?? 0);
    const hasCost = r.listCost != null;
    const cost = hasCost ? r2(r.listCost as number) : r2((price * defaultCmvPercent) / 100);
    const margin = r2(price - cost);
    return {
      productId: r.productId,
      name: r.name,
      units: 0,
      revenue: 0,
      unitPrice: price,
      unitCost: cost,
      unitMargin: margin,
      marginPercent: price > 0 ? r2((margin / price) * 100) : null,
      costSource: hasCost ? 'real' : 'estimada',
      active: r.active,
    };
  });
}

const byName = (a: MenuItemStat, b: MenuItemStat) => a.name.localeCompare(b.name, 'pt-BR');

// Top 10: mais unidades primeiro (desempate: maior receita, depois nome).
export function rankTop(items: CatalogItem[], limit = 10): MenuItemStat[] {
  return items
    .filter((i) => i.units > 0)
    .sort((a, b) => b.units - a.units || b.revenue - a.revenue || byName(a, b))
    .slice(0, limit)
    .map(stripActive);
}

// Menos vendidos: ordem CRESCENTE de unidades (zero venda primeiro), só itens
// que existem no catálogo e que NÃO estão no Top 10 — um campeão de vendas
// nunca aparece aqui (com catálogo de até 10 itens a lista fica vazia).
export function rankBottom(items: CatalogItem[], top: MenuItemStat[], limit = 10): MenuItemStat[] {
  const inTop = new Set(top.map((t) => t.productId));
  return items
    .filter((i) => i.active && !inTop.has(i.productId))
    .sort((a, b) => a.units - b.units || a.revenue - b.revenue || byName(a, b))
    .slice(0, limit)
    .map(stripActive);
}

function stripActive(i: CatalogItem): MenuItemStat {
  const { active: _active, ...rest } = i;
  void _active;
  return rest;
}

// ---------------------------------------------------------------------------
// Matriz de engenharia de cardápio (2x2), sobre os itens COM venda no período:
//   V̄ = unidades vendidas ÷ nº de itens vendidos      (volume médio)
//   M̄ = Σ(margem unitária × unidades) ÷ Σ unidades    (margem média da loja)
//   Estrela        : volume >= V̄  E  margem >= M̄
//   Burro de carga : volume >= V̄  E  margem <  M̄
//   Puzzle         : volume <  V̄  E  margem >= M̄
//   Cão            : volume <  V̄  E  margem <  M̄
// As comparações são feitas em aritmética INTEIRA (unidades e centavos, por
// multiplicação cruzada), então a classificação é exata e idêntica ao que o
// painel mostra: nada de erro de ponto flutuante nem de arredondamento.
// ---------------------------------------------------------------------------
export function classifyMenu(items: MenuItemStat[]): {
  items: MatrixItem[];
  averageVolume: number;
  averageMargin: number;
} {
  const sold = items.filter((i) => i.units > 0);
  if (sold.length === 0) return { items: [], averageVolume: 0, averageMargin: 0 };
  const n = sold.length;
  const totalUnits = sold.reduce((a, i) => a + i.units, 0);
  const weightedMarginCents = sold.reduce((a, i) => a + cents(i.unitMargin) * i.units, 0);

  const classify = (i: MenuItemStat): MatrixClass => {
    const highVolume = i.units * n >= totalUnits; // units >= totalUnits / n
    const highMargin = cents(i.unitMargin) * totalUnits >= weightedMarginCents; // margem >= média ponderada
    if (highVolume && highMargin) return 'estrela';
    if (highVolume) return 'burro_de_carga';
    if (highMargin) return 'puzzle';
    return 'cao';
  };
  return {
    items: sold.map((i) => ({ ...i, classification: classify(i) })),
    averageVolume: r2(totalUnits / n),
    averageMargin: r2(weightedMarginCents / totalUnits / 100),
  };
}
