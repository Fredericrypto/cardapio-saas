import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Product } from '../products/product.entity';
import { Category } from './category.entity';
import { CATALOG_BY_KEY, CATEGORY_CATALOG } from './category-catalog';

// A ordem do cardápio é a que o dono definiu (`displayOrder`) — ele reordena
// no painel. (Antes, Lanches → Bebidas → Sobremesas eram fixas nas 3
// primeiras posições; com a reordenação livre isso saiu, e a migration
// 1757000000000 já normalizou a ordem das lojas existentes pra elas
// continuarem exatamente como estavam.)
function sortCategories(list: Category[]): Category[] {
  return [...list].sort(
    (a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name, 'pt-BR'),
  );
}

// Nome comparável: sem acento, minúsculo, espaços colapsados.
function normalizeName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
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

  // Ativa VÁRIAS categorias do catálogo de uma vez (preset de tipo de
  // estabelecimento ou "adicionar selecionadas"). Tudo-ou-nada: uma chave
  // inválida recusa o pedido inteiro. Só ADICIONA — nunca desliga nada que
  // o dono já tinha — e as novas entram no fim, na ordem recebida.
  async activateMany(tenantId: string, keys: string[]): Promise<Category[]> {
    const unique = [...new Set(keys)];
    const invalid = unique.filter((k) => !CATALOG_BY_KEY.has(k));
    if (invalid.length > 0) {
      throw new BadRequestException('Categoria inválida.');
    }
    return this.categoryRepo.manager.transaction(async (manager) => {
      const repo = manager.getRepository(Category);
      const all = await repo.find({ where: { tenantId } });
      let nextOrder = all.reduce((max, c) => Math.max(max, c.displayOrder), 0);
      const byKey = new Map(all.filter((c) => c.key).map((c) => [c.key as string, c]));
      const touched: Category[] = [];
      for (const key of unique) {
        const entry = CATALOG_BY_KEY.get(key)!;
        const existing = byKey.get(key);
        if (existing?.isActive) continue;
        nextOrder += 1;
        if (existing) {
          existing.isActive = true;
          existing.displayOrder = nextOrder;
          touched.push(await repo.save(existing));
        } else {
          touched.push(
            await repo.save(
              repo.create({ tenantId, key, name: entry.name, displayOrder: nextOrder, isActive: true }),
            ),
          );
        }
      }
      return touched;
    });
  }

  // Categoria PERSONALIZADA (criada pelo dono, sem chave do catálogo).
  async createCustom(tenantId: string, rawName: string): Promise<Category> {
    const name = this.validateCustomName(rawName);
    await this.assertNameFree(tenantId, name);
    const all = await this.categoryRepo.find({ where: { tenantId } });
    const nextOrder = all.reduce((max, c) => Math.max(max, c.displayOrder), 0) + 1;
    return this.categoryRepo.save(
      this.categoryRepo.create({ tenantId, key: null, name, displayOrder: nextOrder, isActive: true }),
    );
  }

  async renameCustom(tenantId: string, id: string, rawName: string): Promise<Category> {
    const category = await this.findOne(tenantId, id);
    if (category.key) {
      throw new BadRequestException('Só categorias personalizadas podem ser renomeadas.');
    }
    const name = this.validateCustomName(rawName);
    await this.assertNameFree(tenantId, name, id);
    category.name = name;
    return this.categoryRepo.save(category);
  }

  // Liga/desliga por id (usado nas personalizadas; as do catálogo usam a
  // chave). Desligar não apaga produto nenhum.
  async setActiveById(tenantId: string, id: string, active: boolean): Promise<Category> {
    const category = await this.findOne(tenantId, id);
    if (category.isActive === active) return category;
    category.isActive = active;
    if (active) {
      const all = await this.categoryRepo.find({ where: { tenantId } });
      category.displayOrder = all.reduce((max, c) => Math.max(max, c.displayOrder), 0) + 1;
    }
    return this.categoryRepo.save(category);
  }

  // Nova ordem do cardápio: `ids` na ordem desejada. Ids de outra loja ou
  // inexistentes são ignorados; categorias que ficaram de fora mantêm a
  // posição relativa e vão pro fim. Tudo numa transação.
  async reorder(tenantId: string, ids: string[]): Promise<Category[]> {
    return this.categoryRepo.manager.transaction(async (manager) => {
      const repo = manager.getRepository(Category);
      const all = await repo.find({ where: { tenantId } });
      const byId = new Map(all.map((c) => [c.id, c]));
      const requested = [...new Set(ids)].filter((id) => byId.has(id));
      const requestedSet = new Set(requested);
      const rest = sortCategories(all.filter((c) => !requestedSet.has(c.id))).map((c) => c.id);
      const finalOrder = [...requested, ...rest];
      for (let i = 0; i < finalOrder.length; i += 1) {
        const category = byId.get(finalOrder[i])!;
        if (category.displayOrder !== i + 1) {
          category.displayOrder = i + 1;
          await repo.save(category);
        }
      }
      return sortCategories(await repo.find({ where: { tenantId } }));
    });
  }

  // Exclui uma categoria PERSONALIZADA de vez (soft delete). Recusa se
  // ainda tem produto dentro — o dono move/exclui os itens antes (ou só
  // desativa a categoria, que guarda tudo). As do catálogo nunca são
  // excluídas: são desativadas (setActive) e podem voltar.
  async removeCustom(tenantId: string, id: string): Promise<void> {
    const category = await this.findOne(tenantId, id);
    if (category.key) {
      throw new BadRequestException('Categorias do catálogo só podem ser desativadas.');
    }
    const items = await this.productRepo.count({ where: { tenantId, categoryId: id } });
    if (items > 0) {
      throw new ConflictException(
        `Essa categoria ainda tem ${items} ${items === 1 ? 'item' : 'itens'}. Mova ou exclua os itens antes — ou só desative a categoria.`,
      );
    }
    await this.categoryRepo.softDelete(id);
  }

  private validateCustomName(raw: string): string {
    const name = (raw ?? '').replace(/\s+/g, ' ').trim();
    if (name.length < 2) throw new BadRequestException('O nome precisa ter pelo menos 2 caracteres.');
    if (name.length > 40) throw new BadRequestException('O nome pode ter no máximo 40 caracteres.');
    if (!/^[\p{L}0-9][\p{L}0-9 /&().,'-]*$/u.test(name)) {
      throw new BadRequestException('Use só letras, números e os símbolos / & ( ) . , \' -');
    }
    return name;
  }

  // Nome livre: nem igual a outra categoria da loja (ativa ou não), nem
  // igual a uma do catálogo — pra essas o dono usa a lista pronta.
  private async assertNameFree(tenantId: string, name: string, exceptId?: string): Promise<void> {
    const wanted = normalizeName(name);
    const mine = await this.categoryRepo.find({ where: { tenantId } });
    if (mine.some((c) => c.id !== exceptId && normalizeName(c.name) === wanted)) {
      throw new ConflictException('Já existe uma categoria com esse nome.');
    }
    if (CATEGORY_CATALOG.some((e) => normalizeName(e.name) === wanted)) {
      throw new BadRequestException(
        'Essa categoria já existe na lista pronta — escolha ela no catálogo.',
      );
    }
  }
}
