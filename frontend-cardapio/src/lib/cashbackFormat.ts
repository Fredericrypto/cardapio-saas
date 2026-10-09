import type { CashbackHistoryEntry } from './customer-api';

// Fuso oficial do estabelecimento (o projeto inteiro opera em Brasília; não há
// fuso por loja no cadastro). Toda data/hora do cashback é exibida NELE,
// independente do fuso do aparelho do cliente.
export const STORE_TIME_ZONE = 'America/Sao_Paulo';

const DAY_MS = 24 * 60 * 60 * 1000;

function parts(date: Date, timeZone: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = p.value;
  }
  return out;
}

/** "13/09/2026" no fuso do estabelecimento. */
export function formatDateBR(iso: string, timeZone: string = STORE_TIME_ZONE): string {
  const p = parts(new Date(iso), timeZone);
  return `${p.day}/${p.month}/${p.year}`;
}

/** "16:00" no fuso do estabelecimento. */
export function formatTimeBR(iso: string, timeZone: string = STORE_TIME_ZONE): string {
  const p = parts(new Date(iso), timeZone);
  return `${p.hour}:${p.minute}`;
}

/** "13/09/2026 às 16:00". */
export function formatDateTimeBR(iso: string, timeZone: string = STORE_TIME_ZONE): string {
  return `${formatDateBR(iso, timeZone)} às ${formatTimeBR(iso, timeZone)}`;
}

/** Falta menos de 24h (e ainda não venceu)? */
export function isExpiringWithin24h(expiresAtIso: string, now: number): boolean {
  const ms = new Date(expiresAtIso).getTime() - now;
  return ms > 0 && ms < DAY_MS;
}

/**
 * Texto de validade do cashback.
 *  - 24h ou mais:  "Vence dia 13/09/2026 às 16:00"
 *  - menos de 24h: "Vence em 5h 20min" (ou "Vence em 12 min")
 *  - já venceu:    "Venceu dia 13/09/2026 às 16:00"
 */
export function formatCashbackExpiry(
  expiresAtIso: string,
  now: number = Date.now(),
  timeZone: string = STORE_TIME_ZONE,
): string {
  const ms = new Date(expiresAtIso).getTime() - now;
  if (ms <= 0) return `Venceu dia ${formatDateTimeBR(expiresAtIso, timeZone)}`;
  if (ms < DAY_MS) {
    const totalMin = Math.max(1, Math.floor(ms / 60_000));
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h > 0 ? `Vence em ${h}h ${m}min` : `Vence em ${m} min`;
  }
  return `Vence dia ${formatDateTimeBR(expiresAtIso, timeZone)}`;
}

export type CashbackTab = 'disponiveis' | 'expirados' | 'utilizados';

export interface CategorizedCashback {
  disponiveis: CashbackHistoryEntry[];
  expirados: CashbackHistoryEntry[];
  utilizados: CashbackHistoryEntry[];
}

/**
 * Separa o extrato nas três abas.
 *  - Disponíveis: crédito com saldo restante que ainda não venceu;
 *  - Expirados: crédito que venceu com saldo não usado (mais recente primeiro);
 *  - Utilizados: resgates (spent), mais recente primeiro.
 * Crédito totalmente gasto não aparece em Disponíveis nem Expirados — o uso
 * dele já está em Utilizados.
 */
export function categorizeCashback(history: CashbackHistoryEntry[], now: number = Date.now()): CategorizedCashback {
  const disponiveis: CashbackHistoryEntry[] = [];
  const expirados: CashbackHistoryEntry[] = [];
  const utilizados: CashbackHistoryEntry[] = [];
  for (const e of history) {
    if (e.type === 'spent') {
      utilizados.push(e);
      continue;
    }
    const remaining = Number(e.remainingAmount ?? 0);
    if (remaining <= 0) continue;
    const expiredByClock = e.expiresAt != null && new Date(e.expiresAt).getTime() <= now;
    if (e.expired || expiredByClock) expirados.push(e);
    else disponiveis.push(e);
  }
  // Disponíveis: o que vence primeiro no topo (sem validade por último).
  disponiveis.sort((a, b) => {
    const ta = a.expiresAt ? new Date(a.expiresAt).getTime() : Number.POSITIVE_INFINITY;
    const tb = b.expiresAt ? new Date(b.expiresAt).getTime() : Number.POSITIVE_INFINITY;
    return ta - tb;
  });
  const byExpiredDesc = (a: CashbackHistoryEntry, b: CashbackHistoryEntry) =>
    new Date(b.expiresAt ?? b.createdAt).getTime() - new Date(a.expiresAt ?? a.createdAt).getTime();
  expirados.sort(byExpiredDesc);
  utilizados.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return { disponiveis, expirados, utilizados };
}

export function formatBRL(value: number | string | null | undefined): string {
  return `R$ ${Number(value ?? 0).toFixed(2).replace('.', ',')}`;
}
