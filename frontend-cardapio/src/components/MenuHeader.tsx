import { Bike, ChevronLeft, Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Tenant, Location } from '../types';
import { getTodayHoursLabel } from '../lib/openingHours';
import { RestaurantInfoPanel } from './RestaurantInfoPanel';
import { fetchReviewsSummary } from '../lib/customer-api';

interface MenuHeaderProps {
  tenant: Tenant;
  location: Location | null;
  onBack?: () => void;
}

// Badge de nota — sempre aparece, mesmo com 0 avaliações (deixa claro
// que ainda não tem nenhuma, em vez de sumir e parecer que a loja não
// tem sistema de avaliação). Busca só o resumo agregado (leve, uma soma
// no banco), nunca a lista completa de reviews aqui — a lista fica na
// página própria. Sempre por LOJA (locationId) quando disponível — cada
// unidade tem sua nota independente, nunca misturada com as outras.
function useReviewSummary(tenantId: string, locationId: string | undefined) {
  const [summary, setSummary] = useState<{ average: number; count: number } | null>(null);
  useEffect(() => {
    fetchReviewsSummary(tenantId, locationId)
      .then(setSummary)
      .catch(() => setSummary(null));
  }, [tenantId, locationId]);
  return summary;
}

// "Fecha em Xh" — sutil, ao lado do selo Aberto/Fechado. Só existe
// quando falta menos de 1h (closingInMinutes vem null do backend caso
// contrário). Conta em minutos client-side a partir do valor recebido,
// sem precisar reconsultar o backend a cada minuto.
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

// Header estilo delivery app de verdade (McDonald's/FoodyPro): banner
// grande no topo (foto de capa da loja), avatar/logo sobrepondo a foto,
// e um "sheet" branco flutuante logo abaixo com nome, status, e o
// cartão de infos de entrega — no lugar da faixa lisa de cor sólida que
// existia antes.
export function MenuHeader({ tenant, location, onBack }: MenuHeaderProps) {
  const deliveryAvailable = location?.latitude != null && location?.longitude != null;
  const todayHoursLabel = getTodayHoursLabel(location?.openingHours ?? null);
  const closingSoonLabel = useClosingSoonLabel(location?.closingInMinutes);
  const isOpenNow = location?.isOpenNow ?? true;
  const reviewSummary = useReviewSummary(tenant.id, location?.id);
  const navigate = useNavigate();

  return (
    <div className={`transition-[filter] ${!isOpenNow ? 'grayscale' : ''}`}>
      {/* Banner / capa */}
      <div
        className="relative h-40 w-full overflow-hidden"
        style={
          tenant.coverImageUrl
            ? undefined
            : {
                background: `linear-gradient(135deg, ${tenant.primaryColor}, ${tenant.secondaryColor})`,
              }
        }
      >
        {tenant.coverImageUrl && (
          <img
            src={tenant.coverImageUrl}
            alt={tenant.name}
            className="w-full h-full object-cover"
          />
        )}

        {onBack && (
          <button
            onClick={onBack}
            aria-label="Voltar"
            className="absolute top-3.5 left-3.5 w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-sm active:scale-90 transition-transform"
          >
            <ChevronLeft size={20} className="text-gray-700" />
          </button>
        )}
      </div>

      {/* Sheet branco flutuante */}
      <div className="relative -mt-6 rounded-t-3xl bg-white px-4 pt-3.5 pb-1 z-10">
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 -mt-10 rounded-2xl border-4 border-white shadow-md bg-white overflow-hidden shrink-0">
            {tenant.logoUrl ? (
              <img src={tenant.logoUrl} alt={tenant.name} className="w-full h-full object-cover" />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center text-white font-bold text-lg"
                style={{ backgroundColor: tenant.primaryColor }}
              >
                {tenant.name[0]?.toUpperCase()}
              </div>
            )}
          </div>

          <h1 className="font-display text-lg font-bold leading-tight text-gray-900 mt-1.5">
            {tenant.name}
          </h1>
          {location && <p className="text-xs text-gray-400 mt-0.5">{location.name}</p>}
          {reviewSummary && (
            <button
              onClick={() => navigate(`/${tenant.slug}/avaliacoes`)}
              className="flex items-center gap-1 mt-1"
            >
              <Star
                size={13}
                fill={reviewSummary.count > 0 ? '#F59E0B' : 'transparent'}
                className={reviewSummary.count > 0 ? 'text-amber-500' : 'text-gray-300'}
              />
              {reviewSummary.count > 0 && (
                <span className="text-xs font-semibold text-gray-700">
                  {reviewSummary.average.toFixed(1)}
                </span>
              )}
              <span className="text-xs text-gray-400 underline">
                ({reviewSummary.count} {reviewSummary.count === 1 ? 'avaliação' : 'avaliações'})
              </span>
            </button>
          )}
        </div>

        <div className="flex items-center justify-center gap-1.5 mt-2.5 flex-wrap">
          <span
            className={`text-[11px] font-bold px-2 py-0.5 rounded-full text-white ${
              isOpenNow ? 'bg-green-500' : 'bg-red-500'
            }`}
          >
            {isOpenNow ? 'Aberto' : 'Fechado'}
          </span>
          {todayHoursLabel && <span className="text-xs text-gray-400">{todayHoursLabel}</span>}
          {closingSoonLabel && (
            <span className="text-xs font-bold text-red-500">{closingSoonLabel}</span>
          )}
          {location?.distanceKm != null && (
            <span className="text-xs text-gray-400">
              • {location.distanceKm.toFixed(1)} km
            </span>
          )}
        </div>

        {deliveryAvailable && location && (
          <div className="mt-3 rounded-2xl bg-gray-50 border border-gray-100 px-3.5 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0"
                style={{ backgroundColor: tenant.primaryColor }}
              >
                <Bike size={15} />
              </span>
              <div>
                <p className="text-xs font-semibold text-gray-700">Aceita entrega</p>
                <p className="text-[11px] text-gray-400">
                  Taxa a partir de R$ {location.deliveryFee.toFixed(2).replace('.', ',')}
                </p>
              </div>
            </div>
            {location.minOrderValue > 0 && (
              <div className="text-right shrink-0 pl-2">
                <p className="text-[11px] text-gray-400">Pedido mínimo</p>
                <p className="text-xs font-bold text-gray-700">
                  R$ {location.minOrderValue.toFixed(2).replace('.', ',')}
                </p>
              </div>
            )}
          </div>
        )}

        <RestaurantInfoPanel tenant={tenant} location={location} />
      </div>
    </div>
  );
}
