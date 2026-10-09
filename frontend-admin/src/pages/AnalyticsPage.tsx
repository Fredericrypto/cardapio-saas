import { useCallback, useEffect, useRef, useState } from 'react';
import { Calculator, RefreshCw, TrendingUp } from 'lucide-react';
import { fetchAnalytics, fetchLocations } from '../lib/admin-api';
import type { Analytics, AnalyticsPeriod } from '../types/analytics';
import type { Location } from '../types';
import { PeriodSelector } from '../components/analytics/PeriodSelector';
import { KpiCards } from '../components/analytics/KpiCards';
import { useOpenCalculator } from '../contexts/ManagerCalculatorContext';
import { payloadFromSummary } from '../lib/calculator/calculatorAnalytics';
import { RevenueChart } from '../components/analytics/RevenueChart';
import { MenuEngineering } from '../components/analytics/MenuEngineering';
import { SalesHeatmap } from '../components/analytics/SalesHeatmap';
import { ChannelDonut } from '../components/analytics/ChannelDonut';
import { ExportMenu } from '../components/analytics/ExportMenu';

// Aba "Análise": inteligência financeira e operacional para o dono. Tudo
// recalcula sozinho ao trocar período/loja (a tela anterior fica visível,
// esmaecida, até chegar o resultado novo — nada de piscar vazio). Auto-atualiza
// a cada 60 s só nos períodos que incluem "agora".
export function AnalyticsPage() {
  const openCalculator = useOpenCalculator();
  const [period, setPeriod] = useState<AnalyticsPeriod>('semana');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [locationId, setLocationId] = useState('');
  const [locations, setLocations] = useState<Location[]>([]);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetchLocations()
      .then(setLocations)
      .catch(() => undefined);
  }, []);

  const customReady = period !== 'custom' || (Boolean(from) && Boolean(to) && from <= to);

  const load = useCallback(async () => {
    if (!customReady) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAnalytics(
        { period, from: period === 'custom' ? from : undefined, to: period === 'custom' ? to : undefined, locationId: locationId || undefined },
        controller.signal,
      );
      if (!controller.signal.aborted) setData(result);
    } catch (err) {
      if (controller.signal.aborted || (err as { code?: string }).code === 'ERR_CANCELED') return;
      const message = (err as { response?: { data?: { message?: string | string[] } } }).response?.data?.message;
      setError(Array.isArray(message) ? message.join(' ') : (message ?? 'Não foi possível carregar a análise.'));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [period, from, to, locationId, customReady]);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  useEffect(() => {
    if (period === 'custom') return;
    const id = setInterval(() => void load(), 60_000);
    return () => clearInterval(id);
  }, [period, load]);

  return (
    <div className="p-6 max-w-6xl flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-gray-900 flex items-center gap-2">
            <TrendingUp size={20} />
            Análise
          </h1>
          <p className="text-xs text-gray-400 mt-1">Inteligência financeira e operacional do restaurante, em tempo real.</p>
        </div>
        <div className="flex items-center gap-2">
          {locations.length > 1 && (
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="border border-gray-200 rounded-lg px-2.5 py-2 text-xs outline-none bg-white"
              aria-label="Loja"
            >
              <option value="">Todas as lojas</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => void load()}
            disabled={loading}
            aria-label="Atualizar"
            title="Atualizar agora"
            className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <ExportMenu data={data} disabled={loading} />
          <button
            type="button"
            onClick={() => data && openCalculator(payloadFromSummary(data))}
            disabled={!data || loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            <Calculator size={14} strokeWidth={1.5} />
            Simular na Calculadora
          </button>
        </div>
      </div>

      <PeriodSelector period={period} from={from} to={to} onPeriod={setPeriod} onFrom={setFrom} onTo={setTo} />
      {period === 'custom' && !customReady && (
        <p className="text-xs text-gray-400">Escolha a data inicial e a final para ver o período.</p>
      )}

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>}

      {!data && loading && <p className="text-sm text-gray-400">Carregando análise...</p>}

      {data && (
        <div className={`flex flex-col gap-6 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <KpiCards data={data} />
          <RevenueChart data={data} />
          <MenuEngineering data={data} />
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
            <ChannelDonut data={data} />
            <SalesHeatmap data={data} />
          </div>
          <details className="text-xs text-gray-400">
            <summary className="cursor-pointer font-semibold text-gray-500">Como os números são calculados</summary>
            <ul className="list-disc pl-5 mt-2 flex flex-col gap-1">
              {data.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </div>
  );
}
