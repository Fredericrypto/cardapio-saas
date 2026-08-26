import type { CustomerOrderHistoryItem } from './customer-api';

export interface MesaHistoryEntry {
  kind: 'mesa';
  sessionId: string;
  tableNumber: string | null;
  sessionStatus: 'aberta' | 'fechamento_solicitado' | 'fechada';
  dateForGrouping: string;
  orderCount: number;
  total: number;
  tipAmount: number;
}

export interface AvulsoHistoryEntry {
  kind: 'avulso';
  orderId: string;
  orderType: 'balcao' | 'entrega';
  status: string;
  createdAt: string;
  total: number;
  tipAmount: number;
  items: { productName: string; quantity: number }[];
}

export type HistoryEntry = MesaHistoryEntry | AvulsoHistoryEntry;

export interface DayGroup {
  dateKey: string;
  label: string;
  mesaItems: MesaHistoryEntry[];
  avulsoItems: AvulsoHistoryEntry[];
}

// Pedidos de mesa são agrupados por sessão (uma "visita" à mesa pode ter
// vários pedidos separados ao longo da refeição) — igual ao histórico do
// admin, pra bater exatamente com o mesmo cupom quando comparado. Pedidos
// avulsos (balcão/entrega) continuam um-a-um, sem sessão.
export function groupCustomerOrders(orders: CustomerOrderHistoryItem[]): HistoryEntry[] {
  const mesaGroups = new Map<string, MesaHistoryEntry>();
  const avulsoEntries: AvulsoHistoryEntry[] = [];

  for (const order of orders) {
    if (order.orderType === 'mesa' && order.tableSessionId) {
      const existing = mesaGroups.get(order.tableSessionId);
      const orderTotal = Number(order.status === 'cancelado' ? 0 : order.total);
      if (existing) {
        existing.orderCount += 1;
        existing.total += orderTotal;
        if (new Date(order.createdAt) > new Date(existing.dateForGrouping)) {
          existing.dateForGrouping = order.tableSession?.closedAt ?? order.createdAt;
        }
      } else {
        mesaGroups.set(order.tableSessionId, {
          kind: 'mesa',
          sessionId: order.tableSessionId,
          tableNumber: order.tableSession?.table?.number ?? null,
          sessionStatus: order.tableSession?.status ?? 'aberta',
          dateForGrouping: order.tableSession?.closedAt ?? order.createdAt,
          orderCount: 1,
          total: orderTotal,
          tipAmount: Number(order.tableSession?.tipAmount ?? 0),
        });
      }
    } else {
      avulsoEntries.push({
        kind: 'avulso',
        orderId: order.id,
        orderType: order.orderType === 'entrega' ? 'entrega' : 'balcao',
        status: order.status,
        createdAt: order.createdAt,
        total: Number(order.total),
        tipAmount: Number(order.tipAmount),
        items: order.items.map((i) => ({ productName: i.productName, quantity: i.quantity })),
      });
    }
  }

  return [...mesaGroups.values(), ...avulsoEntries];
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dayKeyAndLabel(dateStr: string): { key: string; label: string } {
  const d = new Date(dateStr);
  const key = d.toISOString().slice(0, 10);
  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);

  if (isSameDay(d, now)) return { key, label: 'Hoje' };
  if (isSameDay(d, yesterday)) return { key, label: 'Ontem' };
  return {
    key,
    label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
  };
}

export function groupEntriesByDay(entries: HistoryEntry[]): DayGroup[] {
  const groupsByKey = new Map<string, DayGroup>();
  const sorted = [...entries].sort((a, b) => {
    const dateA = a.kind === 'mesa' ? a.dateForGrouping : a.createdAt;
    const dateB = b.kind === 'mesa' ? b.dateForGrouping : b.createdAt;
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });

  for (const entry of sorted) {
    const dateStr = entry.kind === 'mesa' ? entry.dateForGrouping : entry.createdAt;
    const { key, label } = dayKeyAndLabel(dateStr);
    let group = groupsByKey.get(key);
    if (!group) {
      group = { dateKey: key, label, mesaItems: [], avulsoItems: [] };
      groupsByKey.set(key, group);
    }
    if (entry.kind === 'mesa') group.mesaItems.push(entry);
    else group.avulsoItems.push(entry);
  }

  return Array.from(groupsByKey.values());
}

export function formatMoney(value: number): string {
  return `R$ ${Number(value).toFixed(2).replace('.', ',')}`;
}

export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
