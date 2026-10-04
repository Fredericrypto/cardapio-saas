import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { Analytics } from '../../types/analytics';
import { brl, int, pct } from './format';

const COLORS: Record<string, string> = { mesa: '#18181B', balcao: '#71717a', entrega: '#d4d4d8' };

export function ChannelDonut({ data }: { data: Analytics }) {
  const total = data.channels.reduce((a, c) => a + c.revenue, 0);
  const hasData = total > 0;
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4">
      <h2 className="text-sm font-bold text-gray-800 mb-3">Vendas por canal</h2>
      {!hasData ? (
        <p className="text-xs text-gray-400">Sem vendas no período.</p>
      ) : (
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="h-44 w-44 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.channels} dataKey="revenue" nameKey="label" innerRadius={48} outerRadius={78} paddingAngle={2} stroke="none">
                  {data.channels.map((c) => (
                    <Cell key={c.channel} fill={COLORS[c.channel]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => (typeof v === 'number' ? brl(v) : String(v ?? ''))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="flex-1 w-full flex flex-col gap-2">
            {data.channels.map((c) => (
              <li key={c.channel} className="flex items-center justify-between text-xs gap-3">
                <span className="flex items-center gap-2 text-gray-700">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[c.channel] }} />
                  {c.label}
                </span>
                <span className="text-gray-500">
                  {int(c.orders)} pedidos · <span className="font-semibold text-gray-800">{brl(c.revenue)}</span> ({pct((c.revenue / total) * 100)})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
