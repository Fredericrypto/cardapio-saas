import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import type { Analytics, MatrixClass, MatrixItem, MenuItemStat } from '../../types/analytics';
import { brl, int, pct } from './format';
import { useChartPalette } from '../../hooks/useTheme';

// Definições formais dos quadrantes (V̄ = volume médio, M̄ = margem média).
export const CLASS_META: Record<MatrixClass, { label: string; color: string; hint: string }> = {
  estrela: { label: 'Estrelas', color: '#16a34a', hint: 'Alto volume e alta margem — proteja e destaque.' },
  burro_de_carga: { label: 'Burros de carga', color: '#d97706', hint: 'Alto volume e baixa margem — reajuste o preço ou reduza o custo.' },
  puzzle: { label: 'Puzzles', color: '#2563eb', hint: 'Baixo volume e alta margem — dê mais visibilidade no cardápio.' },
  cao: { label: 'Cães', color: '#dc2626', hint: 'Baixo volume e baixa margem — candidatos a sair do cardápio.' },
};
const ORDER: MatrixClass[] = ['estrela', 'burro_de_carga', 'puzzle', 'cao'];

// Barras proporcionais ao MAIOR volume DENTRO DA PRÓPRIA LISTA (cada ranking
// tem a sua escala — a barra dos menos vendidos nunca usa a escala do Top 10).
function Ranking({ title, items, empty, testId }: { title: string; items: MenuItemStat[]; empty: string; testId: string }) {
  const max = Math.max(0, ...items.map((i) => i.units));
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4" data-testid={testId}>
      <h3 className="text-sm font-bold text-gray-800 mb-3">{title}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-gray-400">{empty}</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {items.map((i, idx) => (
            <li key={i.productId} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-gray-700 truncate">
                  <span className="text-gray-400 mr-1.5">{idx + 1}.</span>
                  {i.name}
                </span>
                <span className="font-semibold text-gray-800 shrink-0">
                  {int(i.units)} un · {brl(i.revenue)}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div
                  data-testid="rank-bar"
                  data-units={i.units}
                  className="h-full rounded-full bg-zinc-800"
                  style={{ width: `${max > 0 ? (i.units / max) * 100 : 0}%` }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// Ponto do gráfico: carrega o nome, o volume e a margem EXATOS do item, de
// modo que o que está desenhado é auditável direto no DOM.
interface DotProps {
  cx?: number;
  cy?: number;
  payload?: MatrixItem;
}
function Dot({ cx, cy, payload }: DotProps) {
  const palette = useChartPalette();
  if (cx == null || cy == null || !payload) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={6}
      fill={CLASS_META[payload.classification].color}
      fillOpacity={0.9}
      stroke={palette.surface}
      strokeWidth={1.5}
      data-testid="matrix-dot"
      data-name={payload.name}
      data-units={payload.units}
      data-margin={payload.unitMargin}
      data-class={payload.classification}
    />
  );
}

const niceCeil = (v: number): number => {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  // Passos finos: a escala não "incha" (ex.: 56 vira 60, não 100) e os pontos ficam bem distribuídos.
  const step = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((x) => n <= x) ?? 10;
  return step * pow;
};

export function MenuEngineering({ data }: { data: Analytics }) {
  const palette = useChartPalette();
  const { matrix } = data;
  // UMA lista: os pontos do gráfico, os cards dos quadrantes e a contagem usam
  // exatamente os mesmos `matrix.items` (x = unidades, y = margem unitária).
  const items = matrix.items;
  const counts = ORDER.map((c) => ({ c, list: items.filter((i) => i.classification === c) }));

  // Domínios explícitos: nada de escala automática "escondendo" o valor real.
  const xMax = niceCeil(Math.max(matrix.averageVolume, ...items.map((i) => i.units)) * 1.1);
  const yVals = items.map((i) => i.unitMargin);
  const yMaxRaw = Math.max(matrix.averageMargin, ...yVals);
  const yMinRaw = Math.min(0, matrix.averageMargin, ...yVals);
  const yMax = niceCeil(Math.max(yMaxRaw, 0.01) * 1.12);
  const yMin = yMinRaw < 0 ? -niceCeil(Math.abs(yMinRaw) * 1.12) : 0;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-bold text-gray-800">Engenharia de cardápio</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Ranking testId="rank-top" title="Top 10 mais vendidos" items={data.topProducts} empty="Sem vendas no período." />
        <Ranking
          testId="rank-bottom"
          title="10 menos vendidos"
          items={data.bottomProducts}
          empty="Todos os itens do cardápio já estão no Top 10 — não há itens fora do ranking."
        />
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-4" data-testid="matrix-card">
        <h3 className="text-sm font-bold text-gray-800">Matriz do cardápio (2×2)</h3>
        <p className="text-xs text-gray-400 mb-3" data-testid="matrix-thresholds">
          Volume médio (V̄) = {matrix.averageVolume.toLocaleString('pt-BR')} un (unidades vendidas ÷ itens com venda) · Margem média (M̄) ={' '}
          {brl(matrix.averageMargin)} por unidade (lucro de cardápio ÷ unidades vendidas). Itens sem custo cadastrado usam o CMV estimado.
        </p>
        {items.length === 0 ? (
          <p className="text-xs text-gray-400">Sem vendas no período para classificar.</p>
        ) : (
          <>
            <div className="h-72" data-testid="matrix-chart">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} />
                  <XAxis
                    type="number"
                    dataKey="units"
                    name="Unidades"
                    domain={[0, xMax]}
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: palette.tick }}
                    label={{ value: 'Volume (unidades)', position: 'insideBottom', offset: -6, fontSize: 11, fill: palette.tick }}
                  />
                  <YAxis
                    type="number"
                    dataKey="unitMargin"
                    name="Margem"
                    domain={[yMin, yMax]}
                    tick={{ fontSize: 11, fill: palette.tick }}
                    width={86}
                    tickFormatter={(v: number) => brl(v)}
                  />
                  <ReferenceLine x={matrix.averageVolume} stroke={palette.tick} strokeDasharray="4 4" />
                  <ReferenceLine y={matrix.averageMargin} stroke={palette.tick} strokeDasharray="4 4" />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ payload }) => {
                      const p = payload?.[0]?.payload as MatrixItem | undefined;
                      if (!p) return null;
                      return (
                        <div data-testid="matrix-tooltip" className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs shadow-sm">
                          <p className="font-semibold text-gray-900">{p.name}</p>
                          <p className="text-gray-500">{CLASS_META[p.classification].label}</p>
                          <p>
                            {int(p.units)} un · margem {brl(p.unitMargin)} ({pct(p.marginPercent)})
                          </p>
                          <p className="text-gray-400">Custo {p.costSource}</p>
                        </div>
                      );
                    }}
                  />
                  {/* x = unidades, y = margem unitária: os campos do próprio item. */}
                  <Scatter data={items} shape={(props: unknown) => <Dot {...(props as DotProps)} />} isAnimationActive={false} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mt-3">
              {counts.map(({ c, list }) => (
                <div key={c} className="rounded-xl border border-gray-100 p-3" data-testid={`quadrant-${c}`}>
                  <p className="text-xs font-bold flex items-center gap-1.5" style={{ color: CLASS_META[c].color }}>
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CLASS_META[c].color }} />
                    {CLASS_META[c].label} · {list.length}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1 leading-snug">{CLASS_META[c].hint}</p>
                  <p className="text-[11px] text-gray-400 mt-1 truncate">{list.slice(0, 3).map((i) => i.name).join(', ') || '—'}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
