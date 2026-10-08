import type { DataSource, QueryRunner } from 'typeorm';
import {
  quoteIdent,
  scopeCondition,
  type BackupPlan,
  type PlanTable,
} from './backup-plan';
import { sha256Hex, SNAPSHOT_FORMAT, SNAPSHOT_KIND, type SnapshotDocument, type SnapshotTable } from './backup-container';

// Motor SQL do backup/restauração. Só aqui existe SQL de dados; tudo que é
// decisão (quem pode, senha, agenda, storage) fica no BackupsService.

export class RestoreIncompatibleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RestoreIncompatibleError';
  }
}

export class RestoreVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RestoreVerificationError';
  }
}

const TZ_UTC = `SET LOCAL TIME ZONE 'UTC'`;

// Exporta UMA tabela (as linhas do restaurante) como texto jsonb canônico,
// ordenado pela chave primária. `omitColumns` tira colunas que o snapshot não
// tem (colunas criadas depois por migrations) — assim a verificação pós-restore
// compara exatamente o mesmo conjunto de colunas.
//
// Determinismo (essencial: backup e verificação usam ESTE mesmo código):
//  - jsonb tem ordem de chaves canônica e preserva `numeric` com todas as casas;
//  - timestamps saem no fuso da sessão (forçado a UTC com SET LOCAL);
//  - ORDER BY a chave primária (única) → ordem total.
export async function exportTable(
  qr: QueryRunner,
  plan: BackupPlan,
  table: PlanTable,
  tenantId: string,
  omitColumns: string[] = [],
): Promise<{ rowCount: number; rows: string }> {
  const order = table.primaryKey.map((c) => `t.${quoteIdent(c)}`).join(', ');
  const sql = `
    SELECT count(*)::int AS n,
           COALESCE(jsonb_agg(to_jsonb(t) - $2::text[] ORDER BY ${order}), '[]'::jsonb)::text AS rows
    FROM ${quoteIdent(table.name)} t
    WHERE ${scopeCondition(plan, table, 't')}`;
  const [row] = await qr.query(sql, [tenantId, omitColumns]);
  return { rowCount: Number(row.n), rows: String(row.rows) };
}

// Lê TODAS as tabelas do plano dentro de UMA transação REPEATABLE READ somente
// leitura: todas as tabelas refletem exatamente o mesmo instante (um pedido
// criado no meio do backup não aparece pela metade — ex.: order_items sem o
// pedido, ou cashback consumido sem o lançamento).
export async function exportTenantSnapshot(
  ds: DataSource,
  plan: BackupPlan,
  tenantId: string,
): Promise<SnapshotDocument> {
  const qr = ds.createQueryRunner();
  await qr.connect();
  try {
    await qr.startTransaction('REPEATABLE READ');
    await qr.query('SET TRANSACTION READ ONLY');
    await qr.query(TZ_UTC);

    const [tenant] = await qr.query(`SELECT slug FROM tenants WHERE id = $1`, [tenantId]);
    if (!tenant) throw new Error('Restaurante não encontrado.');
    const [head] = await qr.query(`SELECT name FROM migrations ORDER BY timestamp DESC LIMIT 1`);
    const schemaHead = head ? String(head.name).match(/(\d{10,})$/)?.[1] ?? String(head.name) : null;

    const tables: SnapshotTable[] = [];
    for (const table of plan.tables) {
      const { rowCount, rows } = await exportTable(qr, plan, table, tenantId);
      tables.push({
        name: table.name,
        columns: table.columns.map((c) => c.name),
        rowCount,
        sha256: sha256Hex(rows),
        rows,
      });
    }
    await qr.rollbackTransaction(); // somente leitura: nada a confirmar
    return {
      kind: SNAPSHOT_KIND,
      format: SNAPSHOT_FORMAT,
      createdAt: new Date().toISOString(),
      tenantId,
      tenantSlug: String(tenant.slug),
      schemaHead,
      tables,
    };
  } catch (err) {
    if (qr.isTransactionActive) await qr.rollbackTransaction().catch(() => undefined);
    throw err;
  } finally {
    await qr.release();
  }
}

export async function countTenantRows(
  ds: DataSource,
  plan: BackupPlan,
  tenantId: string,
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of plan.tables) {
    const [row] = await ds.query(
      `SELECT count(*)::int AS n FROM ${quoteIdent(table.name)} t WHERE ${scopeCondition(plan, table, 't')}`,
      [tenantId],
    );
    out[table.name] = Number(row.n);
  }
  return out;
}

export interface RestoreOptions {
  lockTimeoutMs: number;
  statementTimeoutMs: number;
}

export interface RestoreResult {
  tables: { name: string; rowCount: number }[];
  totalRows: number;
}

function positiveInt(n: number, label: string): number {
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${label} precisa ser um inteiro positivo`);
  return n;
}

// Compatibilidade snapshot × schema ATUAL (roda ANTES de apagar qualquer coisa).
export function checkCompatibility(plan: BackupPlan, doc: SnapshotDocument): string[] {
  const problems: string[] = [];
  const planByName = new Map(plan.tables.map((t) => [t.name, t]));
  for (const st of doc.tables) {
    const pt = planByName.get(st.name);
    if (!pt) {
      problems.push(`A tabela "${st.name}" do backup não existe (ou não faz mais parte do snapshot) no sistema atual.`);
      continue;
    }
    const current = new Map(pt.columns.map((c) => [c.name, c]));
    const gone = st.columns.filter((c) => !current.has(c));
    if (gone.length > 0) {
      problems.push(`A tabela "${st.name}" perdeu coluna(s) desde o backup: ${gone.join(', ')} — restaurar descartaria esses dados.`);
    }
    const snapshotCols = new Set(st.columns);
    const added = pt.columns.filter((c) => !snapshotCols.has(c.name) && !c.nullable && !c.hasDefault);
    if (added.length > 0) {
      problems.push(`A tabela "${st.name}" ganhou coluna(s) obrigatória(s) sem valor padrão desde o backup: ${added.map((c) => c.name).join(', ')}.`);
    }
  }
  return problems;
}

// RESTAURAÇÃO ATÔMICA: tudo numa única transação — qualquer erro (inclusive a
// verificação final) desfaz TUDO e o estado atual fica exatamente como estava.
//
//  1. lock_timeout/statement_timeout curtos: ocupado demais → falha limpa, não trava.
//  2. advisory lock transacional por restaurante (serializa restores/backups);
//     só variantes `xact`, compatíveis com o pooler em modo transação do Supabase.
//  3. LOCK TABLE ... SHARE ROW EXCLUSIVE em todas as tabelas do plano, em ordem
//     alfabética (ordem fixa = sem deadlock entre restores): ninguém escreve
//     nelas até o fim — sem isso, um pedido novo no meio do restore sobreviveria
//     a ele e o estado final não seria "exatamente o do backup".
//  4. Compatibilidade de schema + tabelas novas com dados (recusa em vez de apagar).
//  5. DELETE das linhas do restaurante (filhos antes dos pais) e INSERT do snapshot
//     (pais antes dos filhos), via jsonb_populate_recordset: tipos nativos
//     (numeric, timestamptz, uuid[], jsonb…) sem passar por parse do JavaScript.
//  6. PROVA: reexporta cada tabela com o MESMO código do backup e exige igualdade
//     de contagem e SHA-256 com o snapshot. Divergiu → ROLLBACK.
export async function restoreTenantSnapshot(
  ds: DataSource,
  plan: BackupPlan,
  tenantId: string,
  doc: SnapshotDocument,
  opts: RestoreOptions,
): Promise<RestoreResult> {
  const lockMs = positiveInt(opts.lockTimeoutMs, 'lockTimeoutMs');
  const stmtMs = positiveInt(opts.statementTimeoutMs, 'statementTimeoutMs');

  const problems = checkCompatibility(plan, doc);
  if (problems.length > 0) throw new RestoreIncompatibleError(problems.join(' '));

  const snapshotByName = new Map(doc.tables.map((t) => [t.name, t]));
  const qr = ds.createQueryRunner();
  await qr.connect();
  try {
    await qr.startTransaction();
    await qr.query(TZ_UTC);
    await qr.query(`SET LOCAL lock_timeout = '${lockMs}ms'`);
    await qr.query(`SET LOCAL statement_timeout = '${stmtMs}ms'`);
    await qr.query(`SELECT pg_advisory_xact_lock(hashtextextended('tenant-backup:' || $1::text, 0))`, [tenantId]);

    const lockList = [...plan.tables]
      .map((t) => t.name)
      .sort()
      .map(quoteIdent)
      .join(', ');
    await qr.query(`LOCK TABLE ${lockList} IN SHARE ROW EXCLUSIVE MODE`);

    // Tabela nova (inexistente no backup) COM dados: recusar em vez de apagar sem aviso.
    for (const table of plan.tables) {
      if (snapshotByName.has(table.name)) continue;
      const [row] = await qr.query(
        `SELECT count(*)::int AS n FROM ${quoteIdent(table.name)} t WHERE ${scopeCondition(plan, table, 't')}`,
        [tenantId],
      );
      if (Number(row.n) > 0) {
        throw new RestoreIncompatibleError(
          `A tabela "${table.name}" não existia quando o backup foi feito e hoje tem ${row.n} registro(s) — restaurar apagaria esses dados.`,
        );
      }
    }

    for (const st of doc.tables) {
      const [row] = await qr.query(`SELECT jsonb_array_length($1::jsonb) AS n`, [st.rows]);
      if (Number(row.n) !== st.rowCount) {
        throw new RestoreVerificationError(`Contagem de linhas do backup inconsistente na tabela "${st.name}".`);
      }
    }

    for (const table of [...plan.tables].reverse()) {
      await qr.query(`DELETE FROM ${quoteIdent(table.name)} t WHERE ${scopeCondition(plan, table, 't')}`, [tenantId]);
    }

    for (const table of plan.tables) {
      const st = snapshotByName.get(table.name);
      if (!st || st.rowCount === 0) continue;
      const cols = st.columns.map(quoteIdent).join(', ');
      await qr.query(
        `INSERT INTO ${quoteIdent(table.name)} (${cols})
         SELECT ${cols} FROM jsonb_populate_recordset(NULL::${quoteIdent(table.name)}, $1::jsonb)`,
        [st.rows],
      );
    }

    const result: RestoreResult = { tables: [], totalRows: 0 };
    for (const table of plan.tables) {
      const st = snapshotByName.get(table.name);
      const snapshotCols = new Set(st?.columns ?? []);
      const omit = table.columns.map((c) => c.name).filter((c) => !snapshotCols.has(c));
      const now = await exportTable(qr, plan, table, tenantId, omit);
      const expectedCount = st?.rowCount ?? 0;
      const expectedHash = st?.sha256 ?? sha256Hex('[]');
      if (now.rowCount !== expectedCount || sha256Hex(now.rows) !== expectedHash) {
        throw new RestoreVerificationError(
          `Verificação pós-restauração falhou na tabela "${table.name}" (esperado ${expectedCount} linha(s), encontrado ${now.rowCount}, ou conteúdo diferente). Nada foi alterado.`,
        );
      }
      result.tables.push({ name: table.name, rowCount: now.rowCount });
      result.totalRows += now.rowCount;
    }

    await qr.commitTransaction();
    return result;
  } catch (err) {
    if (qr.isTransactionActive) await qr.rollbackTransaction().catch(() => undefined);
    throw err;
  } finally {
    await qr.release();
  }
}
