import type { HistoryOrderEntry, HistorySessionEntry } from '../types';

// Filtros combináveis do Histórico de Pedidos (item 1 do refinamento).
// Funções puras: nada aqui toca em React nem na rede.

export type HistoryStatusFilter =
  | 'todos'
  | 'pendente'
  | 'preparo'
  | 'pronto'
  | 'concluido'
  | 'cancelado';

export type HistoryTypeFilter = 'todos' | 'delivery' | 'retirada' | 'mesa';

export type HistoryPeriodFilter = 'todos' | 'hoje' | '7dias' | '30dias' | 'personalizado';

export interface HistoryFilters {
  status: HistoryStatusFilter;
  type: HistoryTypeFilter;
  period: HistoryPeriodFilter;
  /** yyyy-mm-dd (input type="date"), só vale em period === 'personalizado' */
  dateFrom: string;
  dateTo: string;
}

export const DEFAULT_HISTORY_FILTERS: HistoryFilters = {
  status: 'todos',
  type: 'todos',
  period: 'todos',
  dateFrom: '',
  dateTo: '',
};

export const STATUS_OPTIONS: { key: HistoryStatusFilter; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'pendente', label: 'Pendentes' },
  { key: 'preparo', label: 'Em preparo' },
  { key: 'pronto', label: 'Prontos' },
  { key: 'concluido', label: 'Entregues / Concluídos' },
  { key: 'cancelado', label: 'Cancelados' },
];

export const TYPE_OPTIONS: { key: HistoryTypeFilter; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'retirada', label: 'Retirada' },
  { key: 'mesa', label: 'Pedido na mesa' },
];

export const PERIOD_OPTIONS: { key: HistoryPeriodFilter; label: string }[] = [
  { key: 'todos', label: 'Todo o período' },
  { key: 'hoje', label: 'Hoje' },
  { key: '7dias', label: 'Últimos 7 dias' },
  { key: '30dias', label: 'Últimos 30 dias' },
  { key: 'personalizado', label: 'Personalizado' },
];

/** Forma mínima que os filtros precisam de um item do histórico. */
export type FilterableHistoryItem =
  | { kind: 'mesa'; entry: HistorySessionEntry; timestamp: string }
  | { kind: 'avulso'; entry: HistoryOrderEntry; timestamp: string };

/**
 * Status "de exibição" de um item do histórico.
 * Sessão de mesa só entra no histórico depois de fechada => concluída.
 */
export function statusBucketOf(item: FilterableHistoryItem): HistoryStatusFilter {
  if (item.kind === 'mesa') return 'concluido';
  switch (item.entry.status) {
    case 'cancelado':
      return 'cancelado';
    case 'entregue':
      return 'concluido';
    case 'pronto':
      return 'pronto';
    case 'preparando':
    case 'confirmado':
      return 'preparo';
    case 'pendente':
    case 'aguardando_pagamento':
    default:
      return 'pendente';
  }
}

export function typeBucketOf(item: FilterableHistoryItem): Exclude<HistoryTypeFilter, 'todos'> {
  if (item.kind === 'mesa') return 'mesa';
  switch (item.entry.orderType) {
    case 'entrega':
      return 'delivery';
    case 'mesa':
      return 'mesa';
    case 'balcao':
    default:
      return 'retirada';
  }
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** yyyy-mm-dd -> Date local (sem o deslocamento de fuso do `new Date('yyyy-mm-dd')`). */
export function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Intervalo [from, to] em ms para o período escolhido; null = sem limite. */
export function periodRange(
  filters: Pick<HistoryFilters, 'period' | 'dateFrom' | 'dateTo'>,
  now: Date = new Date(),
): { from: number | null; to: number | null } {
  switch (filters.period) {
    case 'hoje':
      return { from: startOfDay(now).getTime(), to: endOfDay(now).getTime() };
    case '7dias': {
      const from = startOfDay(now);
      from.setDate(from.getDate() - 6); // hoje + 6 dias anteriores = 7 dias corridos
      return { from: from.getTime(), to: endOfDay(now).getTime() };
    }
    case '30dias': {
      const from = startOfDay(now);
      from.setDate(from.getDate() - 29);
      return { from: from.getTime(), to: endOfDay(now).getTime() };
    }
    case 'personalizado': {
      const from = parseLocalDate(filters.dateFrom);
      const to = parseLocalDate(filters.dateTo);
      return {
        from: from ? startOfDay(from).getTime() : null,
        to: to ? endOfDay(to).getTime() : null,
      };
    }
    case 'todos':
    default:
      return { from: null, to: null };
  }
}

/** Intervalo personalizado invertido (inicial > final). */
export function isCustomRangeInvalid(
  filters: Pick<HistoryFilters, 'period' | 'dateFrom' | 'dateTo'>,
): boolean {
  if (filters.period !== 'personalizado') return false;
  const from = parseLocalDate(filters.dateFrom);
  const to = parseLocalDate(filters.dateTo);
  return Boolean(from && to && from.getTime() > to.getTime());
}

export function matchesStatus(item: FilterableHistoryItem, status: HistoryStatusFilter): boolean {
  return status === 'todos' || statusBucketOf(item) === status;
}

export function matchesType(item: FilterableHistoryItem, type: HistoryTypeFilter): boolean {
  return type === 'todos' || typeBucketOf(item) === type;
}

export function matchesPeriod(
  item: FilterableHistoryItem,
  filters: Pick<HistoryFilters, 'period' | 'dateFrom' | 'dateTo'>,
  now: Date = new Date(),
): boolean {
  const { from, to } = periodRange(filters, now);
  if (from === null && to === null) return true;
  const ts = new Date(item.timestamp).getTime();
  if (Number.isNaN(ts)) return false;
  if (from !== null && ts < from) return false;
  if (to !== null && ts > to) return false;
  return true;
}

/** Aplica os três filtros em conjunto (E lógico). */
export function applyHistoryFilters<T extends FilterableHistoryItem>(
  items: T[],
  filters: HistoryFilters,
  now: Date = new Date(),
): T[] {
  if (isCustomRangeInvalid(filters)) return [];
  return items.filter(
    (item) =>
      matchesStatus(item, filters.status) &&
      matchesType(item, filters.type) &&
      matchesPeriod(item, filters, now),
  );
}

/**
 * Contagem por opção de um eixo, respeitando os OUTROS eixos já escolhidos
 * (assim o número ao lado de cada chip é o que a pessoa veria ao clicar nele).
 */
export function countByOption<T extends FilterableHistoryItem>(
  items: T[],
  filters: HistoryFilters,
  axis: 'status' | 'type',
  now: Date = new Date(),
): Record<string, number> {
  const counts: Record<string, number> = {};
  const options = axis === 'status' ? STATUS_OPTIONS : TYPE_OPTIONS;
  for (const option of options) {
    const probe: HistoryFilters = { ...filters, [axis]: option.key };
    counts[option.key] = applyHistoryFilters(items, probe, now).length;
  }
  return counts;
}

export function hasActiveFilters(filters: HistoryFilters): boolean {
  return (
    filters.status !== 'todos' ||
    filters.type !== 'todos' ||
    filters.period !== 'todos'
  );
}
