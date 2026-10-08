import type { Analytics } from '../../types/analytics';
import { WEEKDAYS, brl } from './format';

// Densidade de pedidos por dia da semana × hora (horário de Brasília).
export function SalesHeatmap({ data }: { data: Analytics }) {
  const cells = new Map(data.heatmap.map((c) => [`${c.weekday}-${c.hour}`, c]));
  const max = Math.max(1, ...data.heatmap.map((c) => c.orders));
  const peak = data.heatmap.reduce<(typeof data.heatmap)[number] | null>((best, c) => (!best || c.orders > best.orders ? c : best), null);
  const hours = Array.from({ length: 24 }, (_, h) => h);

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-sm font-bold text-gray-800">Mapa de calor — pedidos por dia e hora</h2>
        {peak && (
          <p className="text-xs text-gray-500">
            Pico: <span className="font-semibold text-gray-800">{WEEKDAYS[peak.weekday]} às {String(peak.hour).padStart(2, '0')}h</span> ({peak.orders} pedidos)
          </p>
        )}
      </div>
      {data.heatmap.length === 0 ? (
        <p className="text-xs text-gray-400">Sem pedidos no período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-[3px] text-[10px] text-gray-400">
            <thead>
              <tr>
                <th />
                {hours.map((h) => (
                  <th key={h} className="font-normal w-6 min-w-6">{h % 3 === 0 ? `${h}h` : ''}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {WEEKDAYS.map((d, wd) => (
                <tr key={d}>
                  <td className="pr-2 text-right font-semibold text-gray-500">{d}</td>
                  {hours.map((h) => {
                    const c = cells.get(`${wd}-${h}`);
                    const intensity = c ? c.orders / max : 0;
                    return (
                      <td
                        key={h}
                        title={c ? `${d} ${String(h).padStart(2, '0')}h — ${c.orders} pedidos · ${brl(c.revenue)}` : `${d} ${String(h).padStart(2, '0')}h — sem pedidos`}
                        className="h-6 rounded-[4px]"
                        style={{ backgroundColor: c ? `rgba(24,24,27,${0.12 + intensity * 0.88})` : '#f4f4f5' }}
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
