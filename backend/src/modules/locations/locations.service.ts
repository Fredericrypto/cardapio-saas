import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Location } from './location.entity';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { GeocodingService } from '../geocoding/geocoding.service';
import { computeIsOpenNow, getMinutesUntilClose } from '../../common/utils/schedule';

// Uma loja física (filial) de um tenant (marca) — mesma lógica do
// McDonald's: a marca é uma só, cada loja tem seu próprio
// endereço/horário/entrega. Tenant com uma loja só (o caso comum) tem
// exatamente UMA Location.
@Injectable()
export class LocationsService {
  constructor(
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
    private readonly geocodingService: GeocodingService,
  ) {}

  async findAllForTenant(tenantId: string): Promise<Location[]> {
    return this.locationRepo.find({ where: { tenantId }, order: { createdAt: 'ASC' } });
  }

  // Cardápio público (tela de escolha de loja) — inclui isOpenNow e
  // closingInMinutes computados, igual o tenant público já fazia antes.
  async findAllPublicForTenant(tenantId: string) {
    const locations = await this.locationRepo.find({
      where: { tenantId },
      order: { createdAt: 'ASC' },
    });
    return locations.map((location) => this.withComputedStatus(location));
  }

  async findOne(tenantId: string, id: string): Promise<Location> {
    const location = await this.locationRepo.findOne({ where: { id, tenantId } });
    if (!location) {
      throw new NotFoundException('Loja não encontrada.');
    }
    return location;
  }

  async findOnePublic(tenantId: string, id: string) {
    const location = await this.findOne(tenantId, id);
    return this.withComputedStatus(location);
  }

  async create(tenantId: string, dto: CreateLocationDto): Promise<Location> {
    const location = this.locationRepo.create({ tenantId, ...dto });
    return this.locationRepo.save(location);
  }

  async update(tenantId: string, id: string, dto: UpdateLocationDto): Promise<Location> {
    const location = await this.findOne(tenantId, id);
    Object.assign(location, dto);
    return this.locationRepo.save(location);
  }

  // Geocodifica e grava endereço + coordenadas juntos — nunca dessincronizados.
  async confirmAddress(tenantId: string, id: string, address: string): Promise<Location> {
    const location = await this.findOne(tenantId, id);
    const result = await this.geocodingService.geocodeFreeText(address);

    location.address = result.formattedAddress || address;
    location.latitude = result.latitude;
    location.longitude = result.longitude;

    return this.locationRepo.save(location);
  }

  // Nunca deixa o tenant ficar sem NENHUMA loja — pelo menos uma Location
  // sempre precisa existir (é o que resolve mesas/pedidos existentes).
  async remove(tenantId: string, id: string): Promise<void> {
    const all = await this.findAllForTenant(tenantId);
    if (all.length <= 1) {
      throw new BadRequestException(
        'Não é possível remover a única loja do estabelecimento.',
      );
    }
    await this.findOne(tenantId, id); // garante que pertence a esse tenant
    await this.locationRepo.softDelete(id);
  }

  private withComputedStatus(location: Location) {
    const isOpenNow = computeIsOpenNow(location.isOpen, location.openingHours);
    const minutesUntilClose = getMinutesUntilClose(isOpenNow, location.openingHours);
    return {
      ...location,
      isOpenNow,
      closingInMinutes:
        minutesUntilClose != null && minutesUntilClose <= 60 ? minutesUntilClose : null,
    };
  }
}
