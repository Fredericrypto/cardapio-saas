import { sanitizeTranslations } from '../../common/i18n/content-translations';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Product } from './product.entity';
import { ProductOption } from './product-option.entity';
import { ProductOptionValue } from './product-option-value.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { SetProductOptionsDto } from './dto/set-product-options.dto';
import {
  MAX_PRODUCT_IMAGES,
  replaceCover,
  resolveProductImages,
  sanitizeImageList,
} from './product-images';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // Garante `images` coerente com a capa (`imageUrl`) em TODA leitura: produto
  // antigo e backup anterior à galeria voltam com images = [] e image_url
  // preenchida — aqui isso vira [image_url]. Só em memória; o banco é
  // corrigido na próxima gravação do produto.
  private withGallery(product: Product): Product {
    product.images = resolveProductImages(product.images, product.imageUrl);
    return product;
  }

  // Valida e limpa uma galeria enviada de fora (a ordem enviada é preservada).
  private cleanGallery(raw: readonly string[]): string[] {
    const list = sanitizeImageList(raw);
    if (list.length > MAX_PRODUCT_IMAGES) {
      throw new BadRequestException(`Cada item aceita no máximo ${MAX_PRODUCT_IMAGES} fotos.`);
    }
    return list;
  }

  async findAllForAdmin(tenantId: string): Promise<Product[]> {
    const products = await this.productRepo.find({
      where: { tenantId },
      order: { displayOrder: 'ASC' },
      relations: { options: { values: true } },
    });
    return products.map((p) => this.withGallery(p));
  }

  // Cardápio público: devolve TODOS os produtos, inclusive os marcados como
  // indisponíveis — o app do cliente os mostra acinzentados (dá pra ler a
  // descrição, mas não adicionar). O pedido em si continua barrado no
  // OrdersService (só aceita isAvailable: true).
  // Opções/adicionais marcados como indisponíveis continuam sumindo daqui —
  // mas continuam existindo de verdade (só filtrados na resposta), pro
  // admin poder reativar sem recriar nada.
  async findAllForPublic(tenantId: string): Promise<Product[]> {
    const products = await this.productRepo.find({
      where: { tenantId },
      order: { displayOrder: 'ASC' },
      relations: { options: { values: true } },
    });
    for (const product of products) {
      for (const group of product.options ?? []) {
        group.values = group.values.filter((v) => v.isAvailable);
      }
    }
    // Custo é dado de gestão do dono — nunca sai no cardápio público.
    for (const product of products) product.costPrice = null;
    return products.map((p) => this.withGallery(p));
  }

  async findOne(tenantId: string, id: string): Promise<Product> {
    const product = await this.productRepo.findOne({
      where: { id, tenantId },
      relations: { options: { values: true } },
    });
    if (!product) {
      throw new NotFoundException('Produto não encontrado.');
    }
    return this.withGallery(product);
  }

  async create(tenantId: string, dto: CreateProductDto): Promise<Product> {
    const { images, imageUrl, ...rest } = dto;
    // `images` (galeria) tem precedência; `imageUrl` sozinho (formato antigo)
    // vira uma galeria de 1 foto. A capa é sempre images[0].
    const gallery = images !== undefined ? this.cleanGallery(images) : replaceCover([], imageUrl);
    const product = this.productRepo.create({
      ...rest,
      translations: sanitizeTranslations(dto.translations, ['name', 'description']),
      tenantId,
      images: gallery,
      imageUrl: gallery[0] ?? null,
    });
    return this.withGallery(await this.productRepo.save(product));
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateProductDto,
  ): Promise<Product> {
    const product = await this.findOne(tenantId, id);
    const { translations, images, imageUrl, ...rest } = dto;
    Object.assign(product, rest);
    // `undefined` = não mexer; objeto vazio/inválido = limpar (vira null).
    if (translations !== undefined) product.translations = sanitizeTranslations(translations, ['name', 'description']);

    if (images !== undefined) {
      // Galeria completa e ordenada (reordenar/remover no painel).
      product.images = this.cleanGallery(images);
    } else if (imageUrl !== undefined) {
      // Formato antigo: troca só a capa e mantém as outras fotos.
      product.images = replaceCover(product.images, imageUrl);
    }
    // Capa sempre em sincronia com a galeria (inclusive depois de reordenar).
    product.imageUrl = product.images[0] ?? null;

    return this.withGallery(await this.productRepo.save(product));
  }

  // ACRESCENTA fotos já enviadas ao storage ao FIM da galeria. Trava a linha do
  // produto (pessimistic_write) para que dois envios simultâneos não passem do
  // limite nem percam fotos um do outro (leitura-modificação-escrita seria
  // corrida). O CHECK do banco é a última barreira. Sem `relations` de
  // propósito: FOR UPDATE não combina com o lado anulável de um LEFT JOIN.
  async appendImages(tenantId: string, id: string, urls: readonly string[]): Promise<Product> {
    await this.dataSource.transaction(async (manager) => {
      const product = await manager.findOne(Product, {
        where: { id, tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!product) {
        throw new NotFoundException('Produto não encontrado.');
      }
      const current = resolveProductImages(product.images, product.imageUrl);
      const merged = sanitizeImageList([...current, ...urls]);
      if (merged.length > MAX_PRODUCT_IMAGES) {
        throw new BadRequestException(
          `Limite de ${MAX_PRODUCT_IMAGES} fotos por item. Este item já tem ${current.length}.`,
        );
      }
      await manager.update(Product, { id, tenantId }, { images: merged, imageUrl: merged[0] ?? null });
    });
    return this.findOne(tenantId, id);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    await this.findOne(tenantId, id);
    await this.productRepo.softDelete(id);
  }

  // Substitui TODOS os grupos de opções/adicionais de um produto de uma
  // vez (apaga os antigos, cria os novos) — mais simples que CRUD
  // granular, e casa com o formulário do admin (edita a lista inteira,
  // salva tudo junto). Pedidos já criados não são afetados: OrderItem
  // guarda um SNAPSHOT das opções escolhidas (nome + preço no momento),
  // nunca uma referência viva a ProductOption/ProductOptionValue.
  async setOptions(
    tenantId: string,
    productId: string,
    dto: SetProductOptionsDto,
  ): Promise<Product> {
    await this.findOne(tenantId, productId); // garante que o produto é desse tenant

    await this.dataSource.transaction(async (manager) => {
      const existingGroups = await manager.find(ProductOption, {
        where: { productId },
      });
      if (existingGroups.length > 0) {
        await manager.delete(ProductOptionValue, {
          optionId: In(existingGroups.map((g) => g.id)),
        });
        await manager.delete(ProductOption, { productId });
      }

      for (const groupDto of dto.groups) {
        if (groupDto.maxSelect < groupDto.minSelect) {
          throw new BadRequestException(
            `No grupo "${groupDto.name}", o máximo de escolhas não pode ser menor que o mínimo.`,
          );
        }
        if (groupDto.values.length === 0) {
          throw new BadRequestException(
            `O grupo "${groupDto.name}" precisa ter ao menos uma opção.`,
          );
        }

        const group = await manager.save(
          manager.create(ProductOption, {
            productId,
            name: groupDto.name,
            minSelect: groupDto.minSelect,
            maxSelect: groupDto.maxSelect,
          }),
        );
        if (groupDto.values.length > 0) {
          await manager.save(
            ProductOptionValue,
            groupDto.values.map((v) =>
              manager.create(ProductOptionValue, {
                optionId: group.id,
                label: v.label,
                priceDelta: v.priceDelta,
                isAvailable: v.isAvailable ?? true,
              }),
            ),
          );
        }
      }
    });

    return this.findOne(tenantId, productId);
  }
}
