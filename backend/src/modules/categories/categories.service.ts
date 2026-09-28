import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './category.entity';
import { CATALOG_BY_KEY } from './category-catalog';

// Lanches → Bebidas → Sobremesas sempre nas 3 primeiras posições (quando
// ativas); o resto na ordem em que o dono foi ativando (`displayOrder`).
// Categorias legadas sem chave entram no "resto".
function sortCategories(list: Category[]): Category[] {
  const rank = (c: Category) =>
    (c.key && CATALOG_BY_KEY.get(c.key)?.fixedRank) || Number.MAX_SAFE_INTEGER;
  return [...list].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return a.displayOrder - b.displayOrder;
  });
}

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
  ) {}

  // Painel admin: todas as categorias do tenant, incluindo inativas (o
  // dono precisa poder reativar algo que desligou).
  async findAllForAdmin(tenantId: string): Promise<Category[]> {
    return sortCategories(await this.categoryRepo.find({ where: { tenantId } }));
  }

  // Cardápio público: só as ativas, já na ordem final de exibição.
  async findAllForPublic(tenantId: string): Promise<Category[]> {
    return sortCategories(
      await this.categoryRepo.find({ where: { tenantId, isActive: true } }),
    );
  }

  async findOne(tenantId: string, id: string): Promise<Category> {
    const category = await this.categoryRepo.findOne({ where: { id, tenantId } });
    if (!category) {
      throw new NotFoundException('Categoria não encontrada.');
    }
    return category;
  }

  // Liga/desliga uma categoria do catálogo fixo. Desligar NÃO apaga nada:
  // os produtos ficam guardados e voltam junto se o dono religar. Ao
  // (re)ligar, a categoria vai pro fim da fila de "demais categorias".
  async setActive(tenantId: string, key: string, active: boolean): Promise<Category> {
    const entry = CATALOG_BY_KEY.get(key);
    if (!entry) {
      throw new BadRequestException('Categoria inválida.');
    }
    const existing = await this.categoryRepo.findOne({ where: { tenantId, key } });

    if (!active) {
      if (!existing) return this.notActiveStub(tenantId, key, entry.name);
      existing.isActive = false;
      return this.categoryRepo.save(existing);
    }

    if (existing?.isActive) return existing;

    const all = await this.categoryRepo.find({ where: { tenantId } });
    const nextOrder = all.reduce((max, c) => Math.max(max, c.displayOrder), 0) + 1;

    if (existing) {
      existing.isActive = true;
      existing.displayOrder = nextOrder;
      return this.categoryRepo.save(existing);
    }
    return this.categoryRepo.save(
      this.categoryRepo.create({
        tenantId,
        key,
        name: entry.name,
        displayOrder: nextOrder,
        isActive: true,
      }),
    );
  }

  // Desligar algo que nunca foi ligado: nada a fazer.
  private notActiveStub(tenantId: string, key: string, name: string): Category {
    return this.categoryRepo.create({ tenantId, key, name, isActive: false, displayOrder: 0 });
  }

  // Só categorias LEGADAS (sem chave) podem ser removidas de vez; as do
  // catálogo são desligadas via setActive. Soft delete (deleted_at).
  async removeLegacy(tenantId: string, id: string): Promise<void> {
    const category = await this.findOne(tenantId, id);
    if (category.key) {
      throw new BadRequestException('Categorias do catálogo só podem ser desativadas.');
    }
    await this.categoryRepo.softDelete(id);
  }
}
