import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { StorageService } from '../../common/services/storage.service';
import { CustomersAuthService } from '../customers/customers-auth.service';
import { PromotionsService } from './promotions.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';

@Controller('promotions')
export class PromotionsController {
  constructor(
    private readonly promotionsService: PromotionsService,
    private readonly storageService: StorageService,
    private readonly customersAuthService: CustomersAuthService,
  ) {}

  // Rota PÚBLICA: cardápio do cliente final — vira os cards de
  // promoção. Se vier um token de cliente válido desse tenant no
  // header, cada promoção com limite por cliente já volta marcada com
  // `alreadyUsedUp` (nunca exige login pra ver os cards, só pra saber
  // se JÁ usou uma promoção limitada).
  @Get('public/:tenantId')
  async findActiveForPublic(
    @Param('tenantId') tenantId: string,
    @Headers('authorization') authHeader?: string,
    @Query('locationId') locationId?: string,
  ) {
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const customer = token ? this.customersAuthService.verifyToken(tenantId, token) : null;
    return this.promotionsService.findActiveForPublic(tenantId, customer?.customerId ?? null, locationId ?? null);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async findAll(@CurrentTenant() tenantId: string) {
    return this.promotionsService.findAllForAdmin(tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/redemptions')
  async getRedemptions(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.promotionsService.getRedemptions(tenantId, id);
  }

  // Painel admin: uso agrupado por cliente (quantas vezes cada um já
  // usou, frente ao limite) — base pra decidir quem "resetar".
  @UseGuards(JwtAuthGuard)
  @Get(':id/customer-usage')
  async getCustomerUsage(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.promotionsService.getCustomerUsage(tenantId, id);
  }

  // Devolve o uso da promoção pra esse cliente específico, sem tocar em
  // nenhum pedido antigo — ver PromotionsService.resetCustomerUsage.
  @UseGuards(JwtAuthGuard)
  @Post(':id/customers/:customerId/reset-usage')
  async resetCustomerUsage(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Param('customerId') customerId: string,
  ) {
    await this.promotionsService.resetCustomerUsage(tenantId, id, customerId);
    return { success: true };
  }

  // "Resetar pra TODOS" — devolve o uso pra QUALQUER cliente de uma vez,
  // guardando quantos usaram até agora só como referência histórica —
  // ver PromotionsService.resetAllCustomersUsage.
  @UseGuards(JwtAuthGuard)
  @Post(':id/reset-usage')
  async resetAllCustomersUsage(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    await this.promotionsService.resetAllCustomersUsage(tenantId, id);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.promotionsService.findOne(tenantId, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@CurrentTenant() tenantId: string, @Body() dto: CreatePromotionDto) {
    return this.promotionsService.create(tenantId, dto);
  }

  // Upload do banner: mesmo padrão de ProductsController.uploadImage —
  // a promoção precisa já existir antes de receber a foto.
  @UseGuards(JwtAuthGuard)
  @Post(':id/image')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    await this.promotionsService.findOne(tenantId, id);
    const imageUrl = await this.storageService.uploadPromotionImage(tenantId, file);
    return this.promotionsService.setImage(tenantId, id, imageUrl);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePromotionDto,
  ) {
    return this.promotionsService.update(tenantId, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    await this.promotionsService.remove(tenantId, id);
    return { success: true };
  }
}
