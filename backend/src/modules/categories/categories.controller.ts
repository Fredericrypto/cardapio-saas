import {
  Controller,
  Get,
  Put,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CategoriesService } from './categories.service';
import { SetCategoryActiveDto } from './dto/set-category-active.dto';
import {
  ActivateManyDto,
  CreateCustomCategoryDto,
  RenameCategoryDto,
  ReorderCategoriesDto,
} from './dto/category-dtos';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  // Rota PÚBLICA: cardápio do cliente final (tenantId resolvido a partir
  // do slug no frontend — ver TenantsController.findPublicBySlug).
  @Get('public/:tenantId')
  async findAllForPublic(@Param('tenantId') tenantId: string) {
    return this.categoriesService.findAllForPublic(tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async findAll(@CurrentTenant() tenantId: string) {
    return this.categoriesService.findAllForAdmin(tenantId);
  }

  // Liga/desliga uma categoria do catálogo fixo (não existe mais criar
  // categoria com nome digitado).
  @UseGuards(JwtAuthGuard)
  @Put('catalog/:key')
  async setActive(
    @CurrentTenant() tenantId: string,
    @Param('key') key: string,
    @Body() dto: SetCategoryActiveDto,
  ) {
    return this.categoriesService.setActive(tenantId, key, dto.active);
  }

  // Ativa várias do catálogo de uma vez (preset de tipo / adicionar
  // selecionadas). Só adiciona, nunca desliga.
  @UseGuards(JwtAuthGuard)
  @Post('catalog-bulk')
  async activateMany(@CurrentTenant() tenantId: string, @Body() dto: ActivateManyDto) {
    return this.categoriesService.activateMany(tenantId, dto.keys);
  }

  // Categoria personalizada (sem chave do catálogo).
  @UseGuards(JwtAuthGuard)
  @Post('custom')
  async createCustom(@CurrentTenant() tenantId: string, @Body() dto: CreateCustomCategoryDto) {
    return this.categoriesService.createCustom(tenantId, dto.name);
  }

  // Nova ordem do cardápio (ids na ordem desejada). Rota estática ANTES
  // das de `:id`.
  @UseGuards(JwtAuthGuard)
  @Put('order')
  async reorder(@CurrentTenant() tenantId: string, @Body() dto: ReorderCategoriesDto) {
    return this.categoriesService.reorder(tenantId, dto.ids);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.categoriesService.findOne(tenantId, id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async rename(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: RenameCategoryDto,
  ) {
    return this.categoriesService.renameCustom(tenantId, id, dto.name);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id/active')
  async setActiveById(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: SetCategoryActiveDto,
  ) {
    return this.categoriesService.setActiveById(tenantId, id, dto.active);
  }

  // Exclui categoria PERSONALIZADA (vazia). As do catálogo só desativam.
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    await this.categoriesService.removeCustom(tenantId, id);
    return { success: true };
  }
}
