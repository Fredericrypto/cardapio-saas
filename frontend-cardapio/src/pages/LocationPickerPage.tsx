import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MapPin, Navigation, Store, ChevronRight, Star } from 'lucide-react';
import { fetchLocations } from '../lib/menu-api';
import { fetchReviewsSummaryByLocation } from '../lib/customer-api';
import type { ReviewSummary } from '../lib/customer-api';
import { useSelectedLocation } from '../hooks/useSelectedLocation';
import { useTenant } from '../contexts/TenantContext';
import type { Location } from '../types';

// Mesma distância "em linha reta" usada no backend (haversine) — só pra
// ORDENAR a lista da mais perto pra mais longe, nada crítico o
// suficiente pra exigir precisão de servidor aqui.
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Tela de escolha de loja — mesma lógica do app do McDonald's: tenta
// pegar a localização do celular e já sugere a mais perto, mas sempre
// deixa escolher manualmente na lista (o GPS pode estar desligado, ou o
// cliente pode simplesmente preferir outra unidade).
export function LocationPickerPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const [locations, setLocations] = useState<Location[] | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'locating' | 'done' | 'denied'>('idle');
  const { selectLocation } = useSelectedLocation(tenant?.id);
  const [reviewSummaries, setReviewSummaries] = useState<Record<string, ReviewSummary>>({});

  useEffect(() => {
    if (!tenant) return;
    fetchLocations(tenant.id).then((locs) => {
      setLocations(locs);
      fetchReviewsSummaryByLocation(tenant.id)
        .then(setReviewSummaries)
        .catch(() => setReviewSummaries({}));
    });
  }, [tenant]);

  useEffect(() => {
    if (!locations || locations.length <= 1) return; // uma loja só não precisa de GPS
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    setGpsStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setLocations((prev) =>
          prev
            ? [...prev]
                .map((l) =>
                  l.latitude != null && l.longitude != null
                    ? { ...l, distanceKm: haversineKm(latitude, longitude, l.latitude, l.longitude) }
                    : l,
                )
                .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
            : prev,
        );
        setGpsStatus('done');
      },
      () => setGpsStatus('denied'),
      { timeout: 8000 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations === null]);

  function handleSelect(location: Location) {
    selectLocation(location);
    navigate(`/${slug}`);
  }

  if (!tenant || !locations) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto">
      <div className="px-5 pt-8 pb-5 text-center">
        {tenant.logoUrl ? (
          <img
            src={tenant.logoUrl}
            alt={tenant.name}
            className="w-16 h-16 rounded-2xl object-cover mx-auto mb-3"
          />
        ) : (
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-xl font-bold mx-auto mb-3"
            style={{ backgroundColor: tenant.primaryColor }}
          >
            {tenant.name.charAt(0).toUpperCase()}
          </div>
        )}
        <h1 className="font-display text-lg font-bold text-gray-900">{tenant.name}</h1>
        <p className="text-sm text-gray-400 mt-1">Escolha a loja mais perto de você</p>
      </div>

      {gpsStatus === 'locating' && (
        <p className="text-center text-xs text-gray-400 flex items-center justify-center gap-1.5 pb-3">
          <Navigation size={13} className="animate-pulse" />
          Buscando sua localização...
        </p>
      )}

      <div className="px-4 flex flex-col gap-2.5 pb-8">
        {locations.map((location) => (
          <button
            key={location.id}
            onClick={() => handleSelect(location)}
            className={`w-full bg-white rounded-2xl p-4 flex items-center gap-3 text-left ${
              !location.isOpenNow ? 'grayscale opacity-60' : ''
            }`}
          >
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${tenant.primaryColor}1A` }}
            >
              <Store size={18} style={{ color: tenant.primaryColor }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-sm">{location.name}</p>
              {location.address && (
                <p className="text-xs text-gray-400 truncate flex items-center gap-1 mt-0.5">
                  <MapPin size={11} className="shrink-0" />
                  {location.address}
                </p>
              )}
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <span
                  className={`text-[11px] font-semibold ${
                    location.isOpenNow ? 'text-green-600' : 'text-red-500'
                  }`}
                >
                  {location.isOpenNow ? 'Aberto agora' : 'Fechado'}
                </span>
                {location.distanceKm != null && (
                  <span className="text-[11px] text-gray-400">
                    · {location.distanceKm.toFixed(1)}km
                  </span>
                )}
                {reviewSummaries && (
                  <span className="text-[11px] text-gray-400 flex items-center gap-0.5">
                    ·{' '}
                    <Star
                      size={10}
                      fill={(reviewSummaries[location.id]?.count ?? 0) > 0 ? '#F59E0B' : 'transparent'}
                      className={
                        (reviewSummaries[location.id]?.count ?? 0) > 0
                          ? 'text-amber-500'
                          : 'text-gray-300'
                      }
                    />
                    {(reviewSummaries[location.id]?.count ?? 0) > 0
                      ? reviewSummaries[location.id].average.toFixed(1)
                      : '—'}{' '}
                    ({reviewSummaries[location.id]?.count ?? 0})
                  </span>
                )}
              </div>
            </div>
            <ChevronRight size={16} className="text-gray-300 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}
