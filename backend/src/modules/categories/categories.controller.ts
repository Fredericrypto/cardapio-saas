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
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

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
  @RequirePermission('menu:manage')
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
  @RequirePermission('menu:manage')
  @Post('catalog-bulk')
  async activateMany(@CurrentTenant() tenantId: string, @Body() dto: ActivateManyDto) {
    return this.categoriesService.activateMany(tenantId, dto.keys);
  }

  // Categoria personalizada (sem chave do catálogo).
  @RequirePermission('menu:manage')
  @Post('custom')
  async createCustom(@CurrentTenant() tenantId: string, @Body() dto: CreateCustomCategoryDto) {
    return this.categoriesService.createCustom(tenantId, dto.name);
  }

  // Nova ordem do cardápio (ids na ordem desejada). Rota estática ANTES
  // das de `:id`.
  @RequirePermission('menu:manage')
  @Put('order')
  async reorder(@CurrentTenant() tenantId: string, @Body() dto: ReorderCategoriesDto) {
    return this.categoriesService.reorder(tenantId, dto.ids);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.categoriesService.findOne(tenantId, id);
  }

  @RequirePermission('menu:manage')
  @Patch(':id')
  async rename(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: RenameCategoryDto,
  ) {
    return this.categoriesService.renameCustom(tenantId, id, dto.name);
  }

  @RequirePermission('menu:manage')
  @Put(':id/active')
  async setActiveById(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: SetCategoryActiveDto,
  ) {
    return this.categoriesService.setActiveById(tenantId, id, dto.active);
  }

  // Exclui categoria PERSONALIZADA (vazia). As do catálogo só desativam.
  @RequirePermission('menu:manage')
  @Delete(':id')
  async remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    await this.categoriesService.removeCustom(tenantId, id);
    return { success: true };
  }
}
