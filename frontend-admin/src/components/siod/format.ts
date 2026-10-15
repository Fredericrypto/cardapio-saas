// Formatação da aba "Entregas" (SIOD). `null`/`undefined` = "—" (sem dados), nunca 0 inventado.
export const NO_VALUE = '—';

const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function minutes(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return NO_VALUE;
  return `${nf1.format(value)} min`;
}

// +3,2 min = demorou mais que o prometido; −3,2 min = chegou antes.
export function signedMinutes(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return NO_VALUE;
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${nf1.format(Math.abs(value))} min`;
}

export function percent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return NO_VALUE;
  return `${nf1.format(value)}%`;
}

export function count(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return NO_VALUE;
  return value.toLocaleString('pt-BR');
}

export function dateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return NO_VALUE;
  return d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function shortOrderId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

// Mensagem de erro da API (NestJS devolve `message` como texto ou lista).
export function apiErrorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: string | string[] } } }).response?.data?.message;
  if (Array.isArray(message)) return message.join(' ');
  return message ?? fallback;
}

export function isAbort(err: unknown): boolean {
  return (err as { code?: string }).code === 'ERR_CANCELED';
}

export const RECORD_CLASS_LABEL = {
  valid: 'Medido',
  invalid: 'Tempos inconsistentes',
  skipped: 'Concluído sem etapas',
  in_progress: 'Em andamento',
  cancelled: 'Cancelado',
} as const;

export const RECORD_CLASS_TONE = {
  valid: 'bg-emerald-50 text-emerald-700',
  invalid: 'bg-red-50 text-red-700',
  skipped: 'bg-amber-50 text-amber-700',
  in_progress: 'bg-sky-50 text-sky-700',
  cancelled: 'bg-gray-100 text-gray-500',
} as const;

export const CONFIDENCE_LABEL: Record<string, string> = { HIGH: 'Alta', MEDIUM: 'Média', LOW: 'Baixa' };
export const PROVIDER_LABEL: Record<string, string> = { OSRM: 'Rota real', HAVERSINE: 'Linha reta', MANUAL: 'Manual' };
export const PAYMENT_LABEL: Record<string, string> = { pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro', indefinido: 'Indefinido' };
