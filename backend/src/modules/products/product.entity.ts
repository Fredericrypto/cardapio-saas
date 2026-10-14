import type { ContentTranslations } from '../../common/i18n/content-translations';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { Category } from '../categories/category.entity';
import { ProductOption } from './product-option.entity';
import { numericTransformer } from '../../common/utils/numeric-transformer';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Index()
  @Column({ name: 'category_id' })
  categoryId: string;

  @ManyToOne(() => Category, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'category_id' })
  category: Category;

  @Column({ length: 150 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  // Traduções opcionais { en: { name, description }, es: {...} }. NULL = sem tradução
  // cadastrada (o cardápio usa o glossário ou o texto original).
  @Column({ type: 'jsonb', nullable: true })
  translations: ContentTranslations | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numericTransformer })
  price: number;

  @Column({ name: 'promo_price', type: 'numeric', precision: 10, scale: 2, nullable: true, transformer: numericTransformer })
  promoPrice: number | null;

  // Custo direto de aquisição/produção (opcional) — base do CMV REAL na aba
  // Análise. Sem custo preenchido, o CMV é estimado pelo percentual padrão do
  // estabelecimento (Tenant.defaultCmvPercent). Nunca aparece no cardápio público.
  @Column({ name: 'cost_price', type: 'numeric', precision: 10, scale: 2, nullable: true, transformer: numericTransformer })
  costPrice: number | null;

  // CAPA do item = images[0] (o service mantém os dois sempre em sincronia).
  // Continua existindo para quem só precisa de UMA imagem: fallback do banner de
  // promoção, avaliações, miniatura do carrinho e og:image do link compartilhado.
  @Column({ name: 'image_url', type: 'text', nullable: true })
  imageUrl: string | null;

  // Galeria ordenada do item (máx. 5 — trava também no banco, ver migration
  // ProductImagesGallery). O app do cliente mostra como carrossel quando há 2+.
  // DEFAULT '{}' é obrigatório: sem ele o backup recusaria restaurar arquivos
  // antigos (coluna nova NOT NULL sem padrão — backup-engine.checkCompatibility).
  @Column({ name: 'images', type: 'text', array: true, default: () => "'{}'" })
  images: string[];

  @Column({ name: 'is_available', default: true })
  isAvailable: boolean;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder: number;

  // Grupos de opções/adicionais desse produto (ex: "Tamanho", "Adicionais")
  // — ver product-option.entity.ts. Carregado só quando explicitamente
  // pedido via relations (cardápio público e criação de pedido precisam
  // disso; a maioria das outras consultas não).
  @OneToMany(() => ProductOption, (option) => option.product)
  options: ProductOption[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
