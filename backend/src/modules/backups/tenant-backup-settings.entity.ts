import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export const BACKUP_FREQUENCIES = [0, 3, 7, 15, 30] as const;
export type BackupFrequencyDays = (typeof BACKUP_FREQUENCIES)[number];

export const DEFAULT_RETENTION_DAYS = 90;
export const MIN_RETENTION_DAYS = 7;
export const MAX_RETENTION_DAYS = 365;
export const DEFAULT_RUN_TIME = '04:00';

// Agenda do backup automático — 1 linha por restaurante, criada só quando o
// dono salva a configuração (sem linha = desativado, retenção padrão).
// Fica numa tabela PRÓPRIA (e não em `tenants`) de propósito: `tenants` é
// devolvida em várias respostas (inclusive a pública, via toPublicTenant) e
// nenhuma configuração de segurança deve correr o risco de vazar por ali.
@Entity('tenant_backup_settings')
export class TenantBackupSettings {
  @PrimaryColumn({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  // 0 = desativado; senão a cada N dias (3, 7, 15 ou 30).
  @Column({ name: 'frequency_days', type: 'int', default: 0 })
  frequencyDays: number;

  // "HH:MM" no horário de Brasília (America/Sao_Paulo).
  @Column({ name: 'run_time', type: 'varchar', length: 5, default: DEFAULT_RUN_TIME })
  runTime: string;

  @Column({ name: 'retention_days', type: 'int', default: DEFAULT_RETENTION_DAYS })
  retentionDays: number;

  // Próxima execução devida. O agendador pega só linhas com next_run_at <= agora
  // (e reivindica de forma atômica — ver BackupsScheduler).
  @Column({ name: 'next_run_at', type: 'timestamptz', nullable: true })
  nextRunAt: Date | null;

  @Column({ name: 'last_auto_backup_at', type: 'timestamptz', nullable: true })
  lastAutoBackupAt: Date | null;

  @Column({ name: 'updated_by_user_id', type: 'uuid', nullable: true })
  updatedByUserId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
