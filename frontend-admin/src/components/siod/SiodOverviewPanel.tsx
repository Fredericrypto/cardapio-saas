import type { ReactNode } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle } from 'lucide-react';
import type { SiodGroupRow, SiodOverview } from '../../types/siod';
import { useChartPalette } from '../../hooks/useTheme';
import { NO_VALUE, count, minutes, percent, signedMinutes } from './format';

function Card({ title, value, sub, hint }: { title: string; value: ReactNode; sub?: ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl p-4 flex flex-col gap-1 bg-white border border-gray-100 text-gray-900" title={hint}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{title}</p>
      <p className="font-display text-xl font-bold leading-tight">{value}</p>
      {sub && <div className="text-xs text-gray-500">{sub}</div>}
    </div>
  );
}

const SAMPLE_WARNING: Record<'none' | 'insufficient' | 'low', string> = {
  none: 'Ainda não há entregas com tempo medido neste período. Os números aparecem assim que os primeiros pedidos de entrega forem concluídos passando por "preparando" e "pronto".',
  insufficient: 'Poucas entregas medidas neste período (menos de 10). Os números ainda oscilam muito — use apenas como indício.',
  low: 'Amostra moderada (10 a 29 entregas medidas). As sugestões de ajuste só aparecem a partir de 30 pedidos comparáveis.',
};

function GroupTable({ title, rows, note }: { title: string; rows: SiodGroupRow[]; note?: string }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4 flex flex-col gap-2">
      <h3 className="text-sm font-bold text-gray-800">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-400">Sem pedidos no período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-400">
                <th className="font-semibold py-1 pr-3">Grupo</th>
                <th className="font-semibold py-1 pr-3 text-right">Pedidos</th>
                <th className="font-semibold py-1 pr-3 text-right">Medidos</th>
                <th className="font-semibold py-1 pr-3 text-right">Erro médio</th>
                <th className="font-semibold py-1 pr-3 text-right">Tendência</th>
                <th className="font-semibold py-1 text-right">Na janela</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-gray-50 text-gray-700">
                  <td className="py-1.5 pr-3 font-medium text-gray-900">{r.label}</td>
                  <td className="py-1.5 pr-3 text-right">{count(r.total)}</td>
                  <td className="py-1.5 pr-3 text-right">{count(r.valid)}</td>
                  <td className="py-1.5 pr-3 text-right">{minutes(r.maeMinutes)}</td>
                  <td className="py-1.5 pr-3 text-right">{signedMinutes(r.biasMinutes)}</td>
                  <td className="py-1.5 text-right">{percent(r.withinWindowPercent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {note && <p className="text-[11px] text-gray-400">{note}</p>}
    </div>
  );
}

function StageRow({ label, estimated, actual }: { label: string; estimated: number; actual: number }) {
  const diff = actual - estimated;
  return (
    <tr className="border-t border-gray-50 text-gray-700">
      <td className="py-1.5 pr-3 font-medium text-gray-900">{label}</td>
      <td className="py-1.5 pr-3 text-right">{minutes(estimated)}</td>
      <td className="py-1.5 pr-3 text-right">{minutes(actual)}</td>
      <td className="py-1.5 text-right">{signedMinutes(Math.round(diff * 100) / 100)}</td>
    </tr>
  );
}

export function SiodOverviewPanel({ data }: { data: SiodOverview }) {
  const palette = useChartPalette();
  const { counts, accuracy, components } = data;
  const warning = data.sampleQuality === 'ok' ? null : SAMPLE_WARNING[data.sampleQuality];
  const bias = accuracy?.biasMinutes ?? null;

  return (
    <div className="flex flex-col gap-6">
      {warning && (
        <div role="status" className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <p>{warning}</p>
        </div>
      )}

      <section className="flex flex-col gap-2.5">
        <h2 className="text-sm font-bold text-gray-800">Prometido x realizado</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card
            title="Dentro da janela prometida"
            value={percent(accuracy?.withinWindowPercent)}
            sub={accuracy ? `${percent(accuracy.earlyPercent)} chegou antes · ${percent(accuracy.latePercent)} atrasou` : 'Sem entregas medidas'}
            hint="Entregas cujo tempo real ficou entre o mínimo e o máximo da faixa mostrada ao cliente."
          />
          <Card
            title="Erro médio (absoluto)"
            value={minutes(accuracy?.maeMinutes)}
            sub={accuracy ? `mediana ${minutes(accuracy.medianAbsMinutes)} · 9 em 10 erram até ${minutes(accuracy.p90AbsMinutes)}` : undefined}
            hint="Quanto, em média, o tempo real se afastou do prometido (para mais ou para menos)."
          />
          <Card
            title="Tendência"
            value={signedMinutes(bias)}
            sub={
              bias === null
                ? undefined
                : bias > 0.5
                  ? 'O app promete menos do que a entrega leva (atrasa)'
                  : bias < -0.5
                    ? 'O app promete mais do que a entrega leva (folga)'
                    : 'Previsão equilibrada'
            }
            hint="Média de (tempo real − tempo prometido). Positivo = demorou mais que o prometido."
          />
          <Card
            title="Prometido → real (médio)"
            value={accuracy ? `${minutes(accuracy.avgEstimatedTotalMinutes)} → ${minutes(accuracy.avgActualTotalMinutes)}` : NO_VALUE}
            sub={accuracy ? `${count(accuracy.sample)} entregas medidas` : undefined}
          />
        </div>
      </section>

      <section className="flex flex-col gap-2.5">
        <h2 className="text-sm font-bold text-gray-800">Pedidos de entrega no período</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card title="Total" value={count(counts.total)} sub={`${count(counts.valid)} medidos`} />
          <Card title="Em andamento" value={count(counts.inProgress)} sub="ainda não entregues" />
          <Card
            title="Sem medição"
            value={count(counts.skipped + counts.invalid)}
            sub={`${count(counts.skipped)} concluídos sem etapas · ${count(counts.invalid)} com tempos inconsistentes`}
            hint="Concluídos sem passar por 'preparando' e 'pronto', ou com horários que se contradizem. Ficam fora da precisão."
          />
          <Card
            title="Rota por linha reta"
            value={percent(counts.fallbackRatePercent)}
            sub={`${count(counts.fallbackUsed)} de ${count(counts.total)} (serviço de rotas indisponível)`}
            hint="Quando o serviço de rotas não responde, a distância é estimada em linha reta e a confiança cai para Baixa."
          />
        </div>
        <p className="text-[11px] text-gray-400">{count(counts.cancelled)} pedido(s) cancelado(s) não entram na precisão.</p>
      </section>

      <div className="bg-white border border-gray-100 rounded-2xl p-4">
        <h2 className="text-sm font-bold text-gray-800 mb-3">Tempo prometido e real ao longo do tempo</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: palette.tick }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={18} />
              <YAxis tick={{ fontSize: 11, fill: palette.tick }} tickLine={false} axisLine={false} width={44} unit=" min" />
              <Tooltip formatter={(v) => (typeof v === 'number' ? minutes(v) : NO_VALUE)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="avgEstimatedMinutes" name="Prometido (médio)" stroke={palette.ink} strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls={false} />
              <Line type="monotone" dataKey="avgActualMinutes" name="Real (médio)" stroke="#16a34a" strokeWidth={2} dot={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[11px] text-gray-400 mt-2">Períodos sem entregas medidas ficam em branco (nada é inventado).</p>
      </div>

      {components && (
        <div className="bg-white border border-gray-100 rounded-2xl p-4 flex flex-col gap-2">
          <h2 className="text-sm font-bold text-gray-800">Onde o tempo foi gasto</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400">
                  <th className="font-semibold py-1 pr-3">Etapa</th>
                  <th className="font-semibold py-1 pr-3 text-right">Prometido</th>
                  <th className="font-semibold py-1 pr-3 text-right">Real</th>
                  <th className="font-semibold py-1 text-right">Diferença</th>
                </tr>
              </thead>
              <tbody>
                <StageRow label="Preparo (do pedido até ficar pronto, com a fila)" estimated={components.estimatedPrepMinutes} actual={components.actualPrepMinutes} />
                <StageRow label="Entrega (rota)" estimated={components.estimatedRouteMinutes} actual={components.actualRouteMinutes} />
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-gray-400">
            No preparo real, {minutes(components.actualWaitMinutes)} é a espera até iniciar o preparo e {minutes(components.actualKitchenMinutes)} é o tempo de cozinha (de “preparando” até “pronto”).
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <GroupTable title="Por confiança da estimativa" rows={data.byConfidence} note="Se a confiança Alta não tem erro menor que a Baixa, a estimativa não está bem calibrada." />
        <GroupTable title="Por origem da rota" rows={data.byProvider} />
        <GroupTable title="Por tamanho da fila no pedido" rows={data.byQueue} note="Erro positivo crescendo com a fila indica que o acréscimo por pedido na fila está baixo." />
        <GroupTable title="Pico" rows={data.byPeak} />
        <GroupTable title="Por forma de pagamento" rows={data.byPayment} note="No Pix, a espera pelo pagamento entra no tempo real total (do pedido até a entrega); por isso o erro do Pix tende a ser maior." />
      </div>
    </div>
  );
}
