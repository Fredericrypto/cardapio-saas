import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { TableSession } from './table-session.entity';

@Entity('waiter_calls')
export class WaiterCall {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'table_session_id' })
  tableSessionId: string;

  @ManyToOne(() => TableSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'table_session_id' })
  tableSession: TableSession;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'pendente' })
  status: string; // pendente, atendido

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'attended_at', type: 'timestamptz', nullable: true })
  attendedAt: Date | null;

  // Quem chamou (assento) e o nome dele NAQUELE momento — o painel mostra
  // "Mesa X chamou o garçom — Fulano", inclusive pra visitante sem conta.
  @Column({ name: 'table_participant_id', type: 'uuid', nullable: true })
  tableParticipantId: string | null;

  @Column({ name: 'called_by_name', type: 'varchar', length: 60, nullable: true })
  calledByName: string | null;
}
