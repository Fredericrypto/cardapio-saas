import { Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Tenant, Location } from '../types';
import { formatNextOpening, getTodayHoursLabel } from '../lib/openingHours';
import { getStoreStatus } from '../lib/storeStatus';
import { fetchReviewsSummary } from '../lib/customer-api';
import { useMinuteClock } from '../hooks/useMinuteClock';
import { useI18n } from '../i18n/I18nContext';

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

export function ReviewBadge({ tenant, location }: { tenant: Tenant; location: Location | null }) {
  const summary = useReviewSummary(tenant.id, location?.id);
  const navigate = useNavigate();
  const { t } = useI18n();
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
        {summary.count === 1
          ? t('store.reviewsCountOne', { count: summary.count })
          : t('store.reviewsCount', { count: summary.count })}
      </span>
    </button>
  );
}

// Selo + horário da loja. Tudo vem de `getStoreStatus` recalculado na virada
// de cada minuto (fuso America/Sao_Paulo): quando a loja está FECHADA nunca
// aparece "Hoje: aberto 24h" nem "Fecha em X min" — só o selo "Fechado" e, em
// letra pequena e discreta, a previsão "Abre Hoje às 18:00" / "Abre
// Segunda-feira às 09:30" calculada pela matriz de horários.
export function OpenStatusRow({ location }: { location: Location | null }) {
  const { t } = useI18n();
  const now = useMinuteClock();
  const status = getStoreStatus(location, now);
  const todayHoursLabel = status.isOpen ? getTodayHoursLabel(location?.openingHours ?? null, t, now) : null;
  const nextOpeningLabel = status.isOpen ? null : formatNextOpening(status.nextOpening, t);
  return (
    <div className="flex flex-col items-center gap-0.5 mt-2.5">
      <div className="flex items-center justify-center gap-1.5 flex-wrap">
        <span
          data-testid="store-status-badge"
          className={`text-[11px] font-bold px-2 py-0.5 rounded-full text-white ${
            status.isOpen ? 'bg-green-500' : 'bg-red-600'
          }`}
        >
          {status.isOpen ? t('store.open') : t('store.closed')}
        </span>
        {todayHoursLabel && <span className="text-xs text-gray-400">{todayHoursLabel}</span>}
        {status.isOpen && status.closingInMinutes != null && !status.isOpen24h && (
          <span className="text-xs font-bold text-red-500">{t('store.closesIn', { minutes: status.closingInMinutes })}</span>
        )}
        {location?.distanceKm != null && (
          <span className="text-xs text-gray-400">• {location.distanceKm.toFixed(1)} km</span>
        )}
      </div>
      {nextOpeningLabel && (
        <span data-testid="store-next-opening" className="text-[11px] text-gray-400">
          {nextOpeningLabel}
        </span>
      )}
    </div>
  );
}
