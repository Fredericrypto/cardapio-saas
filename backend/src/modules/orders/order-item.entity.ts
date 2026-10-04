import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Order } from './order.entity';
import { Product } from '../products/product.entity';
import { numericTransformer } from '../../common/utils/numeric-transformer';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'order_id' })
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ name: 'product_id' })
  productId: string;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product: Product;

  // Snapshot: se o produto mudar de nome/preço depois, o pedido antigo não muda.
  @Column({ name: 'product_name', length: 150 })
  productName: string;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ name: 'unit_price', type: 'numeric', precision: 10, scale: 2, transformer: numericTransformer })
  unitPrice: number;

  // Custo unitário no momento do pedido (snapshot de Product.costPrice) — o
  // CMV histórico não muda se o custo do produto for editado depois. null =
  // produto sem custo cadastrado na época (analytics usa o % padrão).
  // select:false → NUNCA vai para as respostas de pedido/cupom que o cliente
  // vê (dado de gestão do dono); só o SQL da aba Análise lê esta coluna.
  @Column({ name: 'unit_cost', type: 'numeric', precision: 10, scale: 2, nullable: true, select: false, transformer: numericTransformer })
  unitCost: number | null;

  @Column({ name: 'selected_options', type: 'jsonb', nullable: true })
  selectedOptions: Record<string, any> | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numericTransformer })
  subtotal: number;
}
