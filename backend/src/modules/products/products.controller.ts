import {
  BadRequestException,
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
  UploadedFiles,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { StorageService } from '../../common/services/storage.service';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { SetProductOptionsDto } from './dto/set-product-options.dto';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { MAX_PRODUCT_IMAGES, remainingSlots } from './product-images';
import { applyRevalidationHeaders } from '../tenant-cache/http-cache';

// Teto de leitura do multer por arquivo: um pouco acima dos 5 MB aceitos, para
// que a mensagem amigável do StorageService ("Imagem muito grande. Limite de
// 5MB.") apareça em vez do erro seco de payload do multer.
const MULTER_FILE_SIZE_CEILING_BYTES = 6 * 1024 * 1024;

@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly storageService: StorageService,
  ) {}

  // Rota PÚBLICA: cardápio do cliente final.
  @Get('public/:tenantId')
  async findAllForPublic(@Param('tenantId') tenantId: string, @Res({ passthrough: true }) res: Response) {
    // Cache por restaurante + ETag (304 quando o cardápio não mudou) — ver TenantCache.
    const { products, etag } = await this.productsService.findAllForPublicCached(tenantId);
    applyRevalidationHeaders(res, etag, 'public-menu', 'public');
    return products;
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

  @RequirePermission('menu:manage')
  @Post()
  async create(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateProductDto,
  ) {
    return this.productsService.create(tenantId, dto);
  }

  // Upload de VÁRIAS fotos de uma vez (galeria do item, até 5 no total). As
  // fotos novas entram no FIM da galeria, na ordem enviada; reordenar/remover é
  // um PATCH com `images`. Nada é gravado se a soma passar do limite.
  @RequirePermission('menu:manage')
  @Post(':id/images')
  @UseInterceptors(
    FilesInterceptor('files', MAX_PRODUCT_IMAGES, {
      limits: { files: MAX_PRODUCT_IMAGES, fileSize: MULTER_FILE_SIZE_CEILING_BYTES },
    }),
  )
  async uploadImages(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Envie ao menos uma foto.');
    }
    const product = await this.productsService.findOne(tenantId, id); // garante que é do tenant
    const room = remainingSlots(product.images.length);
    if (files.length > room) {
      throw new BadRequestException(
        room === 0
          ? `Este item já tem ${MAX_PRODUCT_IMAGES} fotos (o máximo). Remova uma para adicionar outra.`
          : `Limite de ${MAX_PRODUCT_IMAGES} fotos por item: só cabem mais ${room}.`,
      );
    }

    const urls = await this.storageService.uploadProductImages(tenantId, files);
    try {
      return await this.productsService.appendImages(tenantId, id, urls);
    } catch (error) {
      // Perdeu a corrida pelo limite (ou o produto sumiu): não deixa arquivo órfão.
      await this.storageService.discardUploads(urls);
      throw error;
    }
  }

  // Upload de UMA imagem (formato antigo): troca só a CAPA e mantém as demais
  // fotos da galeria. O painel novo usa POST :id/images.
  @RequirePermission('menu:manage')
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

  @RequirePermission('menu:manage')
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
  @RequirePermission('menu:manage')
  @Patch(':id/options')
  async setOptions(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: SetProductOptionsDto,
  ) {
    return this.productsService.setOptions(tenantId, id, dto);
  }

  @RequirePermission('menu:manage')
  @Delete(':id')
  async remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    await this.productsService.remove(tenantId, id);
    return { success: true };
  }
}
