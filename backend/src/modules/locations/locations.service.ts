import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Location } from './location.entity';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { GeocodingService } from '../geocoding/geocoding.service';
import {
  computeIsOpenNow,
  getMinutesUntilClose,
  isOpen24hNow,
  isWithinSchedule,
} from '../../common/utils/schedule';

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
    // Horário editado: o toggle passa a refletir o horário NA HORA (a menos que
    // o admin esteja mandando o toggle junto, aí vale o que ele escolheu).
    if (dto.openingHours !== undefined) {
      if (location.openingHours) {
        const within = isWithinSchedule(location.openingHours);
        if (dto.isOpen === undefined) location.isOpen = within;
        location.scheduleOpenState = within;
      } else {
        location.scheduleOpenState = null;
      }
    } else if (dto.isOpen !== undefined && location.openingHours && location.scheduleOpenState == null) {
      location.scheduleOpenState = isWithinSchedule(location.openingHours);
    }
    return this.locationRepo.save(location);
  }

  // A cada minuto: se o horário abriu/fechou, o toggle acompanha. Entre uma
  // transição e a próxima, o toggle manual do admin manda.
  @Cron(CronExpression.EVERY_MINUTE)
  async syncScheduleToggles(): Promise<void> {
    const locations = await this.locationRepo.find({ where: { openingHours: Not(IsNull()) } });
    for (const location of locations) {
      if (!location.openingHours) continue;
      const within = isWithinSchedule(location.openingHours);
      let changed = false;
      if (location.scheduleOpenState == null) {
        // Primeira passada: mantém o que o cliente já via (toggle E horário).
        const next = location.isOpen && within;
        if (next !== location.isOpen) {
          location.isOpen = next;
        }
        location.scheduleOpenState = within;
        changed = true;
      } else if (location.scheduleOpenState !== within) {
        location.isOpen = within;
        location.scheduleOpenState = within;
        changed = true;
      }
      if (changed) await this.locationRepo.save(location);
    }
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
    const isOpenNow = computeIsOpenNow(location.isOpen, location.openingHours, location.scheduleOpenState);
    const minutesUntilClose = getMinutesUntilClose(isOpenNow, location.openingHours);
    return {
      ...location,
      isOpenNow,
      // 24h: o cardápio nunca mostra "fecha em X min".
      isOpen24h: isOpenNow && isOpen24hNow(location.openingHours),
      closingInMinutes:
        minutesUntilClose != null && minutesUntilClose <= 60 ? minutesUntilClose : null,
    };
  }
}
