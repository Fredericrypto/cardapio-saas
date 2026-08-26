import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
  ) {}

  // Painel admin: lista todas as categorias do tenant, incluindo inativas
  // (o dono precisa poder reativar algo que desligou por engano).
  async findAllForAdmin(tenantId: string): Promise<Category[]> {
    return this.categoryRepo.find({
      where: { tenantId },
      order: { displayOrder: 'ASC' },
    });
  }

  // Cardápio público: só categorias ativas, na ordem certa.
  async findAllForPublic(tenantId: string): Promise<Category[]> {
    return this.categoryRepo.find({
      where: { tenantId, isActive: true },
      order: { displayOrder: 'ASC' },
    });
  }

  async findOne(tenantId: string, id: string): Promise<Category> {
    const category = await this.categoryRepo.findOne({
      where: { id, tenantId },
    });
    if (!category) {
      throw new NotFoundException('Categoria não encontrada.');
    }
    return category;
  }

  async create(tenantId: string, dto: CreateCategoryDto): Promise<Category> {
    const category = this.categoryRepo.create({ ...dto, tenantId });
    return this.categoryRepo.save(category);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateCategoryDto,
  ): Promise<Category> {
    const category = await this.findOne(tenantId, id);
    Object.assign(category, dto);
    return this.categoryRepo.save(category);
  }

  // Soft delete — a coluna deleted_at cuida disso automaticamente via TypeORM .softDelete()
  async remove(tenantId: string, id: string): Promise<void> {
    await this.findOne(tenantId, id); // garante que pertence ao tenant antes de apagar
    await this.categoryRepo.softDelete(id);
  }
}
