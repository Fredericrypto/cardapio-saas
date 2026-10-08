// Ferramenta de EMERGÊNCIA: abre um arquivo de backup (.enc) fora do sistema —
// por exemplo, se o servidor estiver fora do ar ou você quiser conferir o que há
// dentro. NÃO restaura nada: só descriptografa, confere as somas SHA-256 de cada
// tabela e grava um JSON legível.
//
//   BACKUP_ENCRYPTION_KEY='<sua chave>' npx ts-node src/modules/backups/cli/decrypt-backup.ts arquivo.json.gz.enc saida.json
//
// A chave vem SOMENTE da variável de ambiente (nunca como argumento, para não
// ficar no histórico do terminal).
import { promises as fs } from 'fs';
import { decryptBackup, readBackupHeader } from '../backup-crypto';
import { parseSnapshot } from '../backup-container';

async function main(): Promise<void> {
  const [input, output] = process.argv.slice(2);
  const key = process.env.BACKUP_ENCRYPTION_KEY;
  if (!input || !output || !key) {
    console.error('Uso: BACKUP_ENCRYPTION_KEY=... ts-node decrypt-backup.ts <arquivo.enc> <saida.json>');
    process.exit(2);
  }
  const file = await fs.readFile(input);
  const header = readBackupHeader(file);
  const doc = parseSnapshot(decryptBackup(file, { tenantId: header.tenantId, backupId: header.backupId }, key), header.tenantId);
  const readable = {
    ...doc,
    tables: doc.tables.map((t) => ({ name: t.name, rowCount: t.rowCount, sha256: t.sha256, rows: JSON.parse(t.rows) as unknown[] })),
  };
  await fs.writeFile(output, JSON.stringify(readable, null, 2), { mode: 0o600 });
  const total = doc.tables.reduce((s, t) => s + t.rowCount, 0);
  console.log(`OK: ${doc.tables.length} tabelas, ${total} linhas (restaurante ${doc.tenantSlug}, criado em ${doc.createdAt}). Integridade SHA-256 conferida.`);
  console.log(`ATENÇÃO: "${output}" contém dados em texto aberto — apague depois de usar.`);
}

main().catch((e: unknown) => {
  console.error('Falha:', e instanceof Error ? e.message : e);
  process.exit(1);
});
