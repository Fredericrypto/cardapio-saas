import { sanitizeTranslations } from '../../common/i18n/content-translations';
import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
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
import {
  resolveDeclaredBadges,
  validateDeclaredBadges,
  type DeclaredBadgeCode,
} from './badges/product-badges.types';
import { TenantCacheService } from '../tenant-cache/tenant-cache.service';
import { InvalidatesTenantCache } from '../tenant-cache/invalidates-tenant-cache.decorator';
import { ProductBadgesService } from './badges/product-badges.service';

// Cardápio público: o app do cliente consulta a cada 15 s (e ao abrir cada tela).
// Produto muda pouco: fica em cache, derrubado na hora por toda escrita aqui e
// conferido (contagem + max(updated_at)) no máximo a cada 5 s para pegar escritas
// de outros caminhos (ex.: categorias). Teto duro de 2 min.
const PUBLIC_MENU_MAX_AGE_MS = 120_000;
const PUBLIC_MENU_FINGERPRINT_EVERY_MS = 5_000;

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    // @Optional: testes que montam o service à mão continuam funcionando (sem cache).
    @Optional() private readonly tenantCache?: TenantCacheService,
    // @Optional: sem ele (testes montados a mão) o cardápio sai sem selos automáticos.
    @Optional() private readonly productBadges?: ProductBadgesService,
  ) {}

  // Garante `images` coerente com a capa (`imageUrl`) em TODA leitura: produto
  // antigo e backup anterior à galeria voltam com images = [] e image_url
  // preenchida — aqui isso vira [image_url]. Só em memória; o banco é
  // corrigido na próxima gravação do produto.
  private withGallery(product: Product): Product {
    product.images = resolveProductImages(product.images, product.imageUrl);
    product.badges = resolveDeclaredBadges(product.badges);
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

  // Selos declarativos vindos do painel: só códigos do catálogo e no máximo
  // MAX_DECLARED_CHIP_BADGES de texto (a imagem ilustrativa não conta).
  private cleanBadges(raw: readonly string[]): DeclaredBadgeCode[] {
    const result = validateDeclaredBadges(raw);
    if (!result.ok) throw new BadRequestException(result.message);
    return result.badges;
  }

  async findAllForAdmin(tenantId: string): Promise<Product[]> {
    const products = await this.productRepo.find({
      where: { tenantId },
      order: { displayOrder: 'ASC' },
      relations: { options: { values: true } },
    });
    const list = products.map((p) => this.withGallery(p));
    return this.productBadges ? this.productBadges.withAutoBadges(tenantId, list) : list;
  }

  // Cardápio público: devolve TODOS os produtos, inclusive os marcados como
  // indisponíveis — o app do cliente os mostra acinzentados (dá pra ler a
  // descrição, mas não adicionar). O pedido em si continua barrado no
  // OrdersService (só aceita isAvailable: true).
  // Opções/adicionais marcados como indisponíveis continuam sumindo daqui —
  // mas continuam existindo de verdade (só filtrados na resposta), pro
  // admin poder reativar sem recriar nada.
  async findAllForPublic(tenantId: string): Promise<Product[]> {
    // Versão SEM cache: o controller usa findAllForPublicCached; chamada direta = bypass.
    this.tenantCache?.recordBypass('public-menu', 'products');
    return this.loadPublicMenu(tenantId);
  }

  private async loadPublicMenu(tenantId: string): Promise<Product[]> {
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
    const list = products.map((p) => this.withGallery(p));
    // Selos automáticos (decididos aqui; o app só exibe) ficam DENTRO do valor em cache: o ETag
    // é um hash do conteúdo, então muda sozinho quando um selo muda (200 em vez de 304 velho).
    return this.productBadges ? this.productBadges.withAutoBadges(tenantId, list) : list;
  }

  // Versão com cache do cardápio público (usada pelo controller). O valor é
  // compartilhado entre requisições: serializar, nunca mutar. `costPrice` já sai
  // zerado daqui, então nada sensível fica no cache.
  async findAllForPublicCached(tenantId: string): Promise<{ products: Product[]; etag: string | null }> {
    const cache = this.tenantCache;
    if (!cache) return { products: await this.loadPublicMenu(tenantId), etag: null };
    const { value, etag } = await cache.getOrLoad(tenantId, 'products', () => this.loadPublicMenu(tenantId), {
      label: 'public-menu',
      maxAgeMs: PUBLIC_MENU_MAX_AGE_MS,
      fingerprintEveryMs: PUBLIC_MENU_FINGERPRINT_EVERY_MS,
      fingerprint: () => this.productsFingerprint(tenantId),
    });
    return { products: value, etag };
  }

  private async productsFingerprint(tenantId: string): Promise<string> {
    const rows: Array<{ n: number; m: string }> = await this.productRepo.query(
      `SELECT COUNT(*)::int AS n, COALESCE(MAX(updated_at)::text, '') AS m
         FROM products WHERE tenant_id = $1 AND deleted_at IS NULL`,
      [tenantId],
    );
    return `${rows[0]?.n ?? 0}|${rows[0]?.m ?? ''}`;
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

  @InvalidatesTenantCache(['products'])
  async create(tenantId: string, dto: CreateProductDto): Promise<Product> {
    const { images, imageUrl, badges, ...rest } = dto;
    // `images` (galeria) tem precedência; `imageUrl` sozinho (formato antigo)
    // vira uma galeria de 1 foto. A capa é sempre images[0].
    const gallery = images !== undefined ? this.cleanGallery(images) : replaceCover([], imageUrl);
    const product = this.productRepo.create({
      ...rest,
      translations: sanitizeTranslations(dto.translations, ['name', 'description']),
      tenantId,
      images: gallery,
      imageUrl: gallery[0] ?? null,
      badges: this.cleanBadges(badges ?? []),
    });
    return this.withGallery(await this.productRepo.save(product));
  }

  @InvalidatesTenantCache(['products'])
  async update(
    tenantId: string,
    id: string,
    dto: UpdateProductDto,
  ): Promise<Product> {
    const product = await this.findOne(tenantId, id);
    const { translations, images, imageUrl, badges, ...rest } = dto;
    Object.assign(product, rest);
    // `undefined` = não mexer; objeto vazio/inválido = limpar (vira null).
    if (translations !== undefined) product.translations = sanitizeTranslations(translations, ['name', 'description']);
    // `undefined` = não mexer; [] = limpar os selos.
    if (badges !== undefined) product.badges = this.cleanBadges(badges);

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
  @InvalidatesTenantCache(['products'])
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

  @InvalidatesTenantCache(['products'])
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
  @InvalidatesTenantCache(['products'])
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
