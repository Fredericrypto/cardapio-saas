// Semeador genérico para os testes de backup: preenche TODAS as tabelas do plano
// (lidas do catálogo real) com 2 linhas cada — uma com todas as colunas
// preenchidas e outra com as anuláveis em NULL — respeitando FKs, enums e CHECKs.
// Assim, qualquer tabela nova do sistema entra no teste de ida-e-volta sozinha.
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { BackupPlan, quoteIdent } from '../src/modules/backups/backup-plan';

interface ColInfo { name: string; data_type: string; udt_name: string; prec: number | null; scale: number | null; maxlen: number | null }

export async function seedAllTables(
  ds: DataSource,
  plan: BackupPlan,
  tenantId: string,
  adminUserId: string,
  tag: string,
  rowsPerTable = 2,
): Promise<Record<string, number>> {
  const cols: ColInfo[] = await ds.query(`
    SELECT table_name, column_name AS name, data_type, udt_name, numeric_precision AS prec, numeric_scale AS scale, character_maximum_length AS maxlen
    FROM information_schema.columns WHERE table_schema='public'`);
  const colMap = new Map<string, ColInfo>();
  for (const c of cols as any[]) colMap.set(`${c.table_name}.${c.name}`, c);

  const enums: { typname: string; vals: string[] }[] = await ds.query(
    `SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder)::text[] AS vals FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid GROUP BY t.typname`);
  const enumMap = new Map(enums.map((e) => [e.typname, e.vals]));

  const checks: { table_name: string; def: string }[] = await ds.query(`
    SELECT cl.relname AS table_name, pg_get_constraintdef(co.oid) AS def
    FROM pg_constraint co JOIN pg_class cl ON cl.oid=co.conrelid JOIN pg_namespace n ON n.oid=cl.relnamespace AND n.nspname='public'
    WHERE co.contype='c'`);

  const fks: { table_name: string; col: string; ref_table: string; ref_col: string }[] = await ds.query(`
    SELECT cl.relname AS table_name, a.attname AS col, rcl.relname AS ref_table, ra.attname AS ref_col
    FROM pg_constraint co JOIN pg_class cl ON cl.oid=co.conrelid JOIN pg_class rcl ON rcl.oid=co.confrelid
    JOIN pg_attribute a ON a.attrelid=co.conrelid AND a.attnum=co.conkey[1]
    JOIN pg_attribute ra ON ra.attrelid=co.confrelid AND ra.attnum=co.confkey[1]
    WHERE co.contype='f' AND array_length(co.conkey,1)=1`);
  const fkMap = new Map(fks.map((f) => [`${f.table_name}.${f.col}`, f]));

  const inserted: Record<string, any[]> = {};
  let counter = 0;

  const checkLiteral = (table: string, column: string): string | null => {
    for (const c of checks.filter((x) => x.table_name === table)) {
      if (!c.def.includes(column)) continue;
      const m = c.def.match(/'([^']+)'::/);
      if (m) return m[1];
    }
    return null;
  };

  const numericValue = (c: ColInfo, i: number): string => {
    const scale = c.scale ?? 0;
    const intDigits = Math.max(1, (c.prec ?? 10) - scale);
    if (i === 0) return scale > 0 ? `0.${'1'.repeat(scale)}` : '1';
    const intPart = intDigits >= 2 ? '12' : '1'; // pequeno: cabe em CHECKs de faixa (ex.: porcentagens)
    return scale > 0 ? `${intPart}.${'5'.repeat(scale)}` : intPart;
  };

  const gen = (table: string, c: ColInfo, i: number): any => {
    const lit = checkLiteral(table, c.name);
    if (lit !== null && (c.data_type === 'character varying' || c.data_type === 'text')) return lit;
    counter++;
    switch (c.data_type) {
      case 'uuid': return randomUUID();
      case 'character varying':
      case 'text': {
        const v = `${tag}-${table}-${c.name}-${i}-${counter}-ç✓`;
        return c.maxlen ? v.slice(0, c.maxlen) : v;
      }
      case 'integer': case 'smallint': return 3 + i;
      case 'bigint': return 3 + i;
      case 'numeric': return numericValue(c, i);
      case 'double precision': case 'real': return 1.5 + i;
      case 'boolean': return i === 0;
      case 'timestamp with time zone': case 'timestamp without time zone':
        return i === 0 ? '2026-03-01T12:34:56.789123Z' : '2025-12-31T23:59:59.000001Z';
      case 'date': return i === 0 ? '2026-03-01' : '2024-02-29';
      case 'time without time zone': return '10:30:00';
      case 'jsonb': case 'json': return JSON.stringify({ k: `v${i}`, n: [1, 2.50, 'ç'] });
      case 'ARRAY': return c.udt_name === '_uuid' ? `{${randomUUID()}}` : '{}';
      case 'USER-DEFINED': return enumMap.get(c.udt_name)?.[0] ?? null;
      default: throw new Error(`seed: tipo não tratado ${c.data_type} em ${table}.${c.name}`);
    }
  };

  const totals: Record<string, number> = {};
  for (const table of plan.tables) {
    inserted[table.name] = [];
    for (let i = 0; i < rowsPerTable; i++) {
      const names: string[] = [];
      const values: any[] = [];
      for (const col of table.columns) {
        const info = colMap.get(`${table.name}.${col.name}`)!;
        const fk = fkMap.get(`${table.name}.${col.name}`);
        let v: any;
        const forceFill = table.name === 'cashback_consumptions' && col.name === 'table_session_id' && i === 1;
        const nullRow = col.nullable && i === 1 && !forceFill;
        // CHECK entre colunas (exatamente UMA origem): linha 0 → pedido, linha 1 → sessão de mesa.
        if (table.name === 'cashback_consumptions' && col.name === 'order_id' && i === 1) v = null;
        else if (table.name === 'cashback_consumptions' && col.name === 'table_session_id' && i === 0) v = null;
        else if (col.name === 'tenant_id') v = tenantId;
        else if (fk) {
          if (fk.ref_table === 'tenants') v = tenantId;
          else if (fk.ref_table === 'admin_users') v = nullRow ? null : adminUserId;
          else {
            const parents = inserted[fk.ref_table];
            if (!parents) { if (col.nullable) v = null; else throw new Error(`seed: pai ${fk.ref_table} não semeado para ${table.name}.${col.name}`); }
            else if (nullRow) v = null;
            else v = parents[i % Math.max(parents.length, 1)]?.[fk.ref_col] ?? (col.nullable ? null : (() => { throw new Error(`seed: sem linha em ${fk.ref_table}`); })());
          }
        } else if (nullRow) v = null;
        else if (col.hasDefault && i === 1) continue; // deixa o DEFAULT agir na 2ª linha
        else v = gen(table.name, info, i);
        names.push(quoteIdent(col.name));
        values.push(v);
      }
      const ph = values.map((_, k) => `$${k + 1}`).join(',');
      const [row] = await ds.query(
        `INSERT INTO ${quoteIdent(table.name)} (${names.join(',')}) VALUES (${ph}) RETURNING *`, values);
      inserted[table.name].push(row);
    }
    totals[table.name] = inserted[table.name].length;
  }
  return totals;
}
