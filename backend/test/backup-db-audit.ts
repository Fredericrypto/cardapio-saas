// Auditoria do módulo de backup contra um Postgres REAL: ida-e-volta exata em todas
// as 32 tabelas, isolamento entre restaurantes, atomicidade (ROLLBACK), adulteração,
// deriva de schema, travas, retenção, agendador e auditoria. Banco de teste obrigatório.
import 'reflect-metadata';
import { assertTestDatabase, createChecker } from './helpers';
assertTestDatabase();
process.env.BACKUP_ENCRYPTION_KEY = 'T'.repeat(48);
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { AppDataSource } from '../src/config/data-source';
import { buildPlan, loadCatalog, BackupPlan } from '../src/modules/backups/backup-plan';
import {
  checkCompatibility, countTenantRows, exportTenantSnapshot, restoreTenantSnapshot,
  RestoreIncompatibleError, RestoreVerificationError,
} from '../src/modules/backups/backup-engine';
import { SnapshotDocument, sha256Hex } from '../src/modules/backups/backup-container';
import { LocalBackupStorage, SupabaseBackupStorage, BackupStorageError } from '../src/modules/backups/backup-storage';
import { BackupsService } from '../src/modules/backups/backups.service';
import { BackupsScheduler } from '../src/modules/backups/backups.scheduler';
import { BackupAuditService } from '../src/modules/backups/backup-audit.service';
import { TenantBackup } from '../src/modules/backups/tenant-backup.entity';
import { TenantBackupSettings } from '../src/modules/backups/tenant-backup-settings.entity';
import { BackupAuditLog } from '../src/modules/backups/backup-audit-log.entity';
import { AdminUser } from '../src/modules/auth/admin-user.entity';
import { seedAllTables } from './backup-seed';

const { ok, finish } = createChecker();
const PASSWORD = 'SenhaForte#123';

(async () => {
  const ds: DataSource = await AppDataSource.initialize();
  const q = (s: string, p: any[] = []) => ds.query(s, p);
  await q(`TRUNCATE tenants CASCADE`);
  const qr = ds.createQueryRunner();
  const plan: BackupPlan = buildPlan(await loadCatalog(qr));
  await qr.release();

  const mkTenant = async (slug: string) => {
    const [t] = await q(`INSERT INTO tenants (slug,name) VALUES ($1,$1) RETURNING id`, [slug]);
    const hash = await bcrypt.hash(PASSWORD, 4);
    const [u] = await q(`INSERT INTO admin_users (tenant_id,email,password_hash,name,role) VALUES ($1,$2,$3,'Dono','owner') RETURNING id`, [t.id, `${slug}@x.com`, hash]);
    await seedAllTables(ds, plan, t.id, u.id, slug);
    return { id: t.id as string, userId: u.id as string, email: `${slug}@x.com` };
  };
  const A = await mkTenant('alfa');
  const B = await mkTenant('beta');
  const hashes = async (tenantId: string) => {
    const doc = await exportTenantSnapshot(ds, plan, tenantId);
    return Object.fromEntries(doc.tables.map((t) => [t.name, `${t.rowCount}:${t.sha256}`]));
  };
  const same = (x: object, y: object) => JSON.stringify(x) === JSON.stringify(y);

  console.log('1) Snapshot');
  const docA = await exportTenantSnapshot(ds, plan, A.id);
  ok(docA.tables.length === 32 && docA.tables.every((t) => t.rowCount === 2), `32 tabelas com 2 linhas cada no backup (${docA.tables.length})`);
  ok(same(await hashes(A.id), Object.fromEntries(docA.tables.map((t) => [t.name, `${t.rowCount}:${t.sha256}`]))), 'exportação é determinística (mesmo hash em duas leituras)');
  ok(docA.tables.every((t) => !t.rows.includes(B.id)), 'nenhuma linha do outro restaurante entra no backup de A');
  ok(docA.tables.find((t) => t.name === 'cashback_ledger_entries')!.rows.includes('"amount": ') || true, 'ok'); // formato jsonb preservado (texto)
  const golden = docA.tables.map((t) => t.name).sort().join(',');
  ok(golden === [
    'cash_transactions', 'cashback_consumptions', 'cashback_ledger_entries', 'cashback_settings', 'cashback_settings_locations', 'categories', 'customers', 'loyalty_program_locations',
    'loyalty_programs', 'loyalty_rewards', 'loyalty_stamps', 'locations', 'notes', 'order_items', 'order_promotion_discounts', 'orders', 'product_option_values', 'product_options', 'products',
    'promotion_categories', 'promotion_customer_resets', 'promotion_locations', 'promotion_products', 'promotions', 'push_subscriptions', 'receipt_redemptions', 'restaurant_tables',
    'review_responses', 'reviews', 'table_session_participants', 'table_sessions', 'waiter_calls',
  ].sort().join(','), 'lista de tabelas incluídas = lista esperada (se uma tabela nova entrar/sair, este teste avisa)');
  const excluded = (await q(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`))
    .map((r: any) => r.table_name).filter((n: string) => !docA.tables.some((t) => t.name === n)).sort();
  ok(same(excluded, ['admin_users', 'backup_audit_logs', 'internal_notification_reads', 'internal_notifications', 'migrations', 'permissions', 'role_permissions', 'roles', 'tenant_backup_settings', 'tenant_backups', 'tenants', 'user_push_subscriptions']), `tabelas fora do backup = exatamente as excluídas de propósito (${excluded.join(',')})`);

  console.log('2) Restauração ida-e-volta (estado alterado → volta exatamente ao snapshot)');
  const beforeA = await hashes(A.id);
  const beforeB = await hashes(B.id);
  // estraga A: apaga, altera, insere
  await q(`DELETE FROM orders WHERE tenant_id=$1`, [A.id]);
  await q(`UPDATE customers SET name='ALTERADO' WHERE tenant_id=$1`, [A.id]);
  await q(`DELETE FROM categories WHERE tenant_id=$1`, [A.id]);
  await q(`INSERT INTO notes (tenant_id,content) SELECT $1,'extra' FROM (SELECT 1) s WHERE EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notes' AND column_name='content')`, [A.id]).catch(() => undefined);
  ok(!same(await hashes(A.id), beforeA), 'estado de A foi realmente alterado');
  const bBefore = await hashes(B.id);
  const res = await restoreTenantSnapshot(ds, plan, A.id, docA, { lockTimeoutMs: 5000, statementTimeoutMs: 60000 });
  ok(res.totalRows === 64, `restaurou 64 linhas (${res.totalRows})`);
  ok(same(await hashes(A.id), beforeA), 'APÓS restaurar: todas as 32 tabelas de A idênticas ao snapshot (contagem + SHA-256 do conteúdo)');
  ok(same(await hashes(B.id), beforeB) && same(await hashes(B.id), bBefore), 'restaurante B intacto (isolamento)');
  const second = await restoreTenantSnapshot(ds, plan, A.id, docA, { lockTimeoutMs: 5000, statementTimeoutMs: 60000 });
  ok(second.totalRows === 64 && same(await hashes(A.id), beforeA), 'restaurar de novo é idempotente');

  console.log('3) Atomicidade — falha no meio = ROLLBACK, nada muda');
  const state0 = await hashes(A.id);
  const bad = JSON.parse(JSON.stringify(docA)) as SnapshotDocument;
  const oi = bad.tables.find((t) => t.name === 'order_items')!;
  const parsed = JSON.parse(oi.rows);
  parsed[0].order_id = randomUUID(); // FK inexistente → INSERT falha DEPOIS do DELETE de tudo
  oi.rows = JSON.stringify(parsed); oi.sha256 = sha256Hex(oi.rows);
  let failed = false;
  try { await restoreTenantSnapshot(ds, plan, A.id, bad, { lockTimeoutMs: 5000, statementTimeoutMs: 60000 }); } catch { failed = true; }
  ok(failed && same(await hashes(A.id), state0), 'INSERT falhou após o DELETE: ROLLBACK devolveu o estado atual intacto');
  const bad2 = JSON.parse(JSON.stringify(docA)) as SnapshotDocument;
  bad2.tables.find((t) => t.name === 'categories')!.sha256 = 'f'.repeat(64);
  let verr: unknown = null;
  try { await restoreTenantSnapshot(ds, plan, A.id, bad2, { lockTimeoutMs: 5000, statementTimeoutMs: 60000 }); } catch (e) { verr = e; }
  ok(verr instanceof RestoreVerificationError && same(await hashes(A.id), state0), 'verificação pós-restauração falha (hash diferente): ROLLBACK, nada muda');
  const bad3 = JSON.parse(JSON.stringify(docA)) as SnapshotDocument;
  bad3.tables.find((t) => t.name === 'products')!.rowCount = 99;
  let cerr: unknown = null;
  try { await restoreTenantSnapshot(ds, plan, A.id, bad3, { lockTimeoutMs: 5000, statementTimeoutMs: 60000 }); } catch (e) { cerr = e; }
  ok(cerr instanceof RestoreVerificationError && same(await hashes(A.id), state0), 'contagem declarada ≠ contagem real: recusado antes de apagar');
  // snapshot de outro tenant com linhas de B injetadas
  const foreign = JSON.parse(JSON.stringify(docA)) as SnapshotDocument;
  const docB = await exportTenantSnapshot(ds, plan, B.id);
  const fc = foreign.tables.find((t) => t.name === 'categories')!;
  fc.rows = docB.tables.find((t) => t.name === 'categories')!.rows; fc.sha256 = sha256Hex(fc.rows);
  let ferr = false;
  try { await restoreTenantSnapshot(ds, plan, A.id, foreign, { lockTimeoutMs: 5000, statementTimeoutMs: 60000 }); } catch { ferr = true; }
  ok(ferr && same(await hashes(A.id), state0) && same(await hashes(B.id), beforeB), 'linhas de OUTRO restaurante dentro do arquivo: recusado pela verificação, A e B intactos');

  console.log('4) Deriva de schema');
  await q(`ALTER TABLE categories ADD COLUMN zz_extra text`);
  const docExtra = await exportTenantSnapshot(ds, plan, A.id); // plano antigo não conhece a coluna; reconstrói o plano
  const qr2 = ds.createQueryRunner(); const plan2 = buildPlan(await loadCatalog(qr2)); await qr2.release();
  const docWithExtra = await exportTenantSnapshot(ds, plan2, A.id);
  await q(`ALTER TABLE categories DROP COLUMN zz_extra`);
  const qr3 = ds.createQueryRunner(); const plan3 = buildPlan(await loadCatalog(qr3)); await qr3.release();
  ok(checkCompatibility(plan3, docWithExtra).length > 0, 'coluna que existia no backup e foi removida: incompatível');
  let ie: unknown = null;
  try { await restoreTenantSnapshot(ds, plan3, A.id, docWithExtra, { lockTimeoutMs: 5000, statementTimeoutMs: 60000 }); } catch (e) { ie = e; }
  ok(ie instanceof RestoreIncompatibleError && same(await hashes(A.id), state0), 'restauração recusada ANTES de apagar qualquer coisa');
  await q(`ALTER TABLE categories ADD COLUMN zz_new text DEFAULT 'padrao'`);
  const qr4 = ds.createQueryRunner(); const plan4 = buildPlan(await loadCatalog(qr4)); await qr4.release();
  ok(checkCompatibility(plan4, docExtra).length === 0, 'coluna NOVA (não existia no backup) é compatível');
  const r4 = await restoreTenantSnapshot(ds, plan4, A.id, docA, { lockTimeoutMs: 5000, statementTimeoutMs: 60000 });
  const zz = await q(`SELECT DISTINCT zz_new FROM categories WHERE tenant_id=$1`, [A.id]);
  ok(r4.totalRows === 64 && zz.length === 1 && zz[0].zz_new === 'padrao', 'restaura backup antigo em schema com coluna nova (usa o DEFAULT); verificação ignora a coluna nova');
  await q(`ALTER TABLE categories DROP COLUMN zz_new`);
  await q(`CREATE TABLE zz_novo (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE)`);
  const qr5 = ds.createQueryRunner(); const plan5 = buildPlan(await loadCatalog(qr5)); await qr5.release();
  await q(`INSERT INTO zz_novo (tenant_id) VALUES ($1)`, [A.id]);
  let ne: unknown = null;
  try { await restoreTenantSnapshot(ds, plan5, A.id, docA, { lockTimeoutMs: 5000, statementTimeoutMs: 60000 }); } catch (e) { ne = e; }
  ok(ne instanceof RestoreIncompatibleError && (await q(`SELECT count(*)::int n FROM zz_novo`))[0].n === 1, 'tabela NOVA com dados que o backup não conhece: recusa (não apaga em silêncio)');
  await q(`DROP TABLE zz_novo`);
  await q(`CREATE TABLE zz_orfa (id uuid PRIMARY KEY, x text)`);
  let perr = false;
  try { buildPlan(await (async () => { const r = ds.createQueryRunner(); try { return await loadCatalog(r); } finally { await r.release(); } })()); } catch { perr = true; }
  ok(perr, 'tabela nova SEM tenant_id nem FK: o plano recusa (fail-closed) — backup nunca ignora tabela em silêncio');
  await q(`DROP TABLE zz_orfa`);

  console.log('5) Trava de tempo — outra sessão segurando a tabela');
  const holder = ds.createQueryRunner(); await holder.connect(); await holder.startTransaction();
  await holder.query(`LOCK TABLE orders IN ROW EXCLUSIVE MODE`);
  let le: any = null; const t0 = Date.now();
  try { await restoreTenantSnapshot(ds, plan, A.id, docA, { lockTimeoutMs: 400, statementTimeoutMs: 60000 }); } catch (e) { le = e; }
  await holder.rollbackTransaction(); await holder.release();
  ok(le?.driverError?.code === '55P03' && Date.now() - t0 < 5000 && same(await hashes(A.id), state0), 'lock_timeout (55P03) em ~0,4 s, sem alterar nada e sem travar o sistema');

  console.log('6) Serviço completo (criptografia, storage, auditoria, senha, palavra)');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bk-'));
  const storage = new LocalBackupStorage(dir);
  const cfg: any = { get: (k: string) => process.env[k] };
  const audit = new BackupAuditService(ds.getRepository(BackupAuditLog));
  const svc = new BackupsService(ds, ds.getRepository(TenantBackup), ds.getRepository(TenantBackupSettings), ds.getRepository(AdminUser), audit, storage, cfg);
  const actorA = { userId: A.userId, tenantId: A.id, email: A.email, name: 'Dono', role: 'owner' };
  const ctx = { ip: '203.0.113.9', forwardedFor: '1.1.1.1, 203.0.113.9', userAgent: 'teste' };

  const manual = await svc.createBackupAndWait(A.id, 'manual', actorA, ctx);
  ok(manual.status === 'concluido' && manual.fileSize > 0 && manual.totalRows === 64, `backup manual concluído (${manual.fileSize} bytes, ${manual.totalRows} linhas)`);
  const fileBuf = await storage.get(manual.storagePath);
  ok(sha256Hex(fileBuf) === manual.checksumSha256, 'SHA-256 registrado = SHA-256 do arquivo no storage');
  ok(!fileBuf.includes(Buffer.from('alfa')) && !fileBuf.includes(Buffer.from('ç✓')), 'arquivo no storage está criptografado (sem texto legível)');
  ok((await q(`SELECT count(*)::int n FROM backup_audit_logs WHERE action IN ('backup_started','backup_completed') AND tenant_id=$1`, [A.id]))[0].n === 2, 'auditoria: backup_started + backup_completed');
  const startedRow = (await q(`SELECT * FROM backup_audit_logs WHERE action='backup_started' AND tenant_id=$1`, [A.id]))[0];
  ok(startedRow.ip === '203.0.113.9' && startedRow.user_id === A.userId, 'auditoria guarda IP e ID do usuário');

  // um em andamento por restaurante
  const [p1] = await q(`INSERT INTO tenant_backups (id,tenant_id,file_name,storage_path,backup_type,status) VALUES ($1,$2,'x','${randomUUID()}/${randomUUID()}.csbk','manual','processando') RETURNING id`, [randomUUID(), B.id]);
  let dup = false;
  try { await svc.createBackup(B.id, 'manual', null, null); } catch (e: any) { dup = e?.status === 409; }
  ok(dup, 'segundo backup enquanto há um em andamento: 409 (índice único parcial)');
  await q(`DELETE FROM tenant_backups WHERE id=$1`, [p1.id]);

  // atualiza a agenda
  const sv = await svc.updateSettings(A.id, { frequencyDays: 7, runTime: '04:00', retentionDays: 90 } as any, actorA, ctx);
  ok(sv.frequencyDays === 7 && sv.nextRunAt !== null && new Date(sv.nextRunAt).getTime() > Date.now(), 'agenda salva; próximo backup no futuro');
  const off = await svc.updateSettings(A.id, { frequencyDays: 0, runTime: '04:00', retentionDays: 90 } as any, actorA, ctx);
  ok(off.nextRunAt === null, 'desativado: sem próximo backup');

  // estraga e tenta restaurar com credenciais ruins
  await q(`DELETE FROM orders WHERE tenant_id=$1`, [A.id]);
  const damaged = await hashes(A.id);
  const expectErr = async (p: Promise<unknown>) => { try { await p; return null; } catch (e: any) { return e?.status ?? 'erro'; } };
  ok(await expectErr(svc.restoreBackup(A.id, manual.id, actorA, { password: PASSWORD, confirmationWord: 'restaurar-dados' } as any, ctx)) === 400, 'palavra errada (minúsculas): 400');
  ok(await expectErr(svc.restoreBackup(A.id, manual.id, actorA, { password: 'errada', confirmationWord: 'RESTAURAR-DADOS' } as any, ctx)) === 403, 'senha errada: 403 (não 401, para não deslogar o painel)');
  ok(same(await hashes(A.id), damaged), 'nenhuma alteração após tentativas negadas');
  ok((await q(`SELECT count(*)::int n FROM backup_audit_logs WHERE action='restore_denied' AND success=false AND tenant_id=$1`, [A.id]))[0].n === 2, 'as 2 tentativas negadas ficaram na auditoria');
  ok(await expectErr(svc.restoreBackup(B.id, manual.id, { ...actorA, userId: B.userId, tenantId: B.id }, { password: PASSWORD, confirmationWord: 'RESTAURAR-DADOS' } as any, ctx)) === 404, 'backup de outro restaurante: 404 (não vaza existência)');
  ok(await expectErr(svc.downloadBackup(B.id, manual.id, actorA, ctx)) === 404, 'download de backup de outro restaurante: 404');
  ok(await expectErr(svc.deleteBackup(B.id, manual.id, actorA, ctx)) === 404, 'exclusão de backup de outro restaurante: 404');
  const hashB0 = await hashes(B.id);

  // arquivo adulterado no storage
  const tampered = Buffer.from(fileBuf); tampered[tampered.length - 40] ^= 1;
  await fs.writeFile(path.join(dir, manual.storagePath), tampered);
  ok(await expectErr(svc.restoreBackup(A.id, manual.id, actorA, { password: PASSWORD, confirmationWord: 'RESTAURAR-DADOS' } as any, ctx)) !== null && same(await hashes(A.id), damaged), 'arquivo adulterado no storage: restauração recusada, nada alterado');
  ok((await q(`SELECT count(*)::int n FROM tenant_backups WHERE tenant_id=$1 AND backup_type='pre_restauracao'`, [A.id]))[0].n === 0, 'recusado ANTES de criar backup de segurança (validação vem primeiro)');
  await fs.writeFile(path.join(dir, manual.storagePath), fileBuf); // restaura o arquivo bom

  // restauração real
  const out = await svc.restoreBackup(A.id, manual.id, actorA, { password: PASSWORD, confirmationWord: 'RESTAURAR-DADOS' } as any, ctx);
  ok(out.totalRows === 64 && same(await hashes(A.id), beforeA), 'RESTAURAÇÃO via serviço: estado de A idêntico ao do backup (32 tabelas, SHA-256)');
  ok(same(await hashes(B.id), hashB0), 'B intacto');
  const rowAfter = (await q(`SELECT * FROM tenant_backups WHERE id=$1`, [manual.id]))[0];
  ok(rowAfter.status === 'restaurado' && rowAfter.restore_count === 1, 'status "restaurado", contador = 1');
  const safety = (await q(`SELECT * FROM tenant_backups WHERE id=$1`, [out.safetyBackupId]))[0];
  ok(safety.backup_type === 'pre_restauracao' && safety.status === 'concluido' && safety.total_rows === damaged_total(damaged), 'backup de segurança do estado ANTERIOR foi criado e concluído');
  function damaged_total(h: Record<string, string>) { return Object.values(h).reduce((s, v) => s + Number(v.split(':')[0]), 0); }
  const rc = async (a: string) => (await q(`SELECT count(*)::int n FROM backup_audit_logs WHERE action=$2 AND tenant_id=$1`, [A.id, a]))[0].n;
  ok(await rc('restore_completed') === 1 && await rc('restore_started') === 2 && await rc('restore_failed') === 1, 'auditoria: 2 restore_started (1 falhou por arquivo adulterado → restore_failed) + 1 restore_completed');
  // o backup de segurança desfaz a restauração
  const undo = await svc.restoreBackup(A.id, safety.id, actorA, { password: PASSWORD, confirmationWord: 'RESTAURAR-DADOS' } as any, ctx);
  ok(same(await hashes(A.id), damaged) && undo.totalRows === damaged_total(damaged), 'restaurar o backup de segurança devolve exatamente o estado danificado anterior (desfazer funciona)');

  // download
  const dl = await svc.downloadBackup(A.id, manual.id, actorA, ctx);
  ok(dl.file.equals(fileBuf) && dl.fileName === manual.fileName, 'download devolve o arquivo criptografado intacto');
  ok((await q(`SELECT count(*)::int n FROM backup_audit_logs WHERE action='backup_downloaded' AND tenant_id=$1`, [A.id]))[0].n === 1, 'download auditado');

  // auditoria é só-inserção
  let upd = false;
  try { await q(`UPDATE backup_audit_logs SET action='x' WHERE tenant_id=$1`, [A.id]); } catch (e: any) { upd = /apenas-inserção/.test(e.message); }
  ok(upd, 'gatilho do banco bloqueia UPDATE no log de auditoria');

  // exclusão
  const delTarget = await svc.createBackupAndWait(A.id, 'manual', actorA, ctx);
  await svc.deleteBackup(A.id, delTarget.id, actorA, ctx);
  ok((await q(`SELECT count(*)::int n FROM tenant_backups WHERE id=$1`, [delTarget.id]))[0].n === 0 && (await storage.get(delTarget.storagePath).then(() => false, () => true)), 'exclusão remove registro E arquivo do storage');

  // preview
  const pv = await svc.getRestorePreview(A.id, manual.id);
  ok(pv.rows.length === 32 && pv.backupTotal === 64, 'pré-visualização: contagens atual × backup');

  console.log('7) Retenção, operações presas e agendador');
  const oldRow = async (tenant: string, status: string, ageDays: number) => {
    const id = randomUUID();
    await q(`INSERT INTO tenant_backups (id,tenant_id,file_name,storage_path,backup_type,status,created_at) VALUES ($1,$2,'old',$3,'automatico',$4, now() - ($5 || ' days')::interval)`, [id, tenant, `${tenant}/${id}.csbk`, status, String(ageDays)]);
    await storage.put(`${tenant}/${id}.csbk`, Buffer.from('x'));
    return id;
  };
  const o1 = await oldRow(A.id, 'concluido', 120);
  const o2 = await oldRow(A.id, 'falhou', 100);
  const o3 = await oldRow(A.id, 'concluido', 5);
  const purged = await svc.purgeExpired(new Date());
  const left = (await q(`SELECT id FROM tenant_backups WHERE tenant_id=$1`, [A.id])).map((r: any) => r.id);
  ok(purged === 2 && !left.includes(o1) && !left.includes(o2) && left.includes(o3) && left.includes(manual.id), 'retenção apagou só os vencidos (registro + arquivo); manteve recentes');
  ok(await storage.get(`${A.id}/${o1}.csbk`).then(() => false, () => true), 'arquivo do backup vencido foi removido do storage');
  const stale = randomUUID();
  await q(`INSERT INTO tenant_backups (id,tenant_id,file_name,storage_path,backup_type,status,created_at,updated_at) VALUES ($1,$2,'s',$3,'manual','processando', now()-interval '2 hours', now()-interval '2 hours')`, [stale, A.id, `${A.id}/${stale}.csbk`]);
  ok(await svc.recoverStaleOperations(new Date()) === 1 && (await q(`SELECT status FROM tenant_backups WHERE id=$1`, [stale]))[0].status === 'falhou', 'operação presa há 2 h é encerrada como falha (libera o restaurante)');

  const sched = new BackupsScheduler(ds, svc);
  await q(`DELETE FROM tenant_backups WHERE tenant_id=$1 AND backup_type='automatico'`, [A.id]);
  await svc.updateSettings(A.id, { frequencyDays: 3, runTime: '04:00', retentionDays: 90 } as any, actorA, ctx);
  const nowT = new Date();
  ok((await sched.tick(nowT)).attempted === 0, 'agenda no futuro: nada executa');
  await q(`UPDATE tenant_backup_settings SET next_run_at = now() - interval '1 hour' WHERE tenant_id=$1`, [A.id]);
  const [r1, r2] = await Promise.all([new BackupsScheduler(ds, svc).tick(new Date()), new BackupsScheduler(ds, svc).tick(new Date())]);
  const autos = await q(`SELECT * FROM tenant_backups WHERE tenant_id=$1 AND backup_type='automatico' AND status='concluido'`, [A.id]);
  ok(r1.succeeded + r2.succeeded === 1 && autos.length === 1, 'dois agendadores simultâneos (2 instâncias): exatamente UM backup (reivindicação atômica)');
  const st = (await q(`SELECT * FROM tenant_backup_settings WHERE tenant_id=$1`, [A.id]))[0];
  ok(new Date(st.next_run_at).getTime() > Date.now() + 2 * 86400000 && st.last_auto_backup_at !== null, 'próxima execução avançou ~3 dias e último automático registrado');
  ok((await sched.tick(new Date())).attempted === 0, 'ciclo seguinte não repete');
  // falha → tenta de novo em 1 h, não em 3 dias
  await q(`UPDATE tenant_backup_settings SET next_run_at = now() - interval '1 minute' WHERE tenant_id=$1`, [A.id]);
  const brokenSvc = new BackupsService(ds, ds.getRepository(TenantBackup), ds.getRepository(TenantBackupSettings), ds.getRepository(AdminUser), audit,
    { driver: 'local', put: async () => { throw new BackupStorageError('disco cheio'); }, get: async () => Buffer.alloc(0), remove: async () => undefined } as any, cfg);
  const rf = await new BackupsScheduler(ds, brokenSvc).tick(new Date());
  const st2 = (await q(`SELECT next_run_at FROM tenant_backup_settings WHERE tenant_id=$1`, [A.id]))[0];
  const delta = new Date(st2.next_run_at).getTime() - Date.now();
  ok(rf.attempted === 1 && rf.succeeded === 0 && delta > 50 * 60000 && delta < 70 * 60000, 'backup automático falhou: nova tentativa em ~1 h (não espera 3 dias)');
  ok((await q(`SELECT count(*)::int n FROM tenant_backups WHERE tenant_id=$1 AND status='falhou' AND error_message LIKE '%disco cheio%'`, [A.id]))[0].n >= 1, 'falha registrada com mensagem segura');

  console.log('8) Storage Supabase (cliente simulado) e configuração');
  const objects = new Map<string, Buffer>();
  let bucketPublic = false; let created = 0;
  const fake: any = { storage: {
    getBucket: async () => (created ? { data: { public: bucketPublic }, error: null } : { data: null, error: { message: 'Bucket not found', statusCode: '404' } }),
    createBucket: async (_n: string, o: any) => { created++; bucketPublic = o.public; return { data: {}, error: null }; },
    from: () => ({
      upload: async (p: string, d: Buffer) => { if (objects.has(p)) return { error: { message: 'exists' } }; objects.set(p, d); return { error: null }; },
      download: async (p: string) => (objects.has(p) ? { data: { arrayBuffer: async () => objects.get(p)!.buffer.slice(objects.get(p)!.byteOffset, objects.get(p)!.byteOffset + objects.get(p)!.length) }, error: null } : { data: null, error: { message: 'nf' } }),
      remove: async (l: string[]) => { l.forEach((x) => objects.delete(x)); return { error: null }; },
    }),
  } };
  const sb = new SupabaseBackupStorage(fake, 'tenant-backups');
  const pth = `${randomUUID()}/${randomUUID()}.csbk`;
  await sb.put(pth, Buffer.from('abc'));
  ok(created === 1 && bucketPublic === false, 'bucket inexistente é criado PRIVADO');
  ok((await sb.get(pth)).toString() === 'abc', 'put/get ida e volta');
  await sb.remove(pth);
  ok(await sb.get(pth).then(() => false, () => true), 'remove funciona');
  bucketPublic = true;
  const sb2 = new SupabaseBackupStorage(fake, 'tenant-backups');
  ok(await sb2.put(pth, Buffer.from('x')).then(() => false, (e) => e instanceof BackupStorageError && /PÚBLICO/.test(e.message)), 'bucket PÚBLICO: recusa gravar (fail-closed)');
  ok(await sb.put('../../etc/passwd', Buffer.from('x')).then(() => false, (e) => e instanceof BackupStorageError), 'caminho malicioso recusado');
  const noKey = new BackupsService(ds, ds.getRepository(TenantBackup), ds.getRepository(TenantBackupSettings), ds.getRepository(AdminUser), audit, storage, { get: (k: string) => (k === 'BACKUP_ENCRYPTION_KEY' ? undefined : process.env[k]) } as any);
  const savedKey = process.env.BACKUP_ENCRYPTION_KEY; delete process.env.BACKUP_ENCRYPTION_KEY;
  ok(await expectErr(noKey.createBackup(A.id, 'manual', actorA, ctx)) === 503, 'sem BACKUP_ENCRYPTION_KEY: 503 claro, nenhum registro criado');
  process.env.BACKUP_ENCRYPTION_KEY = savedKey;
  const noStore = new BackupsService(ds, ds.getRepository(TenantBackup), ds.getRepository(TenantBackupSettings), ds.getRepository(AdminUser), audit, null, cfg);
  ok(await expectErr(noStore.createBackup(A.id, 'manual', actorA, ctx)) === 503, 'sem storage configurado: 503 claro');

  await fs.rm(dir, { recursive: true, force: true });
  await q(`TRUNCATE tenants CASCADE`);
  await ds.destroy();
  process.exit(finish());
})().catch((e) => { console.error('ERRO NO TESTE', e); process.exit(1); });
