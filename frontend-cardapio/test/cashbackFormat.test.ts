import assert from 'node:assert/strict';
import { categorizeCashback, formatCashbackExpiry, formatDateTimeBR, isExpiringWithin24h } from '../src/lib/cashbackFormat';
import type { CashbackHistoryEntry } from '../src/lib/customer-api';

// "agora": 08/10/2026 12:00 em Brasília (UTC-3 => 15:00Z)
const now = Date.parse('2026-10-08T15:00:00Z');
const h = (hours: number) => new Date(now + hours * 3_600_000).toISOString();

// Formato exato pedido: "Vence dia 13/09/2026 às 16:00" (16:00 de Brasília = 19:00Z)
assert.equal(formatCashbackExpiry('2026-09-13T19:00:00Z', Date.parse('2026-09-01T00:00:00Z')), 'Vence dia 13/09/2026 às 16:00');
// o fuso é o do estabelecimento, não o do aparelho (mesmo instante, independente do TZ do processo)
assert.equal(formatDateTimeBR('2026-10-09T02:30:00Z'), '08/10/2026 às 23:30');
assert.equal(formatDateTimeBR('2026-10-09T03:00:00Z'), '09/10/2026 às 00:00'); // meia-noite: h23, nunca "24:00"
// >= 24h exatos ainda é data; < 24h vira contagem
assert.equal(formatCashbackExpiry(h(24), now), `Vence dia ${formatDateTimeBR(h(24))}`);
assert.equal(formatCashbackExpiry(h(23) , now), 'Vence em 23h 0min');
assert.equal(formatCashbackExpiry(new Date(now + 5 * 3_600_000 + 20 * 60_000).toISOString(), now), 'Vence em 5h 20min');
assert.equal(formatCashbackExpiry(new Date(now + 12 * 60_000 + 30_000).toISOString(), now), 'Vence em 12 min');
assert.equal(formatCashbackExpiry(new Date(now + 10_000).toISOString(), now), 'Vence em 1 min'); // nunca "0 min"
assert.ok(formatCashbackExpiry(h(-1), now).startsWith('Venceu dia '));
assert.ok(isExpiringWithin24h(h(23), now) && !isExpiringWithin24h(h(24), now) && !isExpiringWithin24h(h(-1), now));

const e = (id: string, o: Partial<CashbackHistoryEntry>): CashbackHistoryEntry =>
  ({ id, type: 'earned', amount: 10, description: 'x', createdAt: h(-100), ...o }) as CashbackHistoryEntry;
const hist: CashbackHistoryEntry[] = [
  e('a', { remainingAmount: 5, expiresAt: h(48) }),
  e('b', { remainingAmount: 5, expiresAt: h(2) }),       // vence primeiro
  e('c', { remainingAmount: 5, expiresAt: null }),       // sem validade
  e('d', { remainingAmount: 3, expiresAt: h(-5), expired: true }),
  e('d2', { remainingAmount: 3, expiresAt: h(-1) }),     // venceu pelo relógio mesmo sem o flag
  e('f', { remainingAmount: 0, expiresAt: h(-9) }),      // gasto por completo: nenhuma aba de saldo
  { id: 's1', type: 'spent', amount: 4, description: 'u', createdAt: h(-10), orderTotal: 40, establishmentName: 'Loja' },
  { id: 's2', type: 'spent', amount: 2, description: 'u', createdAt: h(-3), orderTotal: 20, establishmentName: 'Loja' },
];
const c = categorizeCashback(hist, now);
assert.deepEqual(c.disponiveis.map((x) => x.id), ['b', 'a', 'c']);
assert.deepEqual(c.expirados.map((x) => x.id), ['d2', 'd']);
assert.deepEqual(c.utilizados.map((x) => x.id), ['s2', 's1']);
console.log('cashbackFormat: todas as verificacoes passaram');
