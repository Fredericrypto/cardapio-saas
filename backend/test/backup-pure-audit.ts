// Auditoria do módulo de backup — partes puras (sem banco): agenda, retenção,
// criptografia, container e montagem do plano (fail-closed).
import { randomUUID, createHash } from 'crypto';
import { gzipSync } from 'zlib';
import {
  addDays, isDue, isValidRunTime, nextOccurrenceAfter, nextRunAfterCompletion,
  selectBackupsToPurge, zonedWallTimeToUtc, zonedYMD,
} from '../src/modules/backups/backup-schedule';
import {
  BackupCryptoError, decryptBackup, encryptBackup, isValidBackupKey, readBackupHeader,
} from '../src/modules/backups/backup-crypto';
import {
  BackupFormatError, parseSnapshot, serializeSnapshot, sha256Hex, SNAPSHOT_FORMAT, SNAPSHOT_KIND, SnapshotDocument,
} from '../src/modules/backups/backup-container';
import {
  buildPlan, BackupPlanError, Catalog, quoteIdent, scopeCondition,
} from '../src/modules/backups/backup-plan';
import { createChecker } from './helpers';

const { ok, finish } = createChecker();
const throws = (fn: () => unknown, cls?: new (...a: never[]) => Error): boolean => {
  try { fn(); return false; } catch (e) { return cls ? e instanceof cls : true; }
};
const iso = (d: Date) => d.toISOString();

console.log('— agenda (America/Sao_Paulo, sem horário de verão desde 2019)');
ok(isValidRunTime('04:00') && isValidRunTime('23:59') && isValidRunTime('00:00'), 'HH:MM válidos');
ok(!isValidRunTime('24:00') && !isValidRunTime('4:00') && !isValidRunTime('04:60') && !isValidRunTime('') && !isValidRunTime(null) && !isValidRunTime('04:00:00'), 'HH:MM inválidos recusados');
// 04:00 BRT = 07:00 UTC
ok(iso(nextOccurrenceAfter(new Date('2026-10-08T06:10:00Z'), '04:00')) === '2026-10-08T07:00:00.000Z', 'antes do horário: sai hoje 04:00 BRT');
ok(iso(nextOccurrenceAfter(new Date('2026-10-08T07:00:00Z'), '04:00')) === '2026-10-09T07:00:00.000Z', 'exatamente no horário: ESTRITAMENTE depois → amanhã');
ok(iso(nextOccurrenceAfter(new Date('2026-10-08T12:00:00Z'), '04:00')) === '2026-10-09T07:00:00.000Z', 'depois do horário: amanhã');
// 02:30 UTC de 09/10 ainda é dia 08 em Brasília (23:30)
ok(iso(nextOccurrenceAfter(new Date('2026-10-09T02:30:00Z'), '23:45')) === '2026-10-09T02:45:00.000Z', 'dia local ≠ dia UTC: 23:30 BRT → 23:45 BRT do mesmo dia local');
ok(iso(nextRunAfterCompletion(new Date('2026-10-08T07:05:00Z'), 3, '04:00')) === '2026-10-11T07:00:00.000Z', '3 dias após o dia real da execução');
ok(iso(nextRunAfterCompletion(new Date('2026-10-08T07:05:00Z'), 30, '04:00')) === '2026-11-07T07:00:00.000Z', 'mensal = +30 dias');
ok(iso(nextRunAfterCompletion(new Date('2026-12-31T20:00:00Z'), 7, '04:00')) === '2027-01-07T07:00:00.000Z', 'virada de ano');
ok(iso(nextRunAfterCompletion(new Date('2028-02-27T20:00:00Z'), 3, '04:00')) === '2028-03-01T07:00:00.000Z', 'ano bissexto (29/02 existe)');
ok(throws(() => nextRunAfterCompletion(new Date(), 0, '04:00')) && throws(() => nextRunAfterCompletion(new Date(), 1.5, '04:00')), 'frequência inválida recusada');
// servidor dormiu 40 dias: um só backup e cadência recomeça (sem rajada)
const wake = new Date('2026-11-17T12:00:00Z');
ok(iso(nextRunAfterCompletion(wake, 3, '04:00')) === '2026-11-20T07:00:00.000Z', 'após longa pausa: próximo = +3 dias do dia real (sem rajada)');
ok(isDue(new Date('2026-10-08T07:00:00Z'), new Date('2026-10-08T07:00:00Z')) && !isDue(new Date('2026-10-08T07:00:01Z'), new Date('2026-10-08T07:00:00Z')) && !isDue(null, new Date()), 'isDue: <=, null nunca vence');
// fuso com horário de verão (prova de que a matemática não depende do BRT fixo)
const NY = 'America/New_York';
ok(iso(zonedWallTimeToUtc({ year: 2026, month: 3, day: 7 }, 4, 0, NY)) === '2026-03-07T09:00:00.000Z', 'NY antes do DST: 04:00 = 09:00Z');
ok(iso(zonedWallTimeToUtc({ year: 2026, month: 3, day: 9 }, 4, 0, NY)) === '2026-03-09T08:00:00.000Z', 'NY depois do DST: 04:00 = 08:00Z');
ok(iso(nextRunAfterCompletion(new Date('2026-03-07T20:00:00Z'), 3, '04:00', NY)) === '2026-03-10T08:00:00.000Z', 'cadência atravessa o DST mantendo 04:00 locais');
ok(JSON.stringify(addDays({ year: 2026, month: 1, day: 31 }, 1)) === JSON.stringify({ year: 2026, month: 2, day: 1 }), 'addDays vira o mês');
ok(JSON.stringify(zonedYMD(new Date('2026-10-09T02:30:00Z'))) === JSON.stringify({ year: 2026, month: 10, day: 8 }), 'zonedYMD usa o dia de Brasília');
// varredura: 3 anos de horários em 2 fusos — sempre estritamente no futuro e HH:MM local exato
{
  let bad = 0;
  for (const tz of ['America/Sao_Paulo', NY, 'Europe/London']) {
    const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    for (let i = 0; i < 1100; i++) {
      const from = new Date(Date.UTC(2025, 0, 1) + i * 86400000 + (i * 7919 % 86400) * 1000);
      const next = nextOccurrenceAfter(from, '03:30', tz);
      if (next.getTime() <= from.getTime() || next.getTime() - from.getTime() > 25 * 3600000 || fmt.format(next) !== '03:30') bad++;
    }
  }
  ok(bad === 0, `varredura 3 fusos × 1100 instantes: próximo sempre futuro, ≤25h e HH:MM local exato (${bad} erros)`);
}

console.log('— retenção');
const D = 86400000;
const now = new Date('2026-10-08T12:00:00Z');
const mk = (id: string, status: string, ageDays: number) => ({ id, status, createdAt: new Date(now.getTime() - ageDays * D) });
{
  const list = [mk('old1', 'concluido', 100), mk('old2', 'concluido', 95), mk('new', 'concluido', 10), mk('proc', 'processando', 200), mk('rest', 'restaurando', 200), mk('fail', 'falhou', 120)];
  const purge = selectBackupsToPurge(list, 90, now).sort();
  ok(JSON.stringify(purge) === JSON.stringify(['fail', 'old1', 'old2']), 'apaga velhos e falhos; nunca em andamento');
  const all = [mk('a', 'concluido', 200), mk('b', 'concluido', 150)];
  ok(JSON.stringify(selectBackupsToPurge(all, 90, now)) === JSON.stringify(['a']), 'preserva o utilizável mais recente mesmo vencido');
  ok(selectBackupsToPurge([mk('x', 'restaurado', 400)], 90, now).length === 0, 'único backup (restaurado) nunca é apagado');
  ok(selectBackupsToPurge([mk('b90', 'concluido', 90), mk('n', 'concluido', 1)], 90, now).length === 0, 'limite: exatamente 90 dias NÃO vence (estritamente mais antigo)');
  ok(selectBackupsToPurge([mk('p', 'falhou', 91), mk('q', 'concluido', 1)], 90, now)[0] === 'p', 'falho vencido é limpo');
}

console.log('— criptografia AES-256-GCM');
const KEY = 'k'.repeat(40);
const ctx = { tenantId: randomUUID(), backupId: randomUUID() };
const plain = Buffer.from(JSON.stringify({ x: 'ação ✓ 12.50' }));
const enc = encryptBackup(plain, ctx, KEY);
ok(decryptBackup(enc, ctx, KEY).equals(plain), 'ida e volta exata');
ok(!enc.includes(Buffer.from('ação')), 'texto claro não aparece no arquivo');
ok(JSON.stringify(readBackupHeader(enc)) === JSON.stringify({ ...ctx, version: 1 }) || (readBackupHeader(enc).tenantId === ctx.tenantId && readBackupHeader(enc).backupId === ctx.backupId), 'cabeçalho legível sem chave');
ok(!encryptBackup(plain, ctx, KEY).equals(enc), 'salt/iv aleatórios: mesmo conteúdo, arquivo diferente');
ok(throws(() => decryptBackup(enc, ctx, 'z'.repeat(40)), BackupCryptoError), 'chave errada recusada');
ok(throws(() => decryptBackup(enc, { ...ctx, tenantId: randomUUID() }, KEY), BackupCryptoError), 'tenant diferente recusado');
ok(throws(() => decryptBackup(enc, { ...ctx, backupId: randomUUID() }, KEY), BackupCryptoError), 'backupId diferente recusado');
{
  let accepted = 0;
  for (const pos of [0, 4, 6, 25, 40, 60, 70, enc.length - 20, enc.length - 1]) {
    const t = Buffer.from(enc); t[pos] ^= 1;
    try { decryptBackup(t, null, KEY); accepted++; } catch { /* esperado */ }
  }
  ok(accepted === 0, 'qualquer bit alterado (magic, versão, ids, salt, iv, corpo, tag) é rejeitado');
  // cabeçalho trocado (tenant) com expected=null deve falhar pelo AAD
  const swapped = Buffer.from(enc); randomUUID().replace(/-/g, '').match(/../g)!.slice(0, 16).forEach((h, i) => { swapped[5 + i] = parseInt(h, 16); });
  ok(throws(() => decryptBackup(swapped, null, KEY), BackupCryptoError), 'tenant do cabeçalho adulterado falha pelo AAD (mesmo sem comparar)');
}
ok(throws(() => decryptBackup(enc.subarray(0, 30), ctx, KEY), BackupCryptoError) && throws(() => decryptBackup(Buffer.alloc(0), ctx, KEY), BackupCryptoError), 'truncado/vazio recusado');
ok(throws(() => encryptBackup(plain, ctx, 'curta'), BackupCryptoError) && throws(() => encryptBackup(plain, ctx, ' ' + KEY), BackupCryptoError), 'chave curta ou com espaço nas pontas recusada');
ok(isValidBackupKey(KEY) && !isValidBackupKey(undefined) && !isValidBackupKey('') && !isValidBackupKey('a'.repeat(31)), 'isValidBackupKey');
ok(decryptBackup(encryptBackup(Buffer.alloc(0), ctx, KEY), ctx, KEY).length === 0, 'conteúdo vazio funciona');
{
  const big = Buffer.alloc(5 * 1024 * 1024, 7);
  ok(decryptBackup(encryptBackup(big, ctx, KEY), ctx, KEY).equals(big), '5 MB ida e volta');
}

console.log('— container do snapshot');
const rowsA = JSON.stringify([{ id: 1, v: '12.50' }]);
const doc: SnapshotDocument = {
  kind: SNAPSHOT_KIND, format: SNAPSHOT_FORMAT, createdAt: new Date().toISOString(), tenantId: ctx.tenantId, tenantSlug: 's', schemaHead: '1',
  tables: [{ name: 'categories', columns: ['id', 'v'], rowCount: 1, sha256: sha256Hex(rowsA), rows: rowsA }],
};
{
  const gz = serializeSnapshot(doc);
  const back = parseSnapshot(gz, ctx.tenantId);
  ok(back.tables[0].rows === rowsA && back.tables[0].sha256 === sha256Hex(rowsA), 'ida e volta preserva o texto das linhas byte a byte');
  ok(sha256Hex('abc') === createHash('sha256').update('abc').digest('hex'), 'sha256Hex = SHA-256 padrão');
  ok(throws(() => parseSnapshot(gz, randomUUID()), BackupFormatError), 'tenant diferente recusado');
  const tampered = { ...doc, tables: [{ ...doc.tables[0], rows: JSON.stringify([{ id: 1, v: '99.99' }]) }] };
  ok(throws(() => parseSnapshot(serializeSnapshot(tampered), ctx.tenantId), BackupFormatError), 'linhas alteradas (sha256 não bate) recusadas');
  ok(throws(() => parseSnapshot(serializeSnapshot({ ...doc, kind: 'outro' } as unknown as SnapshotDocument), ctx.tenantId), BackupFormatError), 'kind errado recusado');
  ok(throws(() => parseSnapshot(serializeSnapshot({ ...doc, format: 99 } as unknown as SnapshotDocument), ctx.tenantId), BackupFormatError), 'formato futuro recusado');
  ok(throws(() => parseSnapshot(Buffer.from('lixo'), ctx.tenantId), BackupFormatError), 'não-gzip recusado');
  ok(throws(() => parseSnapshot(gzipSync(Buffer.from('{"a":')), ctx.tenantId), BackupFormatError), 'JSON quebrado recusado');
  ok(throws(() => parseSnapshot(serializeSnapshot({ ...doc, tables: [doc.tables[0], doc.tables[0]] }), ctx.tenantId), BackupFormatError), 'tabela duplicada recusada');
}

console.log('— plano (fail-closed)');
const col = (name: string, nullable = false, hasDefault = false, generated = false) => ({ name, nullable, hasDefault, generated });
const cat = (): Catalog => ({
  tables: [
    { name: 'tenants', columns: [col('id')], primaryKey: ['id'] },
    { name: 'categories', columns: [col('id'), col('tenant_id')], primaryKey: ['id'] },
    { name: 'products', columns: [col('id'), col('tenant_id'), col('category_id', true)], primaryKey: ['id'] },
    { name: 'order_items', columns: [col('id'), col('order_id')], primaryKey: ['id'] },
    { name: 'orders', columns: [col('id'), col('tenant_id')], primaryKey: ['id'] },
  ],
  foreignKeys: [
    { table: 'products', columns: ['category_id'], refTable: 'categories', refColumns: ['id'], onDelete: 'SET NULL' },
    { table: 'order_items', columns: ['order_id'], refTable: 'orders', refColumns: ['id'], onDelete: 'CASCADE' },
  ],
});
{
  const plan = buildPlan(cat());
  const names = plan.tables.map((t) => t.name);
  ok(!names.includes('tenants'), 'tenants excluída');
  ok(names.indexOf('orders') < names.indexOf('order_items') && names.indexOf('categories') < names.indexOf('products'), 'ordem topológica: pais antes dos filhos');
  const oi = plan.tables.find((t) => t.name === 'order_items')!;
  ok(oi.scope.kind === 'via', 'order_items escopada via FK NOT NULL para orders');
  ok(/order_id.*IN \(SELECT/.test(scopeCondition(plan, oi, 't')) && scopeCondition(plan, oi, 't').includes('tenant_id'), 'condição de escopo percorre a cadeia até tenant_id');
  const c2 = cat();
  c2.tables.push({ name: 'mystery', columns: [col('id'), col('note')], primaryKey: ['id'] });
  ok(throws(() => buildPlan(c2), BackupPlanError), 'tabela nova sem tenant_id nem FK: RECUSA (não ignora em silêncio)');
  const c3 = cat();
  c3.tables.push({ name: 'nopk', columns: [col('tenant_id')], primaryKey: [] });
  ok(throws(() => buildPlan(c3), BackupPlanError), 'tabela sem chave primária recusada');
  const c4 = cat();
  c4.tables.push({ name: 'child', columns: [col('id'), col('order_id', true)], primaryKey: ['id'] });
  c4.foreignKeys.push({ table: 'child', columns: ['order_id'], refTable: 'orders', refColumns: ['id'], onDelete: 'CASCADE' });
  ok(throws(() => buildPlan(c4), BackupPlanError), 'FK anulável como único caminho de escopo recusada');
  const c5 = cat();
  c5.tables.push({ name: 'Bad-Name', columns: [col('tenant_id'), col('id')], primaryKey: ['id'] });
  ok(throws(() => buildPlan(c5)), 'identificador SQL fora do padrão recusado');
  ok(throws(() => quoteIdent('a"; drop table x;--'), BackupPlanError), 'quoteIdent bloqueia injeção');
  // tabela incluída que referencia tabela EXCLUÍDA com CASCADE não é problema; já excluída → referenciar incluída com CASCADE é perigo
  const c6 = cat();
  c6.tables.push({ name: 'admin_users', columns: [col('id'), col('order_id', true)], primaryKey: ['id'] });
  c6.foreignKeys.push({ table: 'admin_users', columns: ['order_id'], refTable: 'orders', refColumns: ['id'], onDelete: 'CASCADE' });
  ok(throws(() => buildPlan(c6), BackupPlanError), 'tabela excluída com CASCADE para tabela incluída: recusa (restore apagaria dados fora do backup)');
}
process.exit(finish());
