// Regra "uma conta, uma mesa" no NÍVEL DO BANCO (SQL puro, dentro da transação de quem chama).
//
// Invariante: dentro de um restaurante, uma conta tem NO MÁXIMO UM assento ativo em sessões abertas.
// (a mesma regra "anti pular de mesa" que já existia em openOrJoinSession, agora valendo para TODO
// caminho que dá um assento a uma conta: criar sessão, entrar em sessão existente, adotar assento de
// convidado no login e retomar assento).
//
// Por que advisory lock e não índice único: o modelo atual não marca left_at quando a sessão
// expira/fecha (o assento fica com left_at NULL), então "assento ativo" só existe cruzando com o status
// da sessão — algo que um índice sobre uma tabela só não consegue expressar. A serialização é feita por
// `pg_advisory_xact_lock` sobre (restaurante, conta): vale até o COMMIT/ROLLBACK da transação do chamador
// e funciona também atrás de pooler em modo transação (Supabase 6543), pois é escopo de transação.
// Nunca usar `SET` de sessão aqui (vaza entre clientes no pooler): só set_config(..., is_local = true).
//
// Ordem de travas (única, para não haver deadlock): 1) trava da conta; 2) linhas de table_sessions em
// ordem crescente de id (a sessão alvo + as sessões onde a conta já tem assento). OrdersService.create e
// leaveTable travam UMA linha de sessão e não tomam a trava da conta, então não fecham ciclo.
export const OPEN_SESSION_STATUSES = ['aberta', 'fechamento_solicitado'] as const;
export const DEFAULT_LOCK_TIMEOUT_MS = 3000;

export interface SeatDb {
  /** Mesma forma de EntityManager.query do TypeORM: devolve as linhas do SELECT. */
  query(sql: string, params?: unknown[]): Promise<any>;
}

export type SeatRuleCode =
  | 'SEATED_ELSEWHERE' // a conta já tem mesa em aberto com pedido (ou como participante) em outro lugar
  | 'SEAT_BUSY' // outra operação da MESMA conta está em andamento (trava não obtida a tempo): tente de novo
  | 'SEAT_NOT_GUEST' // o assento apresentado já pertence a outra conta
  | 'SEAT_GONE' // assento/sessão não existe mais, já saiu ou a sessão não está aberta
  | 'SEAT_FOREIGN'; // o assento é de outro restaurante

export class SeatRuleError extends Error {
  constructor(
    public readonly code: SeatRuleCode,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'SeatRuleError';
  }
}

/** Converte erros do Postgres que significam "tente de novo" em SeatRuleError('SEAT_BUSY'). */
export function mapSeatDbError(err: unknown): unknown {
  const code = (err as { code?: string } | null)?.code;
  if (code === '55P03' || code === '40P01') {
    return new SeatRuleError('SEAT_BUSY', 'Outra operação da sua conta está em andamento. Tente de novo.', { pgCode: code });
  }
  return err;
}

/** Chave da trava da conta (exportada para os testes provarem o contrato de serialização). */
export const accountLockKey = (tenantId: string, customerId: string): string => `table-seat:${tenantId}:${customerId}`;

async function lockAccount(db: SeatDb, tenantId: string, customerId: string, lockTimeoutMs: number): Promise<void> {
  // set_config(..., true) vale só até o fim da transação (seguro em pooler de transação).
  await db.query(`SELECT set_config('lock_timeout', $1, true)`, [`${Math.max(1, Math.floor(lockTimeoutMs))}ms`]);
  await db.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [accountLockKey(tenantId, customerId)]);
}

async function lockSessionsOrdered(db: SeatDb, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const unique = [...new Set(ids)].sort();
  await db.query(`SELECT id FROM table_sessions WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`, [unique]);
}

const LIVE_ORDER_SQL = `EXISTS (SELECT 1 FROM orders o WHERE o.table_session_id = s.id AND o.status <> 'cancelado' AND o.deleted_at IS NULL)`;

interface HeldRow {
  session_id: string;
  status: string;
  opened_by: string | null;
  seat_id: string;
  live: boolean;
}

async function heldSeats(db: SeatDb, tenantId: string, customerId: string, tableId: string): Promise<HeldRow[]> {
  return db.query(
    `SELECT s.id AS session_id, s.status, s.opened_by_customer_id AS opened_by, p.id AS seat_id, ${LIVE_ORDER_SQL} AS live
       FROM table_session_participants p
       JOIN table_sessions s ON s.id = p.table_session_id
      WHERE s.tenant_id = $1 AND p.customer_id = $2 AND p.left_at IS NULL
        AND s.status = ANY($3::text[]) AND s.deleted_at IS NULL AND s.table_id <> $4
      ORDER BY s.id`,
    [tenantId, customerId, [...OPEN_SESSION_STATUSES], tableId],
  );
}

export interface ClaimInput {
  tenantId: string;
  customerId: string;
  /** Mesa em que a conta quer ocupar um assento (as sessões DESTA mesa não contam como "outro lugar"). */
  tableId: string;
  /** Sessão alvo, se já existir: entra na mesma passada de travas ordenadas. */
  alsoLockSessionIds?: string[];
  lockTimeoutMs?: number;
}

export interface ClaimResult {
  releasedSeatIds: string[];
  closedSessionIds: string[];
}

/**
 * Garante que a conta pode ocupar um assento em `tableId`. Chamar DENTRO da transação que também grava o
 * assento (a trava da conta só vale até o fim dela).
 *
 * Decide por sessão onde a conta tem assento ativo:
 *  - há pedido ativo na sessão (de qualquer pessoa)            → BLOQUEIA (dinheiro em jogo);
 *  - sessão com fechamento solicitado, ou da qual ela é só participante → BLOQUEIA;
 *  - sessão ABERTA, aberta por ela e SEM nenhum pedido ativo     → LIBERA (sai do assento; fecha a sessão
 *    se ficou sem ninguém — mesma semântica de leaveTable, mesa livre na hora);
 *  - regra do dono: sessão aberta por ela com pedido ativo, mesmo que ela já tenha saído → BLOQUEIA.
 * Tudo ou nada: se qualquer sessão bloqueia, NADA é liberado.
 */
export async function claimSeat(db: SeatDb, input: ClaimInput): Promise<ClaimResult> {
  const { tenantId, customerId, tableId } = input;
  await lockAccount(db, tenantId, customerId, input.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS);

  // Passada 1 (sem trava): descobre quais sessões entram; trava tudo em ordem de id; depois relê sob trava.
  const probe = await heldSeats(db, tenantId, customerId, tableId);
  await lockSessionsOrdered(db, [...probe.map((r) => r.session_id), ...(input.alsoLockSessionIds ?? [])]);
  const held = await heldSeats(db, tenantId, customerId, tableId);

  const ownerBlocks: { session_id: string }[] = await db.query(
    `SELECT s.id AS session_id
       FROM table_sessions s
      WHERE s.tenant_id = $1 AND s.opened_by_customer_id = $2 AND s.status = ANY($3::text[])
        AND s.deleted_at IS NULL AND s.table_id <> $4 AND ${LIVE_ORDER_SQL}`,
    [tenantId, customerId, [...OPEN_SESSION_STATUSES], tableId],
  );

  const blockers = new Map<string, string>();
  const releasable: HeldRow[] = [];
  for (const row of held) {
    if (row.live) blockers.set(row.session_id, 'pedido_ativo');
    else if (row.status !== 'aberta') blockers.set(row.session_id, 'fechamento_solicitado');
    else if (row.opened_by !== customerId) blockers.set(row.session_id, 'participante_de_outra_sessao');
    else releasable.push(row);
  }
  for (const row of ownerBlocks) if (!blockers.has(row.session_id)) blockers.set(row.session_id, 'dono_com_pedido_ativo');

  if (blockers.size > 0) {
    throw new SeatRuleError(
      'SEATED_ELSEWHERE',
      'Você já tem uma mesa em aberto em outro lugar. Peça ao garçom para fechar ou pagar essa conta, ou saia dela se não houver pedido.',
      { sessionIds: [...blockers.keys()], reasons: Object.fromEntries(blockers) },
    );
  }

  const releasedSeatIds: string[] = [];
  const closedSessionIds: string[] = [];
  for (const row of releasable) {
    await db.query(`UPDATE table_session_participants SET left_at = now() WHERE id = $1 AND left_at IS NULL`, [row.seat_id]);
    releasedSeatIds.push(row.seat_id);
    const rest: { n: number }[] = await db.query(
      `SELECT count(*)::int AS n FROM table_session_participants WHERE table_session_id = $1 AND left_at IS NULL`,
      [row.session_id],
    );
    if ((rest[0]?.n ?? 0) === 0) {
      await db.query(
        `UPDATE table_sessions SET status = 'fechada', closed_at = now(), closed_reason = 'saida_sem_pedido'
          WHERE id = $1 AND status = 'aberta'`,
        [row.session_id],
      );
      closedSessionIds.push(row.session_id);
    }
  }
  return { releasedSeatIds, closedSessionIds };
}

export interface BindInput {
  tenantId: string;
  customerId: string;
  /** Assento de CONVIDADO (customer_id NULL) apresentado pelo cliente após o login. */
  seatId: string;
  lockTimeoutMs?: number;
}

export type BindOutcome =
  | { kind: 'bound'; seatId: string; sessionId: string; releasedSeatIds: string[]; closedSessionIds: string[] }
  | { kind: 'already'; seatId: string; sessionId: string }
  /** A conta já tinha assento ATIVO nesta sessão: o do convidado foi encerrado (mesma pessoa, uma presença só). */
  | { kind: 'merged'; seatId: string; sessionId: string }
  /** A conta já tivera assento nesta sessão e saíra: foi reativado com token novo; o do convidado foi encerrado. */
  | { kind: 'reactivated'; seatId: string; sessionId: string; seatToken: string; releasedSeatIds: string[]; closedSessionIds: string[] };

interface SeatRow {
  id: string;
  customer_id: string | null;
  left_at: string | null;
  table_session_id: string;
  tenant_id: string;
  table_id: string;
  status: string;
  deleted_at: string | null;
}

const READ_SEAT_SQL = `SELECT p.id, p.customer_id, p.left_at, p.table_session_id, s.tenant_id, s.table_id, s.status, s.deleted_at
                         FROM table_session_participants p JOIN table_sessions s ON s.id = p.table_session_id
                        WHERE p.id = $1`;

/**
 * Liga um assento de convidado à conta (adoção após o login), com a mesma invariante de claimSeat e de
 * forma idempotente. NUNCA descarta o assento do convidado quando recusa (a transação do chamador deve ser
 * desfeita pelo erro; nada é escrito antes da decisão).
 */
export async function bindGuestSeat(db: SeatDb, input: BindInput): Promise<BindOutcome> {
  const { tenantId, customerId, seatId } = input;
  await lockAccount(db, tenantId, customerId, input.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS);

  const first: SeatRow[] = await db.query(READ_SEAT_SQL, [seatId]);
  if (first.length === 0) throw new SeatRuleError('SEAT_GONE', 'Assento inexistente.', { seatId });
  if (first[0].tenant_id !== tenantId) throw new SeatRuleError('SEAT_FOREIGN', 'Assento de outro restaurante.', { seatId });

  // Trava, em ordem de id, a sessão do assento + as sessões onde a conta já está (decide sob trava).
  const heldProbe = await heldSeats(db, tenantId, customerId, first[0].table_id);
  await lockSessionsOrdered(db, [first[0].table_session_id, ...heldProbe.map((r) => r.session_id)]);

  const rows: SeatRow[] = await db.query(READ_SEAT_SQL, [seatId]);
  const seat = rows[0];
  if (!seat) throw new SeatRuleError('SEAT_GONE', 'Assento inexistente.', { seatId });
  if (seat.deleted_at !== null || !(OPEN_SESSION_STATUSES as readonly string[]).includes(seat.status)) {
    throw new SeatRuleError('SEAT_GONE', 'A sessão desse assento não está mais aberta.', { seatId });
  }
  if (seat.customer_id === customerId) {
    if (seat.left_at !== null) throw new SeatRuleError('SEAT_GONE', 'Esse assento já saiu da mesa.', { seatId });
    return { kind: 'already', seatId, sessionId: seat.table_session_id };
  }
  if (seat.customer_id !== null) throw new SeatRuleError('SEAT_NOT_GUEST', 'Esse assento pertence a outra conta.', { seatId });
  if (seat.left_at !== null) throw new SeatRuleError('SEAT_GONE', 'Esse assento já saiu da mesa.', { seatId });

  const mine: { id: string; left_at: string | null }[] = await db.query(
    `SELECT id, left_at FROM table_session_participants WHERE table_session_id = $1 AND customer_id = $2`,
    [seat.table_session_id, customerId],
  );

  if (mine.length > 0 && mine[0].left_at === null) {
    // A conta já está sentada nesta sessão: a invariante já vale; só encerra a presença duplicada do convidado.
    await db.query(`UPDATE table_session_participants SET left_at = now() WHERE id = $1 AND customer_id IS NULL AND left_at IS NULL`, [seatId]);
    return { kind: 'merged', seatId: mine[0].id, sessionId: seat.table_session_id };
  }

  const claim = await claimSeat(db, {
    tenantId,
    customerId,
    tableId: seat.table_id,
    alsoLockSessionIds: [seat.table_session_id],
    lockTimeoutMs: input.lockTimeoutMs,
  });

  if (mine.length > 0) {
    const token = (await db.query(
      `SELECT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') AS t`,
    ))[0].t as string;
    await db.query(`UPDATE table_session_participants SET left_at = NULL, seat_token = $2 WHERE id = $1 AND left_at IS NOT NULL`, [mine[0].id, token]);
    await db.query(`UPDATE table_session_participants SET left_at = now() WHERE id = $1 AND customer_id IS NULL AND left_at IS NULL`, [seatId]);
    return { kind: 'reactivated', seatId: mine[0].id, sessionId: seat.table_session_id, seatToken: token, ...claim };
  }

  await db.query(`UPDATE table_session_participants SET customer_id = $2 WHERE id = $1 AND customer_id IS NULL AND left_at IS NULL`, [seatId, customerId]);
  const after: SeatRow[] = await db.query(READ_SEAT_SQL, [seatId]);
  if (after[0]?.customer_id !== customerId) {
    throw new SeatRuleError('SEAT_NOT_GUEST', 'Esse assento foi assumido por outra conta.', { seatId });
  }
  // Se a sessão foi aberta por convidado e este é o primeiro assento, a conta passa a ser a "dona" da sessão.
  await db.query(
    `UPDATE table_sessions SET opened_by_customer_id = $2
      WHERE id = $1 AND opened_by_customer_id IS NULL
        AND (SELECT id FROM table_session_participants WHERE table_session_id = $1 ORDER BY joined_at ASC, id ASC LIMIT 1) = $3`,
    [seat.table_session_id, customerId, seatId],
  );
  return { kind: 'bound', seatId, sessionId: seat.table_session_id, ...claim };
}

/** Diagnóstico (somente leitura): contas com mais de um assento ativo em sessões abertas do mesmo restaurante. */
export const SEAT_INVARIANT_VIOLATIONS_SQL = `
  SELECT s.tenant_id, p.customer_id, count(*)::int AS active_seats, array_agg(s.id ORDER BY s.id) AS sessions
    FROM table_session_participants p
    JOIN table_sessions s ON s.id = p.table_session_id
   WHERE p.customer_id IS NOT NULL AND p.left_at IS NULL
     AND s.status IN ('aberta', 'fechamento_solicitado') AND s.deleted_at IS NULL
   GROUP BY s.tenant_id, p.customer_id
  HAVING count(*) > 1`;

export async function findSeatInvariantViolations(db: SeatDb): Promise<{ tenant_id: string; customer_id: string; active_seats: number; sessions: string[] }[]> {
  return db.query(SEAT_INVARIANT_VIOLATIONS_SQL);
}
