// Distância em linha reta (não é rota real por ruas) entre dois pontos na
// superfície da Terra, usando a fórmula de Haversine. Suficiente pra
// estimar taxa de entrega num raio de bairro/cidade — rota real por ruas
// exigiria uma chamada extra de API de rotas (Directions/Distance Matrix),
// mais cara e mais lenta, e não foi pedida agora.
export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const EARTH_RADIUS_KM = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}
