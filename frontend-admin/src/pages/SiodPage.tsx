import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, Truck } from 'lucide-react';
import { fetchLocations, fetchSiodOverview } from '../lib/admin-api';
import type { AnalyticsPeriod } from '../types/analytics';
import type { Location } from '../types';
import type { SiodOverview } from '../types/siod';
import { PeriodSelector } from '../components/analytics/PeriodSelector';
import { SiodOverviewPanel } from '../components/siod/SiodOverviewPanel';
import { SiodOrdersPanel } from '../components/siod/SiodOrdersPanel';
import { SiodSettingsPanel } from '../components/siod/SiodSettingsPanel';
import { apiErrorMessage, isAbort } from '../components/siod/format';
import { usePermission } from '../hooks/usePermission';

type Tab = 'visao' | 'pedidos' | 'parametros';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'visao', label: 'Visão geral' },
  { id: 'pedidos', label: 'Pedidos' },
  { id: 'parametros', label: 'Parâmetros' },
];

// Aba "Entregas" (SIOD — Sistema de Inteligência Operacional de Delivery): compara
// o prazo que o app prometeu com o que realmente aconteceu e permite ajustar os
// parâmetros do cálculo. Ver = analytics:view; alterar parâmetros = settings:manage.
// Auto-atualiza a cada 60 s só nos períodos que incluem "agora".
export function SiodPage() {
  const canManage = usePermission('settings:manage');
  const [tab, setTab] = useState<Tab>('visao');
  const [period, setPeriod] = useState<AnalyticsPeriod>('semana');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [locationId, setLocationId] = useState('');
  const [locations, setLocations] = useState<Location[]>([]);
  const [data, setData] = useState<SiodOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
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
      const result = await fetchSiodOverview(
        { period, from: period === 'custom' ? from : undefined, to: period === 'custom' ? to : undefined, locationId: locationId || undefined },
        controller.signal,
      );
      if (!controller.signal.aborted) setData(result);
    } catch (err) {
      if (controller.signal.aborted || isAbort(err)) return;
      setError(apiErrorMessage(err, 'Não foi possível carregar as entregas.'));
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

  const refresh = (): void => {
    void load();
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="p-6 max-w-6xl flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-gray-900 flex items-center gap-2">
            <Truck size={20} />
            Entregas
          </h1>
          <p className="text-xs text-gray-400 mt-1">O que o app prometeu ao cliente x o que realmente aconteceu, e os ajustes do cálculo.</p>
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
            onClick={refresh}
            disabled={loading}
            aria-label="Atualizar"
            title="Atualizar agora"
            className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div role="tablist" className="flex gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-colors ${
              tab === t.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <PeriodSelector period={period} from={from} to={to} onPeriod={setPeriod} onFrom={setFrom} onTo={setTo} />
      {period === 'custom' && !customReady && <p className="text-xs text-gray-400">Escolha a data inicial e a final para ver o período.</p>}

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>}

      {tab === 'visao' && (
        <>
          {!data && loading && <p className="text-sm text-gray-400">Carregando entregas...</p>}
          {data && (
            <div className={`transition-opacity ${loading ? 'opacity-60' : ''}`}>
              <SiodOverviewPanel data={data} />
            </div>
          )}
        </>
      )}
      {tab === 'pedidos' && <SiodOrdersPanel period={period} from={from} to={to} locationId={locationId} refreshKey={refreshKey} />}
      {tab === 'parametros' && <SiodSettingsPanel canManage={canManage} overview={data} />}
    </div>
  );
}
