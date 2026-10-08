import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Analytics } from '../../types/analytics';
import { brl } from './format';
import { useChartPalette } from '../../hooks/useTheme';

interface ChartRow {
  label: string;
  isForecast: boolean;
  revenueValue: number;
  profitValue: number;
  revenue: number | null;
  profit: number | null;
  revenueForecast: number | null;
  profitForecast: number | null;
}

// Tooltip: o lucro (real ou projetado) fica VERMELHO se < 0 e verde se >= 0.
function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartRow }> }) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  return (
    <div data-testid="chart-tooltip" className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs shadow-sm">
      <p className="font-semibold text-gray-900 mb-1">
        {row.label}
        {row.isForecast && <span className="ml-1.5 font-normal text-gray-400">(projeção)</span>}
      </p>
      <p className="text-gray-600">
        Receita líquida: <span className="font-semibold text-gray-900">{brl(row.revenueValue)}</span>
      </p>
      <p className="text-gray-600">
        Lucro bruto:{' '}
        <span data-testid="tooltip-profit" className={`font-semibold ${row.profitValue < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
          {brl(row.profitValue)}
        </span>
      </p>
    </div>
  );
}

const TREND_LABEL = { alta: 'tendência de alta', queda: 'tendência de queda', estavel: 'tendência estável' } as const;

export function RevenueChart({ data }: { data: Analytics }) {
  const palette = useChartPalette();
  const actual = data.series.filter((p) => !p.forecast);
  const lastActual = actual[actual.length - 1];
  const rows: ChartRow[] = data.series.map((p) => ({
    label: p.label,
    isForecast: Boolean(p.forecast),
    revenueValue: p.revenue,
    profitValue: p.profit,
    revenue: p.forecast ? null : p.revenue,
    profit: p.forecast ? null : p.profit,
    // A projeção nasce do último ponto real para a linha tracejada emendar.
    revenueForecast: p.forecast || p === lastActual ? p.revenue : null,
    profitForecast: p.forecast || p === lastActual ? p.profit : null,
  }));
  const f = data.forecast;

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-sm font-bold text-gray-800">Faturamento líquido e lucro ao longo do tempo</h2>
        {f && (
          <p className="text-xs text-gray-500">
            Projeção ({TREND_LABEL[f.trend]}): <span className="font-semibold text-gray-800">{brl(f.nextPeriodRevenue)}</span>{' '}
            de receita e <span className="font-semibold text-gray-800">{brl(f.nextPeriodProfit)}</span> de lucro nos próximos{' '}
            {f.horizon} {data.range.granularity === 'hour' ? 'horas' : data.range.granularity === 'day' ? 'dias' : 'meses'}
            {f.lowConfidence && <span className="text-amber-600"> · pouca base histórica, use com cautela</span>}
          </p>
        )}
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={palette.ink} stopOpacity={0.22} />
                <stop offset="100%" stopColor={palette.ink} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: palette.tick }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={18} />
            <YAxis tick={{ fontSize: 11, fill: palette.tick }} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="revenue" name="Receita líquida" stroke={palette.ink} strokeWidth={2} fill="url(#gRev)" connectNulls={false} />
            <Line type="monotone" dataKey="profit" name="Lucro bruto" stroke="#16a34a" strokeWidth={2} dot={false} connectNulls={false} />
            <Line type="monotone" dataKey="revenueForecast" name="Projeção de receita" stroke={palette.ink} strokeWidth={2} strokeDasharray="5 5" dot={false} legendType="plainline" />
            <Line type="monotone" dataKey="profitForecast" name="Projeção de lucro" stroke="#16a34a" strokeWidth={2} strokeDasharray="5 5" dot={false} legendType="plainline" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
