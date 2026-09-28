import { Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Tenant, Location } from '../types';
import { getTodayHoursLabel } from '../lib/openingHours';
import { fetchReviewsSummary } from '../lib/customer-api';

// Peças do header compartilhadas entre o cardápio geral (MenuHeader) e o
// cardápio de mesa (TableMenuHeader) — pedido do Felipe (28/09): nota do
// restaurante e horário de funcionamento continuam visíveis MESMO depois
// do cliente escanear a mesa.

// Badge de nota — sempre aparece, mesmo com 0 avaliações. Busca só o
// resumo agregado (leve), sempre por LOJA (locationId) quando disponível.
function useReviewSummary(tenantId: string, locationId: string | undefined) {
  const [summary, setSummary] = useState<{ average: number; count: number } | null>(null);
  useEffect(() => {
    fetchReviewsSummary(tenantId, locationId)
      .then(setSummary)
      .catch(() => setSummary(null));
  }, [tenantId, locationId]);
  return summary;
}

// "Fecha em X min" — só existe quando falta menos de 1h; conta em minutos
// client-side a partir do valor recebido.
function useClosingSoonLabel(closingInMinutes: number | null | undefined): string | null {
  const [minutesLeft, setMinutesLeft] = useState(closingInMinutes ?? null);
  useEffect(() => {
    setMinutesLeft(closingInMinutes ?? null);
    if (closingInMinutes == null) return;
    const interval = setInterval(() => {
      setMinutesLeft((prev) => (prev != null ? Math.max(0, prev - 1) : prev));
    }, 60000);
    return () => clearInterval(interval);
  }, [closingInMinutes]);
  if (minutesLeft == null) return null;
  return `Fecha em ${minutesLeft} min`;
}

export function ReviewBadge({ tenant, location }: { tenant: Tenant; location: Location | null }) {
  const summary = useReviewSummary(tenant.id, location?.id);
  const navigate = useNavigate();
  if (!summary) return null;
  return (
    <button onClick={() => navigate(`/${tenant.slug}/avaliacoes`)} className="flex items-center gap-1 mt-1">
      <Star
        size={13}
        fill={summary.count > 0 ? '#F59E0B' : 'transparent'}
        className={summary.count > 0 ? 'text-amber-500' : 'text-gray-300'}
      />
      {summary.count > 0 && (
        <span className="text-xs font-semibold text-gray-700">{summary.average.toFixed(1)}</span>
      )}
      <span className="text-xs text-gray-400 underline">
        ({summary.count} {summary.count === 1 ? 'avaliação' : 'avaliações'})
      </span>
    </button>
  );
}

export function OpenStatusRow({ location }: { location: Location | null }) {
  const isOpenNow = location?.isOpenNow ?? true;
  const todayHoursLabel = getTodayHoursLabel(location?.openingHours ?? null);
  const closingSoonLabel = useClosingSoonLabel(location?.closingInMinutes);
  return (
    <div className="flex items-center justify-center gap-1.5 mt-2.5 flex-wrap">
      <span
        className={`text-[11px] font-bold px-2 py-0.5 rounded-full text-white ${
          isOpenNow ? 'bg-green-500' : 'bg-red-500'
        }`}
      >
        {isOpenNow ? 'Aberto' : 'Fechado'}
      </span>
      {todayHoursLabel && <span className="text-xs text-gray-400">{todayHoursLabel}</span>}
      {closingSoonLabel && <span className="text-xs font-bold text-red-500">{closingSoonLabel}</span>}
      {location?.distanceKm != null && (
        <span className="text-xs text-gray-400">• {location.distanceKm.toFixed(1)} km</span>
      )}
    </div>
  );
}
