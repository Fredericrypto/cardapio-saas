import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ProductOption } from './product-option.entity';
import { numericTransformer } from '../../common/utils/numeric-transformer';

@Entity('product_option_values')
export class ProductOptionValue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'option_id' })
  optionId: string;

  @ManyToOne(() => ProductOption, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'option_id' })
  option: ProductOption;

  @Column({ length: 100 })
  label: string; // ex: "Grande"

  @Column({ name: 'price_delta', type: 'numeric', precision: 10, scale: 2, default: 0, transformer: numericTransformer })
  priceDelta: number;

  // Liga/desliga sem precisar apagar e recriar — pro admin marcar "bacon
  // em falta hoje" sem perder a opção cadastrada. Some do cardápio do
  // cliente quando false, mas continua existindo pra reativar depois.
  @Column({ name: 'is_available', default: true })
  isAvailable: boolean;
}
