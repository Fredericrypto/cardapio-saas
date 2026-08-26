import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { StorageService } from '../../common/services/storage.service';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { SetProductOptionsDto } from './dto/set-product-options.dto';

@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly storageService: StorageService,
  ) {}

  // Rota PÚBLICA: cardápio do cliente final.
  @Get('public/:tenantId')
  async findAllForPublic(@Param('tenantId') tenantId: string) {
    return this.productsService.findAllForPublic(tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async findAll(@CurrentTenant() tenantId: string) {
    return this.productsService.findAllForAdmin(tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.productsService.findOne(tenantId, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateProductDto,
  ) {
    return this.productsService.create(tenantId, dto);
  }

  // Upload de imagem separado da criação/edição do produto: o dono tira a
  // foto, recebe a URL, e só então salva o produto com essa URL no campo imageUrl.
  @UseGuards(JwtAuthGuard)
  @Post(':id/image')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    await this.productsService.findOne(tenantId, id); // garante que o produto é do tenant
    const imageUrl = await this.storageService.uploadProductImage(tenantId, file);
    return this.productsService.update(tenantId, id, { imageUrl });
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(tenantId, id, dto);
  }

  // Substitui todos os grupos de opções/adicionais desse produto de uma
  // vez (ver ProductsService.setOptions) — usado pela seção "Opções e
  // adicionais" na edição do produto no admin.
  @UseGuards(JwtAuthGuard)
  @Patch(':id/options')
  async setOptions(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: SetProductOptionsDto,
  ) {
    return this.productsService.setOptions(tenantId, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    await this.productsService.remove(tenantId, id);
    return { success: true };
  }
}
