import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { LocationsService } from './locations.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { ConfirmLocationAddressDto } from './dto/confirm-location-address.dto';

@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  // Pública: tela de escolha de loja no cardápio do cliente, antes de
  // ver o menu (igual McDonald's — mostra todas as filiais pra escolher).
  @Get('public/:tenantId')
  async findAllPublic(@Param('tenantId') tenantId: string) {
    return this.locationsService.findAllPublicForTenant(tenantId);
  }

  @Get('public/:tenantId/:id')
  async findOnePublic(@Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.locationsService.findOnePublic(tenantId, id);
  }

  // Protegidas: painel admin gerenciando as lojas do próprio tenant.
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async findAllForMe(@CurrentTenant() tenantId: string) {
    return this.locationsService.findAllForTenant(tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me')
  async create(@CurrentTenant() tenantId: string, @Body() dto: CreateLocationDto) {
    return this.locationsService.create(tenantId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/:id')
  async update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.locationsService.update(tenantId, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/:id/location')
  async confirmAddress(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: ConfirmLocationAddressDto,
  ) {
    return this.locationsService.confirmAddress(tenantId, id, dto.address);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me/:id')
  async remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    await this.locationsService.remove(tenantId, id);
    return { removed: true };
  }
}
