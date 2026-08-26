import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Location } from '../locations/location.entity';
import { GeocodingService, StructuredAddressInput } from '../geocoding/geocoding.service';
import { haversineDistanceKm } from '../../common/utils/geo';
import { toCents, fromCents } from '../../common/utils/money';
import { DeliveryQuoteDto } from './dto/delivery-quote.dto';

export interface DeliveryQuoteResult {
  distanceKm: number;
  fee: number;
  formattedAddress: string;
  // false = revisar com o cliente antes de despachar — endereço não teve
  // confirmação de número exato (ver GeocodingService).
  precise: boolean;
}

@Injectable()
export class DeliveryService {
  constructor(
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
    private readonly geocodingService: GeocodingService,
  ) {}

  // Entrega é sempre em relação a uma LOJA específica (não a marca) —
  // cada filial tem seu próprio endereço/raio/taxa de entrega. Usado
  // tanto pela cotação (antes de confirmar o pedido) quanto pela criação
  // do pedido em si (que recalcula do zero, nunca confia num valor de
  // taxa vindo do cliente — ver OrdersService.create).
  async calculateQuote(locationId: string, input: StructuredAddressInput): Promise<DeliveryQuoteResult> {
    const location = await this.locationRepo.findOne({ where: { id: locationId } });
    if (!location) {
      throw new NotFoundException('Loja não encontrada.');
    }
    if (location.latitude === null || location.longitude === null) {
      throw new BadRequestException(
        'Esta loja ainda não configurou a localização para entregas. Peça para o restaurante confirmar o endereço em Configurações.',
      );
    }

    const geocode = await this.geocodingService.geocodeStructured(input, {
      latitude: location.latitude,
      longitude: location.longitude,
    });

    const distanceKm = haversineDistanceKm(
      location.latitude,
      location.longitude,
      geocode.latitude,
      geocode.longitude,
    );

    if (location.deliveryMaxRadiusKm !== null && distanceKm > location.deliveryMaxRadiusKm) {
      throw new BadRequestException(
        `Esse endereço fica a ${distanceKm.toFixed(1)}km, fora do raio de entrega (máximo ${location.deliveryMaxRadiusKm}km).`,
      );
    }

    const feePerKmCents = toCents(location.deliveryFeePerKm);
    const distanceFeeCents = Math.round(distanceKm * feePerKmCents);
    const totalFeeCents = toCents(location.deliveryFee) + distanceFeeCents;

    return {
      distanceKm: Math.round(distanceKm * 100) / 100,
      fee: fromCents(totalFeeCents),
      formattedAddress: geocode.formattedAddress,
      precise: geocode.precise,
    };
  }

  async quotePublic(locationId: string, dto: DeliveryQuoteDto): Promise<DeliveryQuoteResult> {
    return this.calculateQuote(locationId, dto);
  }
}
