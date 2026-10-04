import type { Forecast, Granularity, MatrixClass, MatrixItem, MenuItemStat, SeriesPoint } from './analytics.types';

const r2 = (v: number): number => Math.round(v * 100) / 100;

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
  let nextRevenue = 0;
  let nextProfit = 0;
  for (let step = 1; step <= horizon; step++) {
    bucket = nextBucket(bucket, g);
    const idx = fitSeries.length - 1 + step + (series.length - fitSeries.length);
    const revenue = Math.max(0, r2(rev.intercept + rev.slope * idx));
    const profit = r2(prof.intercept + prof.slope * idx);
    nextRevenue += revenue;
    nextProfit += profit;
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
      nextPeriodRevenue: r2(nextRevenue),
      nextPeriodProfit: r2(nextProfit),
      trend,
      r2: r2(rev.r2),
      lowConfidence: fitSeries.length < 6 || rev.r2 < 0.2,
    },
  };
}

// ---------------------------------------------------------------------------
// Engenharia de cardápio (matriz 2x2 — método de Kasavana & Smith):
//  - volume ALTO  = unidades ≥ 70% da média de unidades por item vendido;
//  - margem ALTA  = margem unitária (R$) ≥ margem média ponderada pelo volume.
//  Estrela = alto volume + alta margem · Burro de carga = alto volume + baixa
//  margem · Puzzle = baixo volume + alta margem · Cão = baixo volume + baixa margem.
// Só entram itens com venda no período.
// ---------------------------------------------------------------------------
export function classifyMenu(items: MenuItemStat[]): {
  items: MatrixItem[];
  popularityThresholdUnits: number;
  marginThresholdValue: number;
} {
  const sold = items.filter((i) => i.units > 0);
  if (sold.length === 0) return { items: [], popularityThresholdUnits: 0, marginThresholdValue: 0 };
  const totalUnits = sold.reduce((a, i) => a + i.units, 0);
  const popularityThresholdUnits = r2(0.7 * (totalUnits / sold.length));
  const marginThresholdValue = r2(sold.reduce((a, i) => a + i.unitMargin * i.units, 0) / totalUnits);

  const classify = (i: MenuItemStat): MatrixClass => {
    const highVolume = i.units >= popularityThresholdUnits;
    const highMargin = i.unitMargin >= marginThresholdValue;
    if (highVolume && highMargin) return 'estrela';
    if (highVolume) return 'burro_de_carga';
    if (highMargin) return 'puzzle';
    return 'cao';
  };
  return {
    items: sold.map((i) => ({ ...i, classification: classify(i) })),
    popularityThresholdUnits,
    marginThresholdValue,
  };
}
