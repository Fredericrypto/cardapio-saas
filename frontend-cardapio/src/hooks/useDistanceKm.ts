import { useEffect, useState } from 'react';
import type { Location } from '../types';
import { haversineKm } from '../lib/locationRoute';

// Distancia (km) do aparelho ate a unidade. Usa a localizacao do navegador (a mesma
// permissao da tela de escolher unidade) e so consulta quando `enabled` e a unidade
// ainda nao traz `distanceKm`. Sem permissao/coordenadas devolve null (botao sem numero).
export function useDistanceKm(location: Location | null, enabled: boolean): number | null {
  const lat = location?.latitude ?? null;
  const lng = location?.longitude ?? null;
  const hasOwn = location?.distanceKm != null;
  const [km, setKm] = useState<number | null>(null);

  useEffect(() => {
    setKm(null);
    if (!enabled || hasOwn || lat == null || lng == null) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!cancelled) setKm(haversineKm(pos.coords.latitude, pos.coords.longitude, lat, lng));
      },
      () => {},
      { timeout: 20000, maximumAge: 300000 },
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, hasOwn, lat, lng]);

  return km;
}
