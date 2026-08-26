import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface StructuredAddressInput {
  addressNumber?: string;
  street: string;
  neighborhood?: string; // não existe campo próprio na API estruturada — vira parte da consulta de cidade
  city: string;
  state: string;
  postcode?: string;
}

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  // true = o resultado veio com número de prédio (house_number) batendo
  // com o que foi pedido — ou seja, endereço exato, não só a rua/bairro.
  // false = achou alguma coisa (rua, bairro, cidade), mas não confirmou o
  // número exato — o pedido segue adiante, mas fica marcado pra
  // conferência manual em vez de confiar cegamente.
  precise: boolean;
}

const LOCATIONIQ_STRUCTURED_URL = 'https://us1.locationiq.com/v1/search/structured';
const LOCATIONIQ_FREE_TEXT_URL = 'https://us1.locationiq.com/v1/search';
const REQUEST_TIMEOUT_MS = 8000;

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);

  constructor(private readonly configService: ConfigService) {}

  // Geocodifica um endereço em texto único (usado pra localização fixa do
  // estabelecimento, definida uma vez em Configurações).
  async geocodeFreeText(query: string, proximity?: { latitude: number; longitude: number }): Promise<GeocodeResult> {
    const params = new URLSearchParams({
      q: query,
      countrycodes: 'br',
      format: 'json',
      addressdetails: '1',
      limit: '1',
    });
    this.applyProximity(params, proximity);
    return this.request(LOCATIONIQ_FREE_TEXT_URL, params, undefined);
  }

  // Geocodifica endereço estruturado (rua/número/cidade/estado/CEP
  // separados) — mais preciso que texto único porque cada campo é
  // interpretado isoladamente em vez de o geocoder ter que "adivinhar"
  // onde termina a rua e começa a cidade. É o método usado pro endereço
  // de entrega do cliente. `neighborhood` não tem campo próprio nessa
  // API, então é anexado à cidade pra ajudar a desambiguar.
  async geocodeStructured(
    input: StructuredAddressInput,
    proximity?: { latitude: number; longitude: number },
  ): Promise<GeocodeResult> {
    const city = input.neighborhood ? `${input.neighborhood}, ${input.city}` : input.city;

    const params = new URLSearchParams({
      street: input.addressNumber ? `${input.addressNumber} ${input.street}` : input.street,
      city,
      state: input.state,
      country: 'Brazil',
      format: 'json',
      addressdetails: '1',
      limit: '1',
    });
    if (input.postcode) params.set('postalcode', input.postcode);
    this.applyProximity(params, proximity);
    return this.request(LOCATIONIQ_STRUCTURED_URL, params, input.addressNumber);
  }

  // viewbox é só uma preferência de área (sem `bounded=1` o resultado pode
  // ainda vir de fora, o que é o comportamento certo aqui — não queremos
  // rejeitar um endereço válido só por estar fora de uma caixa arbitrária).
  private applyProximity(params: URLSearchParams, proximity?: { latitude: number; longitude: number }) {
    if (!proximity) return;
    const margin = 0.5; // graus (~55km) — só uma preferência, não um limite rígido
    const { latitude, longitude } = proximity;
    params.set(
      'viewbox',
      `${longitude - margin},${latitude - margin},${longitude + margin},${latitude + margin}`,
    );
  }

  private async request(
    url: string,
    params: URLSearchParams,
    expectedAddressNumber?: string,
  ): Promise<GeocodeResult> {
    const accessToken = this.configService.get<string>('LOCATIONIQ_ACCESS_TOKEN');
    if (!accessToken) {
      // Erro claro e específico — evita um 500 genérico quando o admin
      // simplesmente ainda não configurou a integração.
      throw new ServiceUnavailableException(
        'A integração de geolocalização (LocationIQ) não está configurada no servidor.',
      );
    }
    params.set('key', accessToken);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(`${url}?${params.toString()}`, {
        signal: controller.signal,
      });
    } catch (err) {
      this.logger.error(`Falha ao chamar a LocationIQ Geocoding API: ${err}`);
      throw new ServiceUnavailableException(
        'Não foi possível verificar o endereço agora. Tente novamente em instantes.',
      );
    } finally {
      clearTimeout(timeout);
    }

    // A LocationIQ responde 404 quando não encontra nada (não é erro de
    // infraestrutura, é "endereço não localizado" — tratamos diferente
    // dos outros códigos de erro).
    if (response.status === 404) {
      throw new BadRequestException(
        'Não conseguimos localizar esse endereço. Confira se está correto e completo.',
      );
    }
    if (!response.ok) {
      this.logger.error(`LocationIQ retornou status ${response.status}: ${await response.text()}`);
      throw new ServiceUnavailableException(
        'Não foi possível verificar o endereço agora. Tente novamente em instantes.',
      );
    }

    const data = await response.json();
    const feature = Array.isArray(data) ? data[0] : null;
    if (!feature) {
      throw new BadRequestException(
        'Não conseguimos localizar esse endereço. Confira se está correto e completo.',
      );
    }

    const latitude = parseFloat(feature.lat);
    const longitude = parseFloat(feature.lon);
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      throw new BadRequestException(
        'Não conseguimos localizar esse endereço. Confira se está correto e completo.',
      );
    }

    // Precisão: consideramos exato quando o cliente informou um número e
    // a resposta confirma um house_number no detalhamento do endereço.
    // Sem número informado, tratamos como impreciso por padrão (é
    // impossível confirmar uma casa exata sem número).
    const returnedHouseNumber = feature.address?.house_number;
    const precise = Boolean(expectedAddressNumber) && Boolean(returnedHouseNumber);

    return {
      latitude,
      longitude,
      formattedAddress: this.buildFormattedAddress(feature),
      precise,
    };
  }

  // O campo `display_name` da LocationIQ vem cheio de hierarquia
  // administrativa irrelevante pro cupom fiscal (ex: "Região Geográfica
  // Imediata de Araranguá, Região Geográfica Intermediária de Criciúma,
  // Região Sul"). Reconstrói um endereço limpo a partir dos componentes
  // separados (`addressdetails=1`) — rua, número, bairro, cidade, estado,
  // CEP — caindo pro display_name só se os componentes vierem vazios.
  private buildFormattedAddress(feature: any): string {
    const addr = feature.address ?? {};
    const streetLine = [addr.road, addr.house_number].filter(Boolean).join(', ');

    const parts = [
      streetLine || addr.road,
      addr.suburb || addr.neighbourhood,
      addr.city || addr.town || addr.village,
      addr.state,
      addr.postcode,
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(', ') : feature.display_name ?? '';
  }
}
