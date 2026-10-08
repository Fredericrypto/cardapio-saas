import type { QueryRunner } from 'typeorm';

// PLANO DE BACKUP: quais tabelas entram no snapshot de um restaurante, como
// isolar as linhas DELE em cada tabela e em que ordem apagar/inserir.
//
// O plano é DESCOBERTO NO CATÁLOGO do Postgres (tabelas, colunas, chaves
// primárias e estrangeiras reais), não numa lista escrita à mão — uma tabela
// nova criada por uma migration futura entra no backup sozinha. E o plano
// FALHA FECHADO: se alguma tabela não tem como ser isolada por restaurante, ou
// se apagar os dados de um restaurante afetaria uma tabela fora do snapshot, o
// backup/restore se recusa a rodar (em vez de silenciosamente deixar dados de
// fora ou apagar demais).

// Tabelas que NÃO entram no snapshot, e por quê:
//  - migrations: controle de schema, não é dado do restaurante.
//  - tenants: a linha do restaurante guarda segredos (tokens do Mercado Pago
//    criptografados com CREDENTIALS_ENCRYPTION_KEY) e restaurá-la poderia
//    reverter credenciais/configurações de segurança.
//  - admin_users: restaurar usuários reviveria senhas antigas e funcionários
//    já removidos (e poderia trancar o próprio dono pra fora).
//  - user_push_subscriptions / internal_notifications /
//    internal_notification_reads: aparelhos e alertas internos da equipe —
//    efêmeros, ligados a usuários (que não são restaurados).
//  - tenant_backups / tenant_backup_settings / backup_audit_logs: o histórico
//    de backups e a auditoria nunca podem ser reescritos por um restore.
export const EXCLUDED_TABLES: ReadonlySet<string> = new Set([
  'migrations',
  'tenants',
  'admin_users',
  'user_push_subscriptions',
  'internal_notifications',
  'internal_notification_reads',
  'tenant_backups',
  'tenant_backup_settings',
  'backup_audit_logs',
]);

export type OnDeleteAction = 'CASCADE' | 'SET NULL' | 'NO ACTION' | 'RESTRICT' | 'SET DEFAULT';

export interface CatalogColumn {
  name: string;
  nullable: boolean;
  hasDefault: boolean;
  generated: boolean; // coluna gerada/identity ALWAYS — nunca inserida
}
export interface CatalogTable {
  name: string;
  columns: CatalogColumn[]; // em ordem de declaração
  primaryKey: string[];
}
export interface CatalogForeignKey {
  table: string;
  columns: string[];
  refTable: string;
  refColumns: string[];
  onDelete: OnDeleteAction;
}
export interface Catalog {
  tables: CatalogTable[];
  foreignKeys: CatalogForeignKey[];
}

export type TableScope =
  | { kind: 'tenant' } // tem coluna tenant_id
  | { kind: 'via'; column: string; parent: string; parentColumn: string };

export interface PlanTable {
  name: string;
  columns: CatalogColumn[]; // sem as geradas
  primaryKey: string[];
  scope: TableScope;
}

export interface BackupPlan {
  // Ordem TOPOLÓGICA: pais antes dos filhos (inserir nesta ordem; apagar na inversa).
  tables: PlanTable[];
}

export class BackupPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupPlanError';
  }
}

const IDENT_RE = /^[a-z_][a-z0-9_]*$/;

export function quoteIdent(name: string): string {
  if (!IDENT_RE.test(name)) throw new BackupPlanError(`Identificador SQL não permitido: "${name}"`);
  return `"${name}"`;
}

export function buildPlan(catalog: Catalog): BackupPlan {
  const byName = new Map(catalog.tables.map((t) => [t.name, t]));
  const included = catalog.tables.filter((t) => !EXCLUDED_TABLES.has(t.name));
  const includedNames = new Set(included.map((t) => t.name));

  for (const t of included) {
    quoteIdent(t.name);
    t.columns.forEach((c) => quoteIdent(c.name));
    if (t.primaryKey.length === 0) {
      throw new BackupPlanError(`Tabela "${t.name}" não tem chave primária — não dá pra ordenar o snapshot de forma determinística.`);
    }
  }

  // Regra A: FK de tabela do snapshot só pode apontar pra outra tabela do snapshot ou pra tenants.
  // Regra B: nenhuma tabela FORA do snapshot pode referenciar uma tabela DENTRO dele (apagar
  //          o restaurante dispararia CASCADE/SET NULL/bloqueio fora do que o restore controla).
  for (const fk of catalog.foreignKeys) {
    const fromIncluded = includedNames.has(fk.table);
    const toIncluded = includedNames.has(fk.refTable);
    if (fromIncluded && !toIncluded && fk.refTable !== 'tenants') {
      throw new BackupPlanError(
        `"${fk.table}" referencia a tabela excluída "${fk.refTable}" — um restore deixaria referências quebradas. Revise EXCLUDED_TABLES.`,
      );
    }
    if (!fromIncluded && toIncluded && byName.has(fk.table)) {
      throw new BackupPlanError(
        `A tabela excluída "${fk.table}" referencia "${fk.refTable}" (${fk.onDelete}) — apagar dados do restaurante afetaria uma tabela fora do snapshot. Inclua "${fk.table}" no snapshot.`,
      );
    }
    if (fromIncluded && toIncluded && fk.table === fk.refTable) {
      throw new BackupPlanError(`FK autorreferente em "${fk.table}" não é suportada pelo restore.`);
    }
  }

  // Escopo por restaurante: coluna tenant_id, ou FK NOT NULL de coluna única para tabela já escopada.
  const scopes = new Map<string, TableScope>();
  const columnNullable = (table: string, col: string) =>
    byName.get(table)!.columns.find((c) => c.name === col)?.nullable ?? true;

  for (const t of included) {
    if (t.columns.some((c) => c.name === 'tenant_id')) scopes.set(t.name, { kind: 'tenant' });
  }
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const t of included) {
      if (scopes.has(t.name)) continue;
      const fk = catalog.foreignKeys
        .filter(
          (f) =>
            f.table === t.name &&
            f.columns.length === 1 &&
            scopes.has(f.refTable) &&
            !columnNullable(t.name, f.columns[0]),
        )
        .sort((a, b) => a.columns[0].localeCompare(b.columns[0]))[0];
      if (fk) {
        scopes.set(t.name, { kind: 'via', column: fk.columns[0], parent: fk.refTable, parentColumn: fk.refColumns[0] });
        progressed = true;
      }
    }
  }
  const unscoped = included.filter((t) => !scopes.has(t.name)).map((t) => t.name);
  if (unscoped.length > 0) {
    throw new BackupPlanError(
      `Tabela(s) sem como isolar por restaurante: ${unscoped.join(', ')}. Adicione tenant_id/FK, ou inclua em EXCLUDED_TABLES se não for dado do restaurante.`,
    );
  }

  // Ordem topológica (Kahn), desempate alfabético = determinístico.
  const deps = new Map<string, Set<string>>();
  for (const t of included) deps.set(t.name, new Set());
  for (const fk of catalog.foreignKeys) {
    if (includedNames.has(fk.table) && includedNames.has(fk.refTable)) deps.get(fk.table)!.add(fk.refTable);
  }
  const ordered: string[] = [];
  const remaining = new Set(included.map((t) => t.name));
  while (remaining.size > 0) {
    const ready = [...remaining].filter((n) => [...deps.get(n)!].every((d) => !remaining.has(d))).sort();
    if (ready.length === 0) {
      throw new BackupPlanError(`Ciclo de chaves estrangeiras entre: ${[...remaining].sort().join(', ')}`);
    }
    ordered.push(...ready);
    ready.forEach((n) => remaining.delete(n));
  }

  return {
    tables: ordered.map((name) => {
      const t = byName.get(name)!;
      return {
        name,
        columns: t.columns.filter((c) => !c.generated),
        primaryKey: t.primaryKey,
        scope: scopes.get(name)!,
      };
    }),
  };
}

// Condição SQL que isola as linhas do restaurante ($1 = tenantId). `alias`
// já vem quotado; profundidade evita colisão de alias nas subconsultas.
export function scopeCondition(plan: BackupPlan, table: PlanTable, alias: string, depth = 0): string {
  if (table.scope.kind === 'tenant') return `${alias}."tenant_id" = $1`;
  const { column, parent: parentName, parentColumn } = table.scope;
  const parentTable = plan.tables.find((t) => t.name === parentName);
  if (!parentTable) throw new BackupPlanError(`Pai "${parentName}" de "${table.name}" fora do plano.`);
  const pAlias = `s${depth + 1}`;
  return `${alias}.${quoteIdent(column)} IN (SELECT ${pAlias}.${quoteIdent(parentColumn)} FROM ${quoteIdent(parentName)} ${pAlias} WHERE ${scopeCondition(plan, parentTable, pAlias, depth + 1)})`;
}

// --------------------------------------------------------------- catálogo real

export async function loadCatalog(qr: QueryRunner): Promise<Catalog> {
  const columns: {
    table_name: string;
    column_name: string;
    is_nullable: string;
    column_default: string | null;
    is_generated: string;
    is_identity: string;
    identity_generation: string | null;
  }[] = await qr.query(`
    SELECT c.table_name, c.column_name, c.is_nullable, c.column_default, c.is_generated,
           c.is_identity, c.identity_generation
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public'
    ORDER BY c.table_name, c.ordinal_position
  `);

  const pks: { table_name: string; columns: string[] }[] = await qr.query(`
    SELECT cl.relname AS table_name,
           array_agg(a.attname ORDER BY k.ord)::text[] AS columns
    FROM pg_index i
    JOIN pg_class cl ON cl.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
    CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
    JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attnum = k.attnum
    WHERE i.indisprimary
    GROUP BY cl.relname
  `);

  const fks: {
    table_name: string;
    columns: string[];
    ref_table: string;
    ref_columns: string[];
    on_delete: string;
  }[] = await qr.query(`
    SELECT cl.relname AS table_name,
           (SELECT array_agg(a.attname ORDER BY u.ord) FROM unnest(co.conkey) WITH ORDINALITY u(attnum, ord)
              JOIN pg_attribute a ON a.attrelid = co.conrelid AND a.attnum = u.attnum)::text[] AS columns,
           rcl.relname AS ref_table,
           (SELECT array_agg(a.attname ORDER BY u.ord) FROM unnest(co.confkey) WITH ORDINALITY u(attnum, ord)
              JOIN pg_attribute a ON a.attrelid = co.confrelid AND a.attnum = u.attnum)::text[] AS ref_columns,
           CASE co.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE'
                               WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS on_delete
    FROM pg_constraint co
    JOIN pg_class cl ON cl.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
    JOIN pg_class rcl ON rcl.oid = co.confrelid
    WHERE co.contype = 'f'
  `);

  const tables = new Map<string, CatalogTable>();
  for (const c of columns) {
    if (!tables.has(c.table_name)) tables.set(c.table_name, { name: c.table_name, columns: [], primaryKey: [] });
    tables.get(c.table_name)!.columns.push({
      name: c.column_name,
      nullable: c.is_nullable === 'YES',
      hasDefault: c.column_default !== null || c.is_identity === 'YES',
      generated: c.is_generated === 'ALWAYS' || (c.is_identity === 'YES' && c.identity_generation === 'ALWAYS'),
    });
  }
  for (const pk of pks) if (tables.has(pk.table_name)) tables.get(pk.table_name)!.primaryKey = pk.columns;

  return {
    tables: [...tables.values()].sort((a, b) => a.name.localeCompare(b.name)),
    foreignKeys: fks.map((f) => ({
      table: f.table_name,
      columns: f.columns,
      refTable: f.ref_table,
      refColumns: f.ref_columns,
      onDelete: f.on_delete as OnDeleteAction,
    })),
  };
}
