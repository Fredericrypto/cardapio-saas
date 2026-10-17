import { activeDateLocale } from '../i18n/languages';
import type { Location } from '../types';

// Link de rota do Google Maps até a unidade: abre o app do Maps no celular (ou o
// site no computador) já com o destino preenchido; a origem é a posição de quem abre.
// Usa as coordenadas quando existem; senão o endereço; sem nenhum dos dois, sem botão.
// Fonte única: usada pela tela de escolher unidade e pelo painel "Informações".
export function routeUrl(location: Location): string | null {
  const base = 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=';
  if (location.latitude != null && location.longitude != null) {
    return `${base}${location.latitude},${location.longitude}`;
  }
  if (location.address) return `${base}${encodeURIComponent(location.address)}`;
  return null;
}

// "850 m" abaixo de 1 km; a partir daí "1,2 km" / "1.2 km" no formato do idioma ativo.
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  const n = new Intl.NumberFormat(activeDateLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(km);
  return `${n} km`;
}

// Distancia "em linha reta" (haversine) em km. So para exibir/ordenar; nada critico.
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
