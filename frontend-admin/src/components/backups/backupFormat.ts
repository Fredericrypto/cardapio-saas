import type { BackupStatus, BackupType } from '../../types/backups';

const TZ = 'America/Sao_Paulo';

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1).replace('.', ',')} KB`;
  return `${(n / 1024 / 1024).toFixed(2).replace('.', ',')} MB`;
}

export const TYPE_LABEL: Record<BackupType, string> = {
  automatico: 'Automático',
  manual: 'Manual',
  pre_restauracao: 'Segurança (antes de restaurar)',
};

export const STATUS_LABEL: Record<BackupStatus, string> = {
  processando: 'Em Processamento',
  concluido: 'Concluído',
  restaurando: 'Restaurando…',
  restaurado: 'Restaurado',
  falhou: 'Falhou',
};

export const STATUS_STYLE: Record<BackupStatus, string> = {
  processando: 'bg-amber-50 text-amber-700 border-amber-200',
  concluido: 'bg-green-50 text-green-700 border-green-200',
  restaurando: 'bg-amber-50 text-amber-700 border-amber-200',
  restaurado: 'bg-blue-50 text-blue-700 border-blue-200',
  falhou: 'bg-red-50 text-red-700 border-red-200',
};

export const FREQUENCY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: 'Desativado' },
  { value: 3, label: 'A cada 3 dias' },
  { value: 7, label: 'Semanal (7 dias)' },
  { value: 15, label: 'Quinzenal (15 dias)' },
  { value: 30, label: 'Mensal (30 dias)' },
];

export const RETENTION_OPTIONS = [7, 15, 30, 60, 90, 180, 365];

export const AUDIT_LABEL: Record<string, string> = {
  settings_updated: 'Agenda alterada',
  backup_started: 'Backup iniciado',
  backup_completed: 'Backup concluído',
  backup_failed: 'Backup falhou',
  backup_downloaded: 'Backup baixado',
  backup_deleted: 'Backup excluído',
  retention_purged: 'Limpeza automática de backups antigos',
  restore_denied: 'Restauração negada (senha/palavra incorreta)',
  restore_started: 'Restauração iniciada',
  restore_completed: 'Restauração concluída',
  restore_failed: 'Restauração falhou (nada foi alterado)',
  forbidden_access: 'Acesso negado (sem permissão)',
  stale_operation_recovered: 'Operação interrompida encerrada',
};

export const TABLE_LABEL: Record<string, string> = {
  orders: 'Pedidos',
  order_items: 'Itens dos pedidos',
  customers: 'Clientes',
  table_sessions: 'Sessões de mesa',
  table_session_participants: 'Participantes das mesas',
  cashback_consumptions: 'Cashback consumido',
  cashback_ledger_entries: 'Lançamentos de cashback',
  cashback_settings: 'Configuração de cashback',
  cash_transactions: 'Movimentos de caixa',
  categories: 'Categorias',
  products: 'Produtos',
  product_options: 'Opções de produtos',
  product_option_values: 'Valores das opções',
  notes: 'Anotações',
  promotions: 'Promoções',
  loyalty_programs: 'Programas de fidelidade',
  loyalty_rewards: 'Recompensas de fidelidade',
  loyalty_stamps: 'Selos de fidelidade',
  locations: 'Lojas',
  restaurant_tables: 'Mesas',
  reviews: 'Avaliações',
  review_responses: 'Respostas às avaliações',
  waiter_calls: 'Chamados de garçom',
  receipt_redemptions: 'Resgates por comprovante',
  push_subscriptions: 'Notificações de clientes',
};

export function apiMessage(err: unknown, fallback: string): string {
  const m = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(m) ? m.join(' ') : m ?? fallback;
}
