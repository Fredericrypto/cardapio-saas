import assert from 'node:assert/strict';
import {
  applyHistoryFilters, countByOption, DEFAULT_HISTORY_FILTERS, periodRange, isCustomRangeInvalid,
  type FilterableHistoryItem,
} from '../src/lib/historyFilters';

const now = new Date(2026, 9, 8, 15, 0, 0); // 08/10/2026 15:00 local
const at = (d: number, m: number, h = 12) => new Date(2026, m - 1, d, h).toISOString();
const avulso = (orderType: 'balcao'|'mesa'|'entrega', status: string, ts: string): FilterableHistoryItem =>
  ({ kind: 'avulso', timestamp: ts, entry: { orderType, status } as never });
const mesa = (ts: string): FilterableHistoryItem => ({ kind: 'mesa', timestamp: ts, entry: {} as never });

const items: FilterableHistoryItem[] = [
  avulso('entrega', 'entregue', at(8, 10)),    // hoje
  avulso('balcao', 'cancelado', at(5, 10)),    // 3 dias
  mesa(at(1, 10)),                             // 7 dias atrás -> fora de 7dias (hoje-6 = 02/10)
  avulso('entrega', 'entregue', at(2, 10, 0)), // 02/10 00:00 -> dentro de 7 dias
  avulso('mesa', 'pendente', at(20, 9)),       // 18 dias
  avulso('balcao', 'preparando', at(1, 8)),    // fora de 30 dias
];
const F = (o: Partial<typeof DEFAULT_HISTORY_FILTERS>) => ({ ...DEFAULT_HISTORY_FILTERS, ...o });
const n = (f: ReturnType<typeof F>) => applyHistoryFilters(items, f, now).length;

assert.equal(n(F({})), 6);
assert.equal(n(F({ period: 'hoje' })), 1);
assert.equal(n(F({ period: '7dias' })), 3);       // 08/10, 05/10, 02/10
assert.equal(n(F({ period: '30dias' })), 5);      // 09/09 e 20/09 dentro? 30 dias = 09/09..08/10
assert.equal(n(F({ status: 'concluido' })), 3);   // entregue, mesa, entregue
assert.equal(n(F({ status: 'cancelado' })), 1);
assert.equal(n(F({ status: 'pendente' })), 1);
assert.equal(n(F({ status: 'preparo' })), 1);
assert.equal(n(F({ status: 'pronto' })), 0);
assert.equal(n(F({ type: 'delivery' })), 2);
assert.equal(n(F({ type: 'retirada' })), 2);
assert.equal(n(F({ type: 'mesa' })), 2);
// combinados
assert.equal(n(F({ type: 'delivery', status: 'concluido', period: '7dias' })), 2);
assert.equal(n(F({ type: 'delivery', status: 'cancelado' })), 0);
// personalizado
assert.equal(n(F({ period: 'personalizado', dateFrom: '2026-10-01', dateTo: '2026-10-05' })), 3);
assert.equal(n(F({ period: 'personalizado', dateFrom: '2026-10-05', dateTo: '' })), 2);
assert.equal(n(F({ period: 'personalizado', dateFrom: '', dateTo: '' })), 6);
assert.equal(n(F({ period: 'personalizado', dateFrom: '2026-10-08', dateTo: '2026-10-01' })), 0);
assert.equal(isCustomRangeInvalid(F({ period: 'personalizado', dateFrom: '2026-10-08', dateTo: '2026-10-01' })), true);
// contagens respeitam os outros eixos
const c = countByOption(items, F({ type: 'delivery' }), 'status', now);
assert.equal(c.todos, 2); assert.equal(c.concluido, 2); assert.equal(c.cancelado, 0);
assert.equal(periodRange(F({ period: 'hoje' }), now).from, new Date(2026, 9, 8).getTime());
console.log('historyFilters: todas as verificacoes passaram');
