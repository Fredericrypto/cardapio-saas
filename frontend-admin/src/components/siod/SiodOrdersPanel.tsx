import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchSiodOrders } from '../../lib/admin-api';
import type { AnalyticsPeriod } from '../../types/analytics';
import type { SiodOrdersPage, SiodRecordClass } from '../../types/siod';
import {
  CONFIDENCE_LABEL,
  NO_VALUE,
  PAYMENT_LABEL,
  PROVIDER_LABEL,
  RECORD_CLASS_LABEL,
  RECORD_CLASS_TONE,
  apiErrorMessage,
  dateTime,
  isAbort,
  minutes,
  shortOrderId,
  signedMinutes,
} from './format';

const PAGE_SIZE = 25;

interface Props {
  period: AnalyticsPeriod;
  from: string;
  to: string;
  locationId: string;
  // Muda quando o usuário clica em "Atualizar" no topo da página.
  refreshKey: number;
}

const selectCls = 'border border-gray-200 rounded-lg px-2.5 py-2 text-xs outline-none bg-white';

export function SiodOrdersPanel({ period, from, to, locationId, refreshKey }: Props) {
  const [recordClass, setRecordClass] = useState<SiodRecordClass | ''>('');
  const [confidence, setConfidence] = useState('');
  const [provider, setProvider] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SiodOrdersPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const customReady = period !== 'custom' || (Boolean(from) && Boolean(to) && from <= to);

  // Qualquer filtro novo volta para a primeira página.
  useEffect(() => {
    setPage(1);
  }, [period, from, to, locationId, recordClass, confidence, provider]);

  const load = useCallback(async () => {
    if (!customReady) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchSiodOrders(
        {
          period,
          from: period === 'custom' ? from : undefined,
          to: period === 'custom' ? to : undefined,
          locationId: locationId || undefined,
          recordClass: recordClass || undefined,
          confidence: confidence || undefined,
          provider: provider || undefined,
          page,
          pageSize: PAGE_SIZE,
        },
        controller.signal,
      );
      if (!controller.signal.aborted) setData(result);
    } catch (err) {
      if (controller.signal.aborted || isAbort(err)) return;
      setError(apiErrorMessage(err, 'Não foi possível carregar os pedidos.'));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [period, from, to, locationId, recordClass, confidence, provider, page, customReady]);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load, refreshKey]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={recordClass} onChange={(e) => setRecordClass(e.target.value as SiodRecordClass | '')} className={selectCls} aria-label="Situação">
          <option value="">Todas as situações</option>
          {(Object.keys(RECORD_CLASS_LABEL) as SiodRecordClass[]).map((c) => (
            <option key={c} value={c}>
              {RECORD_CLASS_LABEL[c]}
            </option>
          ))}
        </select>
        <select value={confidence} onChange={(e) => setConfidence(e.target.value)} className={selectCls} aria-label="Confiança">
          <option value="">Qualquer confiança</option>
          <option value="HIGH">Confiança alta</option>
          <option value="MEDIUM">Confiança média</option>
          <option value="LOW">Confiança baixa</option>
        </select>
        <select value={provider} onChange={(e) => setProvider(e.target.value)} className={selectCls} aria-label="Origem da rota">
          <option value="">Qualquer rota</option>
          <option value="OSRM">Rota real</option>
          <option value="HAVERSINE">Linha reta</option>
        </select>
        {data && <span className="text-xs text-gray-400">{data.total.toLocaleString('pt-BR')} pedido(s)</span>}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>}

      <div className={`bg-white border border-gray-100 rounded-2xl overflow-x-auto transition-opacity ${loading ? 'opacity-60' : ''}`}>
        <table className="w-full text-xs min-w-[860px]">
          <thead>
            <tr className="text-left text-gray-400">
              <th className="font-semibold p-3">Pedido</th>
              <th className="font-semibold p-3">Data</th>
              <th className="font-semibold p-3">Situação</th>
              <th className="font-semibold p-3 text-right">Prometido</th>
              <th className="font-semibold p-3 text-right">Real</th>
              <th className="font-semibold p-3 text-right">Diferença</th>
              <th className="font-semibold p-3">Confiança</th>
              <th className="font-semibold p-3">Rota</th>
              <th className="font-semibold p-3 text-right">Fila</th>
              <th className="font-semibold p-3">Pagamento</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((o) => (
              <tr key={o.orderId} className="border-t border-gray-50 text-gray-700">
                <td className="p-3">
                  <span className="font-semibold text-gray-900">#{shortOrderId(o.orderId)}</span>
                  {o.customerName && <span className="block text-[11px] text-gray-400 truncate max-w-[140px]">{o.customerName}</span>}
                </td>
                <td className="p-3 whitespace-nowrap">{dateTime(o.createdAt)}</td>
                <td className="p-3">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${RECORD_CLASS_TONE[o.recordClass]}`}>{RECORD_CLASS_LABEL[o.recordClass]}</span>
                </td>
                <td className="p-3 text-right whitespace-nowrap">
                  {o.estimatedTotalMinutes} min
                  <span className="block text-[11px] text-gray-400">
                    faixa {o.estimatedMinMinutes}–{o.estimatedMaxMinutes}
                  </span>
                </td>
                <td className="p-3 text-right whitespace-nowrap">{minutes(o.actualTotalMinutes)}</td>
                <td className={`p-3 text-right whitespace-nowrap font-semibold ${o.errorMinutes == null ? 'text-gray-400' : o.errorMinutes > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{signedMinutes(o.errorMinutes)}</td>
                <td className="p-3">{CONFIDENCE_LABEL[o.confidence] ?? o.confidence}</td>
                <td className="p-3 whitespace-nowrap">
                  {PROVIDER_LABEL[o.routeProvider] ?? o.routeProvider}
                  <span className="block text-[11px] text-gray-400">{o.distanceKm.toLocaleString('pt-BR')} km</span>
                </td>
                <td className="p-3 text-right">
                  {o.activeOrdersAtCreation}
                  {o.peakMultiplier > 1 && <span className="block text-[11px] text-amber-600">pico ×{o.peakMultiplier.toLocaleString('pt-BR')}</span>}
                </td>
                <td className="p-3">{o.paymentMethod ? (PAYMENT_LABEL[o.paymentMethod] ?? o.paymentMethod) : NO_VALUE}</td>
              </tr>
            ))}
            {data && data.items.length === 0 && (
              <tr>
                <td colSpan={10} className="p-6 text-center text-gray-400">
                  Nenhum pedido de entrega com esses filtros neste período.
                </td>
              </tr>
            )}
            {!data && loading && (
              <tr>
                <td colSpan={10} className="p-6 text-center text-gray-400">
                  Carregando pedidos...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          Página {page} de {totalPages}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            aria-label="Página anterior"
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            aria-label="Próxima página"
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
