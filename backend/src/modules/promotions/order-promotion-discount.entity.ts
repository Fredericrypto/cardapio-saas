import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { Order } from '../orders/order.entity';
import { Promotion } from './promotion.entity';
import { numericTransformer } from '../../common/utils/numeric-transformer';

// Detalhamento de QUANTO cada promoção descontou em CADA pedido — só
// existe porque um pedido pode usar MAIS DE UM cupom ao mesmo tempo
// (ex: 50% off no burger + R$3 off na coca, no mesmo pedido). Sem essa
// tabela, `order.discountAmount` é só a SOMA de todos os cupons daquele
// pedido, e não dava pra saber "quanto veio de CADA promoção" pros
// relatórios do admin (getRedemptions, totalDiscountGiven por
// promoção) — o que causaria exatamente o tipo de número errado que já
// causou tanta confusão antes (ver PromotionsService.recomputeRedemptionCount
// e a migration RecomputeRedemptionCountAndDropMaxRedemptions).
@Entity('order_promotion_discounts')
export class OrderPromotionDiscount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Index()
  @Column({ name: 'order_id' })
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Index()
  @Column({ name: 'promotion_id' })
  promotionId: string;

  @ManyToOne(() => Promotion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'promotion_id' })
  promotion: Promotion;

  @Column({ name: 'discount_amount', type: 'numeric', precision: 10, scale: 2, transformer: numericTransformer })
  discountAmount: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
