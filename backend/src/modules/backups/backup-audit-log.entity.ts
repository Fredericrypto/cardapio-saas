import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

export type BackupAuditAction =
  | 'settings_updated'
  | 'backup_started'
  | 'backup_completed'
  | 'backup_failed'
  | 'backup_downloaded'
  | 'backup_deleted'
  | 'retention_purged'
  | 'restore_denied'
  | 'restore_started'
  | 'restore_completed'
  | 'restore_failed'
  | 'forbidden_access'
  | 'stale_operation_recovered';

// Registro de auditoria APENAS-INSERÇÃO: a migration cria um gatilho que
// recusa qualquer UPDATE (e o serviço nunca apaga linhas). Guarda QUEM (id,
// e-mail e perfil — snapshot), O QUÊ, DE ONDE (IP + cabeçalho
// X-Forwarded-For bruto + user-agent) e o resultado. Não faz parte do
// snapshot de backup (um restore nunca reescreve a auditoria).
@Entity('backup_audit_logs')
@Index(['tenantId', 'createdAt'])
export class BackupAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  // Null em ações do agendador (sistema).
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ name: 'user_email', type: 'varchar', length: 150, nullable: true })
  userEmail: string | null;

  @Column({ name: 'user_role', type: 'varchar', length: 20, nullable: true })
  userRole: string | null;

  @Column({ type: 'varchar', length: 40 })
  action: BackupAuditAction;

  @Column({ name: 'backup_id', type: 'uuid', nullable: true })
  backupId: string | null;

  @Column({ type: 'boolean', default: true })
  success: boolean;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @Column({ name: 'forwarded_for', type: 'varchar', length: 300, nullable: true })
  forwardedFor: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 300, nullable: true })
  userAgent: string | null;

  @Column({ type: 'jsonb', nullable: true })
  detail: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
