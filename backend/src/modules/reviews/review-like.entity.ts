import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, Index, Unique } from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { Customer } from '../customers/customer.entity';
import { Review } from './review.entity';

// Curtida de um cliente numa avaliação. UMA por (avaliação, cliente) — garantido pelo
// índice único, então dois toques simultâneos nunca duplicam. Curtir/descurtir é
// alternância: descurtir apaga a linha (não é dado financeiro nem de auditoria).
// `tenantId` existe de propósito: o plano de backup só aceita tabela com tenant_id.
@Entity('review_likes')
@Unique('UQ_review_likes_review_customer', ['reviewId', 'customerId'])
export class ReviewLike {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Index()
  @Column({ name: 'review_id', type: 'uuid' })
  reviewId: string;

  @ManyToOne(() => Review, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'review_id' })
  review: Review;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
