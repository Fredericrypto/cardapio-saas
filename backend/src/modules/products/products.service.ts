import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Product } from './product.entity';
import { ProductOption } from './product-option.entity';
import { ProductOptionValue } from './product-option-value.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { SetProductOptionsDto } from './dto/set-product-options.dto';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async findAllForAdmin(tenantId: string): Promise<Product[]> {
    return this.productRepo.find({
      where: { tenantId },
      order: { displayOrder: 'ASC' },
      relations: { options: { values: true } },
    });
  }

  // Cardápio público: só produtos disponíveis (o dono desligou o que acabou hoje).
  // Opções/adicionais marcados como indisponíveis também somem daqui —
  // mas continuam existindo de verdade (só filtrados na resposta), pro
  // admin poder reativar sem recriar nada.
  async findAllForPublic(tenantId: string): Promise<Product[]> {
    const products = await this.productRepo.find({
      where: { tenantId, isAvailable: true },
      order: { displayOrder: 'ASC' },
      relations: { options: { values: true } },
    });
    for (const product of products) {
      for (const group of product.options ?? []) {
        group.values = group.values.filter((v) => v.isAvailable);
      }
    }
    return products;
  }

  async findOne(tenantId: string, id: string): Promise<Product> {
    const product = await this.productRepo.findOne({
      where: { id, tenantId },
      relations: { options: { values: true } },
    });
    if (!product) {
      throw new NotFoundException('Produto não encontrado.');
    }
    return product;
  }

  async create(tenantId: string, dto: CreateProductDto): Promise<Product> {
    const product = this.productRepo.create({ ...dto, tenantId });
    return this.productRepo.save(product);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateProductDto,
  ): Promise<Product> {
    const product = await this.findOne(tenantId, id);
    Object.assign(product, dto);
    return this.productRepo.save(product);
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
