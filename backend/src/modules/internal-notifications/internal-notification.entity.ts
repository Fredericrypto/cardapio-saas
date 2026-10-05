import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';

export type InternalNotificationType = 'note_created' | 'note_updated' | 'note_deleted';
// Quem recebia o alerta NO MOMENTO em que ele foi gerado (vem da preferência
// do restaurante): só o dono, dono + gerentes, ou toda a equipe.
export type InternalNotificationTarget = 'owner' | 'owner_manager' | 'all';

// Alertas INTERNOS da equipe. Sistema 100% isolado das notificações de
// cliente: tabela própria, serviço próprio, inscrições push próprias
// (user_push_subscriptions) — nada aqui é lido nem enviado ao app do cliente.
@Entity('internal_notifications')
@Index(['tenantId', 'createdAt'])
export class InternalNotification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  // Anotação de origem. Sem FK de propósito: o alerta de "excluída" precisa
  // sobreviver à exclusão da própria anotação.
  @Column({ name: 'note_id', type: 'uuid', nullable: true })
  noteId: string | null;

  @Column({ type: 'varchar', length: 30 })
  type: InternalNotificationType;

  @Column({ type: 'varchar', length: 120 })
  title: string;

  @Column({ type: 'varchar', length: 300 })
  message: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  tag: string | null;

  @Column({ name: 'author_user_id', type: 'uuid', nullable: true })
  authorUserId: string | null;

  @Column({ name: 'author_name', type: 'varchar', length: 150 })
  authorName: string;

  @Column({ name: 'author_role', type: 'varchar', length: 20 })
  authorRole: string;

  @Column({ name: 'target_role', type: 'varchar', length: 20 })
  targetRole: InternalNotificationTarget;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
