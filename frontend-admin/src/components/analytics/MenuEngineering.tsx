import { Cell, CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import type { Analytics, MatrixClass, MenuItemStat } from '../../types/analytics';
import { brl, int, pct } from './format';

const CLASS_META: Record<MatrixClass, { label: string; color: string; hint: string }> = {
  estrela: { label: 'Estrelas', color: '#16a34a', hint: 'Alto volume e alta margem — proteja e destaque.' },
  burro_de_carga: { label: 'Burros de carga', color: '#d97706', hint: 'Alto volume e baixa margem — reajuste o preço ou reduza o custo.' },
  puzzle: { label: 'Puzzles', color: '#2563eb', hint: 'Alta margem e baixo volume — dê mais visibilidade no cardápio.' },
  cao: { label: 'Cães', color: '#dc2626', hint: 'Baixa margem e baixo volume — candidatos a sair do cardápio.' },
};
const ORDER: MatrixClass[] = ['estrela', 'burro_de_carga', 'puzzle', 'cao'];

function Ranking({ title, items }: { title: string; items: MenuItemStat[] }) {
  const max = Math.max(1, ...items.map((i) => i.units));
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4">
      <h3 className="text-sm font-bold text-gray-800 mb-3">{title}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-gray-400">Sem vendas no período.</p>
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
                <div className="h-full rounded-full bg-zinc-800" style={{ width: `${(i.units / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function MenuEngineering({ data }: { data: Analytics }) {
  const { matrix } = data;
  const points = matrix.items.map((i) => ({ ...i, x: i.units, y: i.unitMargin }));
  const counts = ORDER.map((c) => ({ c, n: matrix.items.filter((i) => i.classification === c).length }));

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-bold text-gray-800">Engenharia de cardápio</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Ranking title="Top 10 mais vendidos" items={data.topProducts} />
        <Ranking title="10 menos vendidos" items={data.bottomProducts} />
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-4">
        <h3 className="text-sm font-bold text-gray-800">Matriz do cardápio (2×2)</h3>
        <p className="text-xs text-gray-400 mb-3">
          Volume alto = a partir de {matrix.popularityThresholdUnits.toLocaleString('pt-BR')} un · margem alta = a partir de {brl(matrix.marginThresholdValue)} por unidade
          (média ponderada do cardápio). Itens sem custo cadastrado usam o CMV estimado.
        </p>
        {matrix.items.length === 0 ? (
          <p className="text-xs text-gray-400">Sem vendas no período para classificar.</p>
        ) : (
          <>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis type="number" dataKey="x" name="Unidades" tick={{ fontSize: 11, fill: '#9ca3af' }} label={{ value: 'Volume (unidades)', position: 'insideBottom', offset: -6, fontSize: 11, fill: '#9ca3af' }} />
                  <YAxis type="number" dataKey="y" name="Margem" tick={{ fontSize: 11, fill: '#9ca3af' }} width={54} tickFormatter={(v: number) => `R$${v}`} />
                  <ZAxis range={[70, 70]} />
                  <ReferenceLine x={matrix.popularityThresholdUnits} stroke="#9ca3af" strokeDasharray="4 4" />
                  <ReferenceLine y={matrix.marginThresholdValue} stroke="#9ca3af" strokeDasharray="4 4" />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ payload }) => {
                      const p = payload?.[0]?.payload as (MenuItemStat & { classification: MatrixClass }) | undefined;
                      if (!p) return null;
                      return (
                        <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs shadow-sm">
                          <p className="font-semibold text-gray-900">{p.name}</p>
                          <p className="text-gray-500">{CLASS_META[p.classification].label}</p>
                          <p>{int(p.units)} un · margem {brl(p.unitMargin)} ({pct(p.marginPercent)})</p>
                          <p className="text-gray-400">Custo {p.costSource}</p>
                        </div>
                      );
                    }}
                  />
                  <Scatter data={points}>
                    {points.map((p) => (
                      <Cell key={p.productId} fill={CLASS_META[p.classification].color} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mt-3">
              {counts.map(({ c, n }) => (
                <div key={c} className="rounded-xl border border-gray-100 p-3">
                  <p className="text-xs font-bold flex items-center gap-1.5" style={{ color: CLASS_META[c].color }}>
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CLASS_META[c].color }} />
                    {CLASS_META[c].label} · {n}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1 leading-snug">{CLASS_META[c].hint}</p>
                  <p className="text-[11px] text-gray-400 mt-1 truncate">
                    {matrix.items.filter((i) => i.classification === c).slice(0, 3).map((i) => i.name).join(', ') || '—'}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
