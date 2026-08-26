import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Product } from './product.entity';
import { ProductOptionValue } from './product-option-value.entity';

@Entity('product_options')
export class ProductOption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'product_id' })
  productId: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ length: 100 })
  name: string; // ex: "Tamanho", "Adicionais"

  // Modelo exato do iFood: grupo tem uma quantidade MÍNIMA e MÁXIMA de
  // escolhas, não um booleano solto. min=0 é o mesmo que "opcional";
  // min>=1 é "obrigatório escolher pelo menos min". max=1 se comporta
  // como rádio (uma escolha só); max>1 se comporta como checkbox (até
  // max escolhas). Isso cobre tanto "Tamanho" (min=1, max=1) quanto
  // "Adicionais" (min=0, max=4) com o mesmo par de campos.
  @Column({ name: 'min_select', type: 'int', default: 0 })
  minSelect: number;

  @Column({ name: 'max_select', type: 'int', default: 1 })
  maxSelect: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @OneToMany(() => ProductOptionValue, (value) => value.option)
  values: ProductOptionValue[];
}
