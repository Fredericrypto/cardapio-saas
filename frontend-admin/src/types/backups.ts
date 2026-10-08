// CONTRATO da API de backups. Existe uma CÓPIA IDÊNTICA em
// frontend-admin/src/types/backups.ts — ao mudar um, `cp` pro outro
// (mesmo cuidado de analytics.types.ts).

export type BackupType = 'automatico' | 'manual' | 'pre_restauracao';
export type BackupStatus = 'processando' | 'concluido' | 'restaurando' | 'restaurado' | 'falhou';

export const RESTORE_CONFIRMATION_WORD = 'RESTAURAR-DADOS';

export interface BackupItem {
  id: string;
  fileName: string;
  fileSize: number;
  backupType: BackupType;
  status: BackupStatus;
  totalRows: number | null;
  errorMessage: string | null;
  createdByName: string | null;
  restoreCount: number;
  restoredAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface BackupSettingsView {
  frequencyDays: number;
  runTime: string;
  retentionDays: number;
  nextRunAt: string | null;
  lastAutoBackupAt: string | null;
}

export interface BackupOverview {
  settings: BackupSettingsView;
  config: {
    encryptionConfigured: boolean;
    storageConfigured: boolean;
    storageDriver: 'supabase' | 'local' | null;
  };
  backups: BackupItem[];
  totalBytes: number;
  operationInProgress: boolean;
}

export interface RestorePreviewRow {
  table: string;
  current: number;
  inBackup: number;
}

export interface RestorePreview {
  backupId: string;
  createdAt: string;
  rows: RestorePreviewRow[];
  currentTotal: number;
  backupTotal: number;
}

export interface RestoreSummary {
  restoredAt: string;
  totalRows: number;
  safetyBackupId: string;
  tables: { name: string; rowCount: number }[];
}

export interface BackupAuditItem {
  id: string;
  action: string;
  success: boolean;
  userEmail: string | null;
  userRole: string | null;
  backupId: string | null;
  ip: string | null;
  createdAt: string;
}
