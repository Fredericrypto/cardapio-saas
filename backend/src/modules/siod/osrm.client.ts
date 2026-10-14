// Cliente de rotas do SIOD: OSRM com fallback Haversine. Função pura de rede
// (sem NestJS) para poder ser testada com um fetch simulado. NUNCA lança: o
// checkout jamais pode falhar por causa de mapa — qualquer problema (timeout,
// HTTP != 2xx, JSON inválido, "NoRoute", rede fora) cai no Haversine.
import { haversineDistanceKm } from '../../common/utils/geo';
import { GeoPoint, HAVERSINE_SPEED_KMH, HAVERSINE_URBAN_FACTOR, RouteResult } from './siod.types';

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}
export type FetchLike = (url: string, init: { signal: AbortSignal }) => Promise<FetchResponseLike>;

export interface OsrmClientConfig {
  baseUrl: string;
  timeoutMs: number;
  fetchImpl?: FetchLike;
}

export const DEFAULT_OSRM_URL = 'https://router.project-osrm.org';
export const DEFAULT_OSRM_TIMEOUT_MS = 3000;

const round3 = (n: number) => Math.round(n * 1000) / 1000;

function validPoint(p: GeoPoint): boolean {
  return (
    Number.isFinite(p.latitude) &&
    Number.isFinite(p.longitude) &&
    Math.abs(p.latitude) <= 90 &&
    Math.abs(p.longitude) <= 180
  );
}

export function haversineFallback(origin: GeoPoint, destination: GeoPoint, reason: string): RouteResult {
  if (!validPoint(origin) || !validPoint(destination)) {
    return {
      provider: 'HAVERSINE',
      fallbackUsed: true,
      fallbackReason: 'invalid_coordinates',
      distanceKm: 0,
      durationSeconds: 0,
      straightLineKm: 0,
    };
  }
  const straight = haversineDistanceKm(origin.latitude, origin.longitude, destination.latitude, destination.longitude);
  const corrected = straight * HAVERSINE_URBAN_FACTOR;
  return {
    provider: 'HAVERSINE',
    fallbackUsed: true,
    fallbackReason: reason,
    distanceKm: round3(corrected),
    durationSeconds: Math.round((corrected / HAVERSINE_SPEED_KMH) * 3600),
    straightLineKm: round3(straight),
  };
}

// Normaliza a URL base vinda do ambiente. Inválida/ausente → padrão (API pública).
export function normalizeOsrmBaseUrl(raw: string | undefined | null): string {
  const value = (raw ?? '').trim();
  if (!value) return DEFAULT_OSRM_URL;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return DEFAULT_OSRM_URL;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return DEFAULT_OSRM_URL;
  }
}

export function normalizeOsrmTimeout(raw: string | undefined | null): number {
  const n = Number((raw ?? '').trim());
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_OSRM_TIMEOUT_MS;
  return Math.min(10000, Math.max(500, Math.round(n)));
}

interface OsrmRoute {
  distance: number;
  duration: number;
}

function parseOsrmBody(body: unknown): OsrmRoute | null {
  if (body === null || typeof body !== 'object') return null;
  const b = body as { code?: unknown; routes?: unknown };
  if (b.code !== 'Ok' || !Array.isArray(b.routes) || b.routes.length === 0) return null;
  const first: unknown = b.routes[0];
  if (first === null || typeof first !== 'object') return null;
  const r = first as { distance?: unknown; duration?: unknown };
  if (typeof r.distance !== 'number' || typeof r.duration !== 'number') return null;
  if (!Number.isFinite(r.distance) || !Number.isFinite(r.duration) || r.distance < 0 || r.duration < 0) return null;
  return { distance: r.distance, duration: r.duration };
}

export async function computeRoute(
  origin: GeoPoint,
  destination: GeoPoint,
  config: OsrmClientConfig,
): Promise<RouteResult> {
  if (!validPoint(origin) || !validPoint(destination)) return haversineFallback(origin, destination, 'invalid_coordinates');

  const fetchImpl: FetchLike | undefined =
    config.fetchImpl ?? (globalThis as unknown as { fetch?: FetchLike }).fetch;
  if (!fetchImpl) return haversineFallback(origin, destination, 'fetch_unavailable');

  const coords =
    `${origin.longitude.toFixed(7)},${origin.latitude.toFixed(7)};` +
    `${destination.longitude.toFixed(7)},${destination.latitude.toFixed(7)}`;
  const url = `${config.baseUrl}/route/v1/driving/${coords}?overview=false&alternatives=false&steps=false`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) return haversineFallback(origin, destination, `http_${res.status}`);
    const route = parseOsrmBody(await res.json());
    if (!route) return haversineFallback(origin, destination, 'invalid_response');
    const straight = haversineDistanceKm(
      origin.latitude,
      origin.longitude,
      destination.latitude,
      destination.longitude,
    );
    return {
      provider: 'OSRM',
      fallbackUsed: false,
      fallbackReason: null,
      distanceKm: round3(route.distance / 1000),
      durationSeconds: Math.round(route.duration),
      straightLineKm: round3(straight),
    };
  } catch (err) {
    const aborted = controller.signal.aborted || (err instanceof Error && err.name === 'AbortError');
    return haversineFallback(origin, destination, aborted ? 'timeout' : 'network_error');
  } finally {
    clearTimeout(timer);
  }
}
