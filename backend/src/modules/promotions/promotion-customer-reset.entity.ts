import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { Promotion } from './promotion.entity';
import { Customer } from '../customers/customer.entity';

// Registra quando o ADMIN devolveu manualmente o uso de uma promoção
// pra um cliente específico (ex: cliente já usou o cupom "1x por
// cliente" e o admin quer liberar de novo, sem apagar nem mexer no
// pedido antigo — o histórico de pedidos é intocável). Uma linha por
// (promoção, cliente); resetar de novo só atualiza `resetAt` pra agora.
//
// PromotionsService.validateSelectedPromotion conta só os pedidos
// criados DEPOIS do `resetAt` mais recente pra esse par — é assim que
// o "reset" funciona sem tocar em Order nenhum.
@Entity('promotion_customer_resets')
@Unique('IDX_promotion_customer_resets_unique', ['promotionId', 'customerId'])
export class PromotionCustomerReset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'promotion_id' })
  promotionId: string;

  @ManyToOne(() => Promotion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'promotion_id' })
  promotion: Promotion;

  @Column({ name: 'customer_id' })
  customerId: string;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @Column({ name: 'reset_at', type: 'timestamptz' })
  resetAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
