import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { Review } from './review.entity';

// Resposta PÚBLICA do estabelecimento a uma review — sempre visível
// junto da review original (nunca some ela, nunca some a review).
// UNIQUE em reviewId: uma review tem no máximo UMA resposta, que pode
// ser editada depois (histórico de "conversa" não é o objetivo aqui,
// é uma réplica curta e profissional — mesmo padrão do Uber Eats
// Manager e Google Business).
@Entity('review_responses')
@Index(['reviewId'], { unique: true })
export class ReviewResponse {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'review_id' })
  reviewId: string;

  @ManyToOne(() => Review, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'review_id' })
  review: Review;

  @Column({ name: 'response_text', type: 'varchar', length: 1000 })
  responseText: string;

  @Column({ name: 'staff_user_id' })
  staffUserId: string;

  // Snapshot do nome de quem respondeu — mesmo padrão de
  // ReceiptRedemption.staffName, pra sempre mostrar "Respondido por
  // Fulano" mesmo que o usuário admin seja removido depois.
  @Column({ name: 'staff_name', type: 'varchar', length: 150 })
  staffName: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
