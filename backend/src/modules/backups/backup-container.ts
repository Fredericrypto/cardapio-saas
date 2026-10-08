import { createHash } from 'crypto';
import { gunzipSync, gzipSync } from 'zlib';

// Conteúdo do snapshot (antes de criptografar): um JSON comprimido com gzip.
//
// As linhas de cada tabela ficam como UMA STRING (o texto jsonb exato que o
// Postgres produziu), e não como array JSON aninhado, de propósito: assim os
// números `numeric` (R$ 12.50) e timestamps passam do banco para o arquivo e do
// arquivo para o banco SEM jamais passar por um parse do JavaScript (que
// transformaria 12.50 em 12.5 e arredondaria inteiros grandes). O SHA-256 por
// tabela cobre exatamente esse texto.

export const SNAPSHOT_KIND = 'cardapio-saas-tenant-snapshot';
export const SNAPSHOT_FORMAT = 1;
export const MAX_SNAPSHOT_BYTES = 256 * 1024 * 1024;

export interface SnapshotTable {
  name: string;
  columns: string[];
  rowCount: number;
  sha256: string;
  rows: string; // texto jsonb: array de linhas
}

export interface SnapshotDocument {
  kind: typeof SNAPSHOT_KIND;
  format: typeof SNAPSHOT_FORMAT;
  createdAt: string;
  tenantId: string;
  tenantSlug: string;
  schemaHead: string | null;
  tables: SnapshotTable[];
}

export class BackupFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupFormatError';
  }
}

export function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export function serializeSnapshot(doc: SnapshotDocument): Buffer {
  return gzipSync(Buffer.from(JSON.stringify(doc), 'utf8'), { level: 9 });
}

export function parseSnapshot(gz: Buffer, expectedTenantId: string): SnapshotDocument {
  let json: string;
  try {
    json = gunzipSync(gz, { maxOutputLength: MAX_SNAPSHOT_BYTES }).toString('utf8');
  } catch {
    throw new BackupFormatError('Conteúdo do backup ilegível (compressão inválida ou grande demais).');
  }
  let doc: SnapshotDocument;
  try {
    doc = JSON.parse(json) as SnapshotDocument;
  } catch {
    throw new BackupFormatError('Conteúdo do backup ilegível (JSON inválido).');
  }
  if (!doc || doc.kind !== SNAPSHOT_KIND || doc.format !== SNAPSHOT_FORMAT) {
    throw new BackupFormatError('Arquivo não é um snapshot do Cardápio SaaS em formato suportado.');
  }
  if (doc.tenantId !== expectedTenantId) {
    throw new BackupFormatError('Este backup pertence a outro estabelecimento.');
  }
  if (!Array.isArray(doc.tables) || doc.tables.length === 0) {
    throw new BackupFormatError('Backup sem tabelas.');
  }
  const seen = new Set<string>();
  for (const t of doc.tables) {
    if (
      !t ||
      typeof t.name !== 'string' ||
      !Array.isArray(t.columns) ||
      t.columns.some((c) => typeof c !== 'string') ||
      !Number.isInteger(t.rowCount) ||
      t.rowCount < 0 ||
      typeof t.rows !== 'string' ||
      typeof t.sha256 !== 'string'
    ) {
      throw new BackupFormatError('Estrutura de tabela inválida no backup.');
    }
    if (seen.has(t.name)) throw new BackupFormatError(`Tabela duplicada no backup: ${t.name}`);
    seen.add(t.name);
    if (sha256Hex(t.rows) !== t.sha256) {
      throw new BackupFormatError(`Falha de integridade na tabela "${t.name}" (SHA-256 não confere).`);
    }
  }
  return doc;
}
