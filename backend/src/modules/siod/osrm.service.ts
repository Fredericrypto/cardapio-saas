import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  computeRoute,
  FetchLike,
  normalizeOsrmBaseUrl,
  normalizeOsrmTimeout,
} from './osrm.client';
import { GeoPoint, RouteResult } from './siod.types';

// Estimativa de rota para o SIOD. A URL do OSRM vem de OSRM_URL (API pública
// por padrão; trocar por um container próprio é só mudar a variável). Em
// qualquer falha cai no Haversine × 1,3 a 25 km/h — este método nunca lança.
@Injectable()
export class OSRMService {
  constructor(private readonly configService: ConfigService) {}

  async getRoute(origin: GeoPoint, destination: GeoPoint, fetchImpl?: FetchLike): Promise<RouteResult> {
    return computeRoute(origin, destination, {
      baseUrl: normalizeOsrmBaseUrl(this.configService.get<string>('OSRM_URL')),
      timeoutMs: normalizeOsrmTimeout(this.configService.get<string>('OSRM_TIMEOUT_MS')),
      fetchImpl,
    });
  }
}
