import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export type BackupType = 'automatico' | 'manual' | 'pre_restauracao';
export type BackupStatus = 'processando' | 'concluido' | 'restaurando' | 'restaurado' | 'falhou';

// bigint volta do driver como string — tamanhos de arquivo cabem folgados em
// Number (2^53 bytes = 8 PB), então converter é seguro.
const bigintTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null): number | null =>
    value === null || value === undefined ? null : Number(value),
};

// Metadados de cada snapshot (o arquivo em si — criptografado — fica no
// bucket PRIVADO; ver BackupStorage). Esta tabela NÃO faz parte do snapshot
// (ver EXCLUDED_TABLES em backup-plan.ts): restaurar um backup nunca reescreve
// o histórico de backups nem o registro de auditoria.
//
// Trava de verdade no banco (migration 1757200000000): índice único PARCIAL
// em (tenant_id) WHERE status IN ('processando','restaurando') — no máximo
// UMA operação de backup/restauração em andamento por restaurante, mesmo com
// duas instâncias do servidor ou dois cliques simultâneos.
@Entity('tenant_backups')
@Index(['tenantId', 'createdAt'])
export class TenantBackup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  // Nome amigável do arquivo no download (ex.: "meu-restaurante-20261007-040000.json.gz.enc").
  @Column({ name: 'file_name', type: 'varchar', length: 200 })
  fileName: string;

  // Caminho do objeto no bucket: "<tenantId>/<backupId>.csbk".
  @Column({ name: 'storage_path', type: 'varchar', length: 300 })
  storagePath: string;

  // Bytes do arquivo CRIPTOGRAFADO (o que de fato ocupa o storage).
  @Column({ name: 'file_size', type: 'bigint', default: 0, transformer: bigintTransformer })
  fileSize: number;

  @Column({ name: 'backup_type', type: 'varchar', length: 20 })
  backupType: BackupType;

  @Column({ type: 'varchar', length: 15, default: 'processando' })
  status: BackupStatus;

  // SHA-256 do arquivo criptografado — conferido antes de qualquer download/restore.
  @Column({ name: 'checksum_sha256', type: 'varchar', length: 64, nullable: true })
  checksumSha256: string | null;

  @Column({ name: 'total_rows', type: 'int', nullable: true })
  totalRows: number | null;

  // { tabela: nº de linhas } no momento do snapshot (prévia da restauração).
  @Column({ name: 'table_counts', type: 'jsonb', nullable: true })
  tableCounts: Record<string, number> | null;

  // Última migration aplicada quando o snapshot foi tirado (informativo).
  @Column({ name: 'schema_head', type: 'varchar', length: 60, nullable: true })
  schemaHead: string | null;

  @Column({ name: 'format_version', type: 'smallint', default: 1 })
  formatVersion: number;

  @Column({ name: 'error_message', type: 'varchar', length: 500, nullable: true })
  errorMessage: string | null;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId: string | null;

  // Snapshot do nome (não depende de join; continua certo se o usuário sair).
  @Column({ name: 'created_by_name', type: 'varchar', length: 150, nullable: true })
  createdByName: string | null;

  @Column({ name: 'restore_count', type: 'int', default: 0 })
  restoreCount: number;

  @Column({ name: 'restored_at', type: 'timestamptz', nullable: true })
  restoredAt: Date | null;

  @Column({ name: 'restored_by_user_id', type: 'uuid', nullable: true })
  restoredByUserId: string | null;

  @Column({ name: 'restored_by_name', type: 'varchar', length: 150, nullable: true })
  restoredByName: string | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
