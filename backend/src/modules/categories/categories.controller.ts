import {
  Controller,
  Get,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CategoriesService } from './categories.service';
import { SetCategoryActiveDto } from './dto/set-category-active.dto';

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

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.categoriesService.findOne(tenantId, id);
  }

  // Só pra limpar categoria legada (sem chave do catálogo).
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    await this.categoriesService.removeLegacy(tenantId, id);
    return { success: true };
  }
}
