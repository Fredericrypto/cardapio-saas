import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';

// Dispositivo (celular/navegador) de um FUNCIONÁRIO/ADMIN autorizado a
// receber push interno. Tabela separada de `push_subscriptions` (essa é a dos
// clientes) — é o que garante que alerta interno nunca chega no app do cliente.
@Entity('user_push_subscriptions')
@Index(['tenantId', 'userId'])
export class UserPushSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  // Perfil no momento da inscrição (owner, manager, staff) — atualizado a cada
  // novo subscribe do mesmo aparelho.
  @Column({ type: 'varchar', length: 20 })
  role: string;

  @Column({ type: 'text', unique: true })
  endpoint: string;

  @Column({ type: 'text' })
  p256dh: string;

  @Column({ type: 'text' })
  auth: string;

  @Column({ name: 'user_agent', type: 'varchar', length: 300, nullable: true })
  userAgent: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
