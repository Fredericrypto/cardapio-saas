// Regra "uma conta, uma mesa" no banco — testes em POSTGRES REAL, com concorrência de verdade.
//   Rodar (banco de TESTE):  DATABASE_URL=postgres://.../cardapio_test npx ts-node --transpile-only test/table-seat-audit.ts
//
// Cria um SCHEMA temporário só com as 3 tabelas que a regra usa (mesmas colunas/índices das migrations) e
// o apaga no fim: não toca em nenhuma tabela real. Cada transação usa uma CONEXÃO própria (Pool), então as
// corridas são reais (processos de servidor distintos disputando as mesmas linhas e a mesma trava).
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { Pool, PoolClient } from 'pg';
import { assertTestDatabase } from './helpers';
import {
  SeatRuleError,
  SeatDb,
  accountLockKey,
  bindGuestSeat,
  claimSeat,
  findSeatInvariantViolations,
  mapSeatDbError,
} from '../src/modules/tables/table-seat-rules';

assertTestDatabase();
const SCHEMA = 'seat_audit_' + randomUUID().replace(/-/g, '').slice(0, 10);
const pool = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${SCHEMA}`, max: 24 });

let pass = 0;
let fail = 0;
async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    pass++;
    console.log('  OK    ' + name);
  } catch (e) {
    fail++;
    console.log('  FALHA ' + name + '\n        ' + String((e as Error).stack ?? e).split('\n').slice(0, 6).join('\n        '));
  }
}

const dbOf = (c: PoolClient): SeatDb => ({ query: async (sql, params) => (await c.query(sql, params as unknown[])).rows });
async function inTx<T>(fn: (db: SeatDb) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const out = await fn(dbOf(c));
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => undefined);
    throw mapSeatDbError(e);
  } finally {
    c.release();
  }
}
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;

// ------------------------------------------------------------------ fixtures
const T1 = randomUUID();
const T2 = randomUUID();
async function session(o: { tenant?: string; table?: string; status?: string; openedBy?: string | null; deleted?: boolean } = {}): Promise<{ id: string; table: string }> {
  const table = o.table ?? randomUUID();
  const r = await q(
    `INSERT INTO table_sessions (tenant_id, table_id, status, opened_by_customer_id, deleted_at) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [o.tenant ?? T1, table, o.status ?? 'aberta', o.openedBy ?? null, o.deleted ? new Date() : null],
  );
  return { id: r[0].id, table };
}
async function seat(sessionId: string, o: { customer?: string | null; left?: boolean; joinedAt?: Date } = {}): Promise<string> {
  const r = await q(
    `INSERT INTO table_session_participants (table_session_id, customer_id, seat_token, left_at, joined_at) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [sessionId, o.customer ?? null, randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, ''), o.left ? new Date() : null, o.joinedAt ?? new Date()],
  );
  return r[0].id;
}
async function order(sessionId: string, status = 'pendente', customer: string | null = null): Promise<void> {
  await q(`INSERT INTO orders (table_session_id, customer_id, status) VALUES ($1,$2,$3)`, [sessionId, customer, status]);
}
async function snapshot(): Promise<string> {
  const a = await q(`SELECT * FROM table_sessions ORDER BY id`);
  const b = await q(`SELECT * FROM table_session_participants ORDER BY id`);
  const c = await q(`SELECT * FROM orders ORDER BY id`);
  return JSON.stringify([a, b, c]);
}
async function activeSeatsOf(customer: string, tenant = T1): Promise<number> {
  const r = await q(
    `SELECT count(*)::int AS n FROM table_session_participants p JOIN table_sessions s ON s.id = p.table_session_id
      WHERE p.customer_id = $1 AND p.left_at IS NULL AND s.tenant_id = $2 AND s.status IN ('aberta','fechamento_solicitado') AND s.deleted_at IS NULL`,
    [customer, tenant],
  );
  return r[0].n;
}
async function rejects(fn: () => Promise<unknown>, code: string): Promise<SeatRuleError> {
  try {
    await fn();
  } catch (e) {
    assert.ok(e instanceof SeatRuleError, 'esperava SeatRuleError, veio: ' + String(e));
    assert.equal(e.code, code);
    return e;
  }
  assert.fail('devia ter recusado com ' + code);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  await pool.query(`CREATE SCHEMA ${SCHEMA}`);
  await pool.query(`
    CREATE TABLE table_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, table_id uuid NOT NULL,
      status varchar(30) NOT NULL DEFAULT 'aberta', opened_at timestamptz NOT NULL DEFAULT now(),
      opened_by_customer_id uuid, closed_at timestamptz, closed_reason varchar(30), deleted_at timestamptz);
    CREATE UNIQUE INDEX "IDX_table_sessions_one_active_per_table" ON table_sessions (table_id) WHERE status <> 'fechada' AND deleted_at IS NULL;
    CREATE TABLE table_session_participants (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), table_session_id uuid NOT NULL REFERENCES table_sessions(id),
      customer_id uuid, seat_token varchar(64) NOT NULL, joined_at timestamptz NOT NULL DEFAULT now(), left_at timestamptz,
      CONSTRAINT "UQ_table_session_participant" UNIQUE (table_session_id, customer_id));
    CREATE UNIQUE INDEX "UQ_tsp_seat_token" ON table_session_participants (seat_token);
    CREATE TABLE orders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), table_session_id uuid, table_participant_id uuid, customer_id uuid,
      status varchar(30) NOT NULL DEFAULT 'pendente', deleted_at timestamptz);`);

  console.log('[incidente] conta com pedido numa mesa NÃO pode ganhar assento em outra');
  await test('INCIDENTE: convidado da mesa B faz login numa conta com pedido na mesa A → adoção recusada e assento do convidado preservado', async () => {
    const x = randomUUID();
    const a = await session({ openedBy: x });
    await seat(a.id, { customer: x });
    await order(a.id, 'pendente', x);
    const b = await session();
    const guest = await seat(b.id);
    const before = await snapshot();
    const err = await rejects(() => inTx((db) => bindGuestSeat(db, { tenantId: T1, customerId: x, seatId: guest })), 'SEATED_ELSEWHERE');
    assert.deepEqual((err.details.sessionIds as string[]), [a.id]);
    assert.equal(await snapshot(), before, 'nada pode ter mudado (assento do convidado intacto)');
    assert.equal(await activeSeatsOf(x), 1);
  });
  await test('entrar/criar assento por qualquer outro caminho (claimSeat) também é recusado', async () => {
    const x = randomUUID();
    const a = await session({ openedBy: x });
    await seat(a.id, { customer: x });
    await order(a.id, 'pronto', x);
    const before = await snapshot();
    await rejects(() => inTx((db) => claimSeat(db, { tenantId: T1, customerId: x, tableId: randomUUID() })), 'SEATED_ELSEWHERE');
    assert.equal(await snapshot(), before);
  });
  await test('o detector de violação enxerga o padrão do incidente (2 assentos ativos) e o claim impede que ele nasça', async () => {
    const x = randomUUID();
    const a = await session({ openedBy: x });
    const b = await session();
    await seat(a.id, { customer: x });
    await order(a.id, 'pendente', x);
    const guest = await seat(b.id);
    await rejects(() => inTx((db) => bindGuestSeat(db, { tenantId: T1, customerId: x, seatId: guest })), 'SEATED_ELSEWHERE');
    const viaPool: SeatDb = { query: async (s, p) => (await pool.query(s, p as unknown[])).rows };
    assert.equal((await findSeatInvariantViolations(viaPool)).filter((v) => v.customer_id === x).length, 0);
    await seat(b.id, { customer: x }); // forja o estado que o código antigo permitia
    const v = (await findSeatInvariantViolations(viaPool)).filter((r) => r.customer_id === x);
    assert.equal(v.length, 1);
    assert.equal(v[0].active_seats, 2);
  });

  console.log('\n[regras] o que bloqueia, o que libera');
  await test('pedido CANCELADO não bloqueia (sessão vazia própria é liberada e fechada)', async () => {
    const x = randomUUID();
    const a = await session({ openedBy: x });
    const sa = await seat(a.id, { customer: x });
    await order(a.id, 'cancelado', x);
    const r = await inTx((db) => claimSeat(db, { tenantId: T1, customerId: x, tableId: randomUUID() }));
    assert.deepEqual(r.releasedSeatIds, [sa]);
    assert.deepEqual(r.closedSessionIds, [a.id]);
    const s = (await q(`SELECT status, closed_reason, closed_at FROM table_sessions WHERE id = $1`, [a.id]))[0];
    assert.equal(s.status, 'fechada');
    assert.equal(s.closed_reason, 'saida_sem_pedido');
    assert.ok(s.closed_at);
  });
  await test('sessão vazia própria COM outro participante: libera só o assento da conta; a sessão continua aberta', async () => {
    const x = randomUUID();
    const a = await session({ openedBy: x });
    await seat(a.id, { customer: x });
    await seat(a.id); // convidado que ficou
    const r = await inTx((db) => claimSeat(db, { tenantId: T1, customerId: x, tableId: randomUUID() }));
    assert.equal(r.closedSessionIds.length, 0);
    assert.equal((await q(`SELECT status FROM table_sessions WHERE id = $1`, [a.id]))[0].status, 'aberta');
    assert.equal(await activeSeatsOf(x), 0);
  });
  await test('participante (não dono) de sessão vazia de outra pessoa: bloqueia (regra mantida do código anterior)', async () => {
    const x = randomUUID();
    const a = await session({ openedBy: randomUUID() });
    await seat(a.id, { customer: x });
    await rejects(() => inTx((db) => claimSeat(db, { tenantId: T1, customerId: x, tableId: randomUUID() })), 'SEATED_ELSEWHERE');
  });
  await test('pedido ativo de OUTRA pessoa na sessão (conta é dona): bloqueia', async () => {
    const x = randomUUID();
    const a = await session({ openedBy: x });
    await seat(a.id, { customer: x });
    await order(a.id, 'pendente', randomUUID());
    await rejects(() => inTx((db) => claimSeat(db, { tenantId: T1, customerId: x, tableId: randomUUID() })), 'SEATED_ELSEWHERE');
  });
  await test('regra do dono: abriu a sessão, já saiu do assento, mas a sessão tem pedido ativo → bloqueia', async () => {
    const x = randomUUID();
    const a = await session({ openedBy: x });
    await seat(a.id, { customer: x, left: true });
    await order(a.id, 'pendente', randomUUID());
    await rejects(() => inTx((db) => claimSeat(db, { tenantId: T1, customerId: x, tableId: randomUUID() })), 'SEATED_ELSEWHERE');
  });
  await test('fechamento solicitado (mesmo sem pedido) bloqueia', async () => {
    const x = randomUUID();
    const a = await session({ openedBy: x, status: 'fechamento_solicitado' });
    await seat(a.id, { customer: x });
    await rejects(() => inTx((db) => claimSeat(db, { tenantId: T1, customerId: x, tableId: randomUUID() })), 'SEATED_ELSEWHERE');
  });
  await test('sessões expirada/fechada, soft-deletada e assento que já saiu NÃO contam', async () => {
    const x = randomUUID();
    for (const st of ['expirada', 'fechada']) {
      const s = await session({ openedBy: x, status: st });
      await seat(s.id, { customer: x });
      await order(s.id, 'pendente', x);
    }
    const d = await session({ openedBy: x, deleted: true });
    await seat(d.id, { customer: x });
    const l = await session({ openedBy: x });
    await seat(l.id, { customer: x, left: true });
    const r = await inTx((db) => claimSeat(db, { tenantId: T1, customerId: x, tableId: randomUUID() }));
    assert.deepEqual(r, { releasedSeatIds: [], closedSessionIds: [] });
  });
  await test('TUDO OU NADA: uma sessão liberável + uma que bloqueia → nada é liberado', async () => {
    const x = randomUUID();
    const a = await session({ openedBy: x });
    await seat(a.id, { customer: x });
    const b = await session({ openedBy: x });
    await seat(b.id, { customer: x });
    await order(b.id, 'pendente', x);
    const before = await snapshot();
    await rejects(() => inTx((db) => claimSeat(db, { tenantId: T1, customerId: x, tableId: randomUUID() })), 'SEATED_ELSEWHERE');
    assert.equal(await snapshot(), before);
  });
  await test('isolamento entre restaurantes: pedido no restaurante 1 não bloqueia assento no restaurante 2; assento de outro restaurante é recusado', async () => {
    const x = randomUUID();
    const a = await session({ tenant: T1, openedBy: x });
    await seat(a.id, { customer: x });
    await order(a.id, 'pendente', x);
    await inTx((db) => claimSeat(db, { tenantId: T2, customerId: x, tableId: randomUUID() }));
    const b = await session({ tenant: T1 });
    const guest = await seat(b.id);
    await rejects(() => inTx((db) => bindGuestSeat(db, { tenantId: T2, customerId: x, seatId: guest })), 'SEAT_FOREIGN');
  });

  console.log('\n[adoção] bindGuestSeat: idempotência, mesclagem, reativação');
  await test('adoção válida liga o assento e torna a conta dona da sessão aberta por convidado', async () => {
    const x = randomUUID();
    const b = await session({ openedBy: null });
    const guest = await seat(b.id);
    const r = await inTx((db) => bindGuestSeat(db, { tenantId: T1, customerId: x, seatId: guest }));
    assert.equal(r.kind, 'bound');
    assert.equal((await q(`SELECT customer_id FROM table_session_participants WHERE id = $1`, [guest]))[0].customer_id, x);
    assert.equal((await q(`SELECT opened_by_customer_id AS o FROM table_sessions WHERE id = $1`, [b.id]))[0].o, x);
  });
  await test('repetir a adoção é idempotente (retry/duplo clique): 2ª chamada devolve "already" sem alterar nada', async () => {
    const x = randomUUID();
    const b = await session();
    const guest = await seat(b.id);
    await inTx((db) => bindGuestSeat(db, { tenantId: T1, customerId: x, seatId: guest }));
    const before = await snapshot();
    const r = await inTx((db) => bindGuestSeat(db, { tenantId: T1, customerId: x, seatId: guest }));
    assert.equal(r.kind, 'already');
    assert.equal(await snapshot(), before);
  });
  await test('conta já sentada na MESMA sessão: o assento do convidado é encerrado (sem presença duplicada) e devolve o da conta', async () => {
    const x = randomUUID();
    const b = await session();
    const mine = await seat(b.id, { customer: x });
    const guest = await seat(b.id);
    const r = await inTx((db) => bindGuestSeat(db, { tenantId: T1, customerId: x, seatId: guest }));
    assert.equal(r.kind, 'merged');
    assert.equal(r.seatId, mine);
    assert.ok((await q(`SELECT left_at FROM table_session_participants WHERE id = $1`, [guest]))[0].left_at);
    assert.equal((await q(`SELECT left_at FROM table_session_participants WHERE id = $1`, [mine]))[0].left_at, null);
  });
  await test('conta que já saíra desta sessão: assento REATIVADO com token novo (64 hex) e o do convidado encerrado', async () => {
    const x = randomUUID();
    const b = await session();
    const old = await seat(b.id, { customer: x, left: true });
    const guest = await seat(b.id);
    const oldToken = (await q(`SELECT seat_token FROM table_session_participants WHERE id = $1`, [old]))[0].seat_token;
    const r = await inTx((db) => bindGuestSeat(db, { tenantId: T1, customerId: x, seatId: guest }));
    assert.equal(r.kind, 'reactivated');
    if (r.kind !== 'reactivated') return;
    assert.equal(r.seatId, old);
    assert.match(r.seatToken, /^[0-9a-f]{64}$/);
    assert.notEqual(r.seatToken, oldToken);
    assert.equal((await q(`SELECT left_at FROM table_session_participants WHERE id = $1`, [old]))[0].left_at, null);
  });
  await test('assento de outra conta, que já saiu ou de sessão encerrada: recusado com código próprio e sem alterar nada', async () => {
    const x = randomUUID();
    const b = await session();
    const theirs = await seat(b.id, { customer: randomUUID() });
    const gone = await seat(b.id, { left: true });
    const closed = await session({ status: 'fechada' });
    const inClosed = await seat(closed.id);
    const before = await snapshot();
    await rejects(() => inTx((db) => bindGuestSeat(db, { tenantId: T1, customerId: x, seatId: theirs })), 'SEAT_NOT_GUEST');
    await rejects(() => inTx((db) => bindGuestSeat(db, { tenantId: T1, customerId: x, seatId: gone })), 'SEAT_GONE');
    await rejects(() => inTx((db) => bindGuestSeat(db, { tenantId: T1, customerId: x, seatId: inClosed })), 'SEAT_GONE');
    await rejects(() => inTx((db) => bindGuestSeat(db, { tenantId: T1, customerId: x, seatId: randomUUID() })), 'SEAT_GONE');
    assert.equal(await snapshot(), before);
  });

  console.log('\n[concorrência] conexões distintas disputando de verdade');
  await test('A MESMA conta adota dois assentos em mesas diferentes ao mesmo tempo, ambas COM pedido (30 rodadas): exatamente 1 vence', async () => {
    for (let i = 0; i < 30; i++) {
      const x = randomUUID();
      const b = await session();
      const c = await session();
      await order(b.id, 'pendente', randomUUID());
      await order(c.id, 'pendente', randomUUID());
      const gb = await seat(b.id);
      const gc = await seat(c.id);
      const res = await Promise.allSettled([
        inTx((db) => bindGuestSeat(db, { tenantId: T1, customerId: x, seatId: gb })),
        inTx((db) => bindGuestSeat(db, { tenantId: T1, customerId: x, seatId: gc })),
      ]);
      const ok = res.filter((r) => r.status === 'fulfilled').length;
      const refused = res.filter((r) => r.status === 'rejected' && (r.reason as SeatRuleError).code === 'SEATED_ELSEWHERE').length;
      assert.equal(ok, 1, `rodada ${i}: ${JSON.stringify(res.map((r) => r.status))}`);
      assert.equal(refused, 1, `rodada ${i}`);
      assert.equal(await activeSeatsOf(x), 1, `rodada ${i}: a conta ficou com ${await activeSeatsOf(x)} assentos`);
    }
  });
  await test('8 adoções simultâneas da mesma conta em 8 mesas COM pedido: 1 vence, 7 recusadas, 1 assento ativo (10 rodadas)', async () => {
    for (let i = 0; i < 10; i++) {
      const x = randomUUID();
      const guests: string[] = [];
      for (let k = 0; k < 8; k++) {
        const s = await session();
        await order(s.id, 'pendente', randomUUID());
        guests.push(await seat(s.id));
      }
      const res = await Promise.allSettled(guests.map((g) => inTx((db) => bindGuestSeat(db, { tenantId: T1, customerId: x, seatId: g }))));
      assert.equal(res.filter((r) => r.status === 'fulfilled').length, 1, `rodada ${i}`);
      assert.equal(res.filter((r) => r.status === 'rejected' && (r.reason as SeatRuleError).code === 'SEATED_ELSEWHERE').length, 7, `rodada ${i}`);
      assert.equal(await activeSeatsOf(x), 1, `rodada ${i}`);
    }
  });
  await test('mobilidade legítima: mesas VAZIAS adotadas em paralelo pela mesma conta — todas podem passar (uma de cada vez), mas termina com 1 assento ativo e as outras sessões fechadas', async () => {
    for (let i = 0; i < 15; i++) {
      const x = randomUUID();
      const sessions: string[] = [];
      const guests: string[] = [];
      for (let k = 0; k < 6; k++) {
        const s = await session();
        sessions.push(s.id);
        guests.push(await seat(s.id));
      }
      const res = await Promise.allSettled(guests.map((g) => inTx((db) => bindGuestSeat(db, { tenantId: T1, customerId: x, seatId: g }))));
      assert.equal(res.filter((r) => r.status === 'fulfilled').length, 6, `rodada ${i}: ${res.map((r) => (r.status === 'rejected' ? String((r.reason as Error).message) : 'ok')).join(' | ')}`);
      assert.equal(await activeSeatsOf(x), 1, `rodada ${i}`);
      const open = (await q(`SELECT count(*)::int AS n FROM table_sessions WHERE id = ANY($1::uuid[]) AND status = 'aberta'`, [sessions]))[0].n;
      const closed = (await q(`SELECT count(*)::int AS n FROM table_sessions WHERE id = ANY($1::uuid[]) AND status = 'fechada' AND closed_reason = 'saida_sem_pedido'`, [sessions]))[0].n;
      assert.equal(open, 1, `rodada ${i}: sessões abertas`);
      assert.equal(closed, 5, `rodada ${i}: sessões fechadas por mobilidade`);
    }
  });
  await test('o MESMO assento adotado duas vezes em paralelo pela mesma conta (duplo clique): um "bound", o outro "already"', async () => {
    for (let i = 0; i < 20; i++) {
      const x = randomUUID();
      const b = await session();
      const g = await seat(b.id);
      const res = await Promise.all([
        inTx((db) => bindGuestSeat(db, { tenantId: T1, customerId: x, seatId: g })),
        inTx((db) => bindGuestSeat(db, { tenantId: T1, customerId: x, seatId: g })),
      ]);
      assert.deepEqual(res.map((r) => r.kind).sort(), ['already', 'bound']);
      assert.equal(await activeSeatsOf(x), 1);
    }
  });
  await test('o MESMO assento disputado por DUAS contas: uma vence, a outra recebe SEAT_NOT_GUEST; o assento pertence à vencedora', async () => {
    for (let i = 0; i < 20; i++) {
      const x = randomUUID();
      const y = randomUUID();
      const b = await session();
      const g = await seat(b.id);
      const res = await Promise.allSettled([
        inTx((db) => bindGuestSeat(db, { tenantId: T1, customerId: x, seatId: g })),
        inTx((db) => bindGuestSeat(db, { tenantId: T1, customerId: y, seatId: g })),
      ]);
      assert.equal(res.filter((r) => r.status === 'fulfilled').length, 1, `rodada ${i}`);
      const loser = res.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      assert.equal((loser.reason as SeatRuleError).code, 'SEAT_NOT_GUEST');
      const owner = (await q(`SELECT customer_id FROM table_session_participants WHERE id = $1`, [g]))[0].customer_id;
      assert.ok(owner === x || owner === y);
    }
  });
  await test('adoção × PEDIDO concorrente: nunca existe pedido ativo na sessão A com a conta sentada em B (80 rodadas, intercalação variada)', async () => {
    let orderWon = 0;
    let adoptWon = 0;
    for (let i = 0; i < 80; i++) {
      const x = randomUUID();
      const a = await session({ openedBy: x });
      const sa = await seat(a.id, { customer: x });
      const b = await session();
      const gb = await seat(b.id);
      const adopt = (async () => {
        await sleep(Math.random() * 4);
        return inTx((db) => bindGuestSeat(db, { tenantId: T1, customerId: x, seatId: gb }));
      })();
      // Simula OrdersService.create: trava a linha da sessão, confere o assento e só então insere o pedido.
      const place = (async () => {
        await sleep(Math.random() * 4);
        const c = await pool.connect();
        try {
          await c.query('BEGIN');
          const s = (await c.query(`SELECT status FROM table_sessions WHERE id = $1 FOR UPDATE`, [a.id])).rows[0];
          const seatRow = (await c.query(`SELECT left_at FROM table_session_participants WHERE id = $1`, [sa])).rows[0];
          if (s.status !== 'aberta' || seatRow.left_at !== null) {
            await c.query('ROLLBACK');
            return 'recusado';
          }
          await c.query(`INSERT INTO orders (table_session_id, customer_id, table_participant_id, status) VALUES ($1,$2,$3,'pendente')`, [a.id, x, sa]);
          await c.query('COMMIT');
          return 'pedido';
        } catch (e) {
          await c.query('ROLLBACK').catch(() => undefined);
          throw e;
        } finally {
          c.release();
        }
      })();
      const [ad, pl] = await Promise.allSettled([adopt, place]);
      const liveOrderInA = (await q(`SELECT count(*)::int AS n FROM orders WHERE table_session_id = $1 AND status <> 'cancelado'`, [a.id]))[0].n;
      const seatedInB = (await q(`SELECT count(*)::int AS n FROM table_session_participants WHERE id = $1 AND customer_id = $2 AND left_at IS NULL`, [gb, x]))[0].n;
      assert.equal(liveOrderInA > 0 && seatedInB > 0, false, `rodada ${i}: pedido em A e assento em B ao mesmo tempo`);
      assert.ok(ad.status === 'fulfilled' || (ad.reason as SeatRuleError).code === 'SEATED_ELSEWHERE', `rodada ${i}: adoção falhou por outro motivo: ${String((ad as PromiseRejectedResult).reason)}`);
      assert.equal(pl.status, 'fulfilled');
      if (liveOrderInA > 0) orderWon++;
      else adoptWon++;
      assert.equal(await activeSeatsOf(x), 1, `rodada ${i}`);
    }
    console.log(`        (intercalações cobertas: pedido venceu ${orderWon}x, adoção venceu ${adoptWon}x)`);
    assert.ok(orderWon > 0 && adoptWon > 0, 'o teste precisa exercitar os dois lados da corrida');
  });
  await test('trava ocupada: outra operação da mesma conta segura a trava → SEAT_BUSY dentro do prazo, SEM alterar nada; depois liberada, funciona', async () => {
    const x = randomUUID();
    const b = await session();
    const g = await seat(b.id);
    const holder = await pool.connect();
    await holder.query('BEGIN');
    await holder.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [accountLockKey(T1, x)]);
    const before = await snapshot();
    const t0 = Date.now();
    await rejects(() => inTx((db) => bindGuestSeat(db, { tenantId: T1, customerId: x, seatId: g, lockTimeoutMs: 300 })), 'SEAT_BUSY');
    const elapsed = Date.now() - t0;
    assert.ok(elapsed >= 250 && elapsed < 2500, 'esperou ~300ms, não ficou pendurada: ' + elapsed + 'ms');
    assert.equal(await snapshot(), before);
    await holder.query('ROLLBACK');
    holder.release();
    assert.equal((await inTx((db) => bindGuestSeat(db, { tenantId: T1, customerId: x, seatId: g }))).kind, 'bound');
  });
  await test('contas DIFERENTES não se bloqueiam: a trava da conta X não atrasa a conta Y', async () => {
    const x = randomUUID();
    const y = randomUUID();
    const g = await seat((await session()).id);
    const holder = await pool.connect();
    await holder.query('BEGIN');
    await holder.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [accountLockKey(T1, x)]);
    const t0 = Date.now();
    await inTx((db) => bindGuestSeat(db, { tenantId: T1, customerId: y, seatId: g, lockTimeoutMs: 300 }));
    assert.ok(Date.now() - t0 < 250, 'Y não pode esperar por X');
    await holder.query('ROLLBACK');
    holder.release();
  });
  await test('sem vazamento de configuração: lock_timeout é local à transação (a conexão volta limpa ao pool)', async () => {
    const x = randomUUID();
    const g = await seat((await session()).id);
    await inTx((db) => bindGuestSeat(db, { tenantId: T1, customerId: x, seatId: g, lockTimeoutMs: 1234 }));
    for (let i = 0; i < 24; i++) {
      const v = (await pool.query(`SHOW lock_timeout`)).rows[0].lock_timeout;
      assert.equal(v, '0', 'lock_timeout vazou para a conexão do pool: ' + v);
    }
  });
  await test('o índice único "uma sessão ativa por mesa" continua sendo a salvaguarda de unicidade da sessão', async () => {
    const t = randomUUID();
    await session({ table: t });
    await assert.rejects(() => session({ table: t }), (e: { code?: string }) => e.code === '23505');
    await session({ table: t, status: 'fechada' }); // sessões encerradas convivem
  });

  console.log(`\nResultado: ${pass} ok, ${fail} falhas`);
}

main()
  .catch((e) => {
    fail++;
    console.error('ERRO NO TESTE', e);
  })
  .finally(async () => {
    await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`).catch(() => undefined);
    await pool.end();
    process.exit(fail === 0 ? 0 : 1);
  });
