// Auditoria do ciclo de vida das notificações internas: anti-duplicidade (inclusive
// com requisições concorrentes), expiração de 7 dias, exclusão manual individual
// e identidade do autor (avatar, selo, cargo). Banco de teste obrigatório.
import 'reflect-metadata';
import { assertTestDatabase, createChecker } from './helpers';
assertTestDatabase();
process.env.VAPID_PUBLIC_KEY = 'BPubFake';
process.env.VAPID_PRIVATE_KEY = 'PrivFake';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const webpush = require('web-push');
import { AppDataSource } from '../src/config/data-source';
import { NotesService } from '../src/modules/notes/notes.service';
import { Note } from '../src/modules/notes/note.entity';
import {
  InternalNotificationsService,
  RETENTION_DAYS,
  authorRoleLabel,
  isAuthorVerified,
} from '../src/modules/internal-notifications/internal-notifications.service';
import { InternalNotification } from '../src/modules/internal-notifications/internal-notification.entity';
import { UserPushSubscription } from '../src/modules/internal-notifications/user-push-subscription.entity';
import { AdminUser } from '../src/modules/auth/admin-user.entity';
import { Tenant } from '../src/modules/tenants/tenant.entity';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const { ok, finish } = createChecker();

(async () => {
  const ds = await AppDataSource.initialize();
  const q = (s: string, p: unknown[] = []) => ds.query(s, p);
  await q(`TRUNCATE tenants CASCADE`);
  const [t] = await q(`INSERT INTO tenants (slug,name,logo_url) VALUES ('t1','T1','https://x/logo.png') RETURNING id`);
  const mkUser = async (email: string, name: string, role: string, avatar: string | null = null) =>
    (
      await q(
        `INSERT INTO admin_users (tenant_id,email,password_hash,name,role,avatar_url) VALUES ($1,$2,'x',$3,$4,$5) RETURNING id`,
        [t.id, email, name, role, avatar],
      )
    )[0].id as string;
  const owner = await mkUser('o@x.com', 'Marina', 'owner');
  const manager = await mkUser('m@x.com', 'Carlos', 'manager', 'https://x/carlos.png');
  const staff = await mkUser('s@x.com', 'Joana', 'staff');
  const U = (id: string, role: string) => ({ userId: id, tenantId: t.id, email: 'x@x.com', role });

  const sent: Array<{ endpoint: string }> = [];
  webpush.sendNotification = async (sub: { endpoint: string }) => {
    sent.push({ endpoint: sub.endpoint });
  };
  const internal = new InternalNotificationsService(
    ds.getRepository(InternalNotification),
    ds.getRepository(UserPushSubscription),
    ds.getRepository(AdminUser),
    ds.getRepository(Tenant),
    ds,
  );
  const notes = new NotesService(ds.getRepository(Note), internal);
  const sub = (e: string) => ({ endpoint: e, keys: { p256dh: 'p', auth: 'a' }, userAgent: 'test' });
  await internal.subscribe(t.id, U(owner, 'owner'), sub('https://push/owner'));
  // inscrição REPETIDA do mesmo aparelho em outro registro não pode gerar push dobrado
  await internal.subscribe(t.id, U(owner, 'owner'), sub('https://push/owner'));

  console.log('1) Constantes e funções puras');
  ok(RETENTION_DAYS === 7, 'retenção = 7 dias');
  ok(authorRoleLabel({ hasAuthor: false, legacyRole: 'owner', roleName: null, roleSlug: null }) === 'Sistema', 'sem autor = Sistema');
  ok(authorRoleLabel({ hasAuthor: true, legacyRole: 'owner', roleName: 'Administrador', roleSlug: 'admin' }) === 'CEO', 'admin = CEO');
  ok(authorRoleLabel({ hasAuthor: true, legacyRole: 'manager', roleName: 'Gerente', roleSlug: 'manager' }) === 'Gerente', 'gerente = Gerente');
  ok(authorRoleLabel({ hasAuthor: true, legacyRole: 'staff', roleName: 'Barista', roleSlug: 'barista' }) === 'Barista', 'cargo personalizado usa o nome do cargo');
  ok(authorRoleLabel({ hasAuthor: true, legacyRole: 'staff', roleName: null, roleSlug: null }) === 'Funcionário', 'cargo removido cai no perfil legado');
  ok(isAuthorVerified({ hasAuthor: true, legacyRole: 'owner', roleSlug: 'admin' }) && !isAuthorVerified({ hasAuthor: true, legacyRole: 'staff', roleSlug: null }), 'selo só para o CEO');

  console.log('2) Criar a mesma anotação em requisições concorrentes não duplica');
  const n1 = await notes.create(U(manager, 'manager'), { content: 'Trocar o gás', tag: 'Cozinha' });
  const ev = { tenantId: t.id, type: 'note_created' as const, noteId: n1.id, tag: 'Cozinha', actor: await internal.resolveActor(U(manager, 'manager')) };
  await Promise.all([internal.notifyNoteEvent(ev), internal.notifyNoteEvent(ev), internal.notifyNoteEvent(ev)]);
  await sleep(600);
  const created = await q(`SELECT count(*)::int c FROM internal_notifications WHERE note_id=$1 AND type='note_created'`, [n1.id]);
  ok(created[0].c === 1, `1 alerta de criação (${created[0].c})`);
  ok(sent.length === 1, `1 push só (${sent.length})`);

  console.log('3) Edições simultâneas da mesma pessoa viram 1 alerta');
  await Promise.all([
    notes.update(U(staff, 'staff'), n1.id, { content: 'v2' }),
    notes.update(U(staff, 'staff'), n1.id, { content: 'v3' }),
    notes.update(U(staff, 'staff'), n1.id, { content: 'v4' }),
  ]);
  await sleep(600);
  const edits = await q(`SELECT count(*)::int c FROM internal_notifications WHERE note_id=$1 AND type='note_updated'`, [n1.id]);
  ok(edits[0].c === 1, `1 alerta de edição (${edits[0].c})`);

  console.log('4) Excluir repetido não duplica');
  const evDel = { ...ev, type: 'note_deleted' as const };
  await Promise.all([internal.notifyNoteEvent(evDel), internal.notifyNoteEvent(evDel)]);
  const dels = await q(`SELECT count(*)::int c FROM internal_notifications WHERE note_id=$1 AND type='note_deleted'`, [n1.id]);
  ok(dels[0].c === 1, `1 alerta de exclusão (${dels[0].c})`);

  console.log('5) Identidade do autor na lista');
  const list = await internal.list(t.id, U(owner, 'owner'));
  const byManager = list.items.find((i) => i.type === 'note_created')!;
  ok(byManager.authorName === 'Carlos' && byManager.authorRoleLabel === 'Gerente', `autor/cargo: ${byManager.authorName} / ${byManager.authorRoleLabel}`);
  ok(byManager.authorAvatarUrl === 'https://x/carlos.png' && !byManager.authorVerified && !byManager.isSystem, 'avatar do usuário; gerente sem selo');
  const own = await notes.create(U(owner, 'owner'), { content: 'Aviso do CEO', tag: 'Geral' });
  await sleep(400);
  const l2 = await internal.list(t.id, U(manager, 'manager'));
  const byOwner = l2.items.find((i) => i.noteId === own.id)!;
  ok(byOwner.authorRoleLabel === 'CEO' && byOwner.authorVerified && byOwner.authorAvatarUrl === 'https://x/logo.png', 'CEO: selo + logo do restaurante como avatar');

  console.log('6) Exclusão manual individual');
  const target = l2.items[0];
  await internal.deleteForUser(t.id, U(manager, 'manager'), target.id);
  await internal.deleteForUser(t.id, U(manager, 'manager'), target.id); // idempotente
  ok((await internal.list(t.id, U(manager, 'manager'))).items.every((i) => i.id !== target.id), 'some para quem excluiu');
  ok((await internal.list(t.id, U(owner, 'owner'))).items.some((i) => i.id === target.id), 'continua para os outros');
  await internal.markAllRead(t.id, U(manager, 'manager'));
  ok((await internal.list(t.id, U(manager, 'manager'))).items.every((i) => i.id !== target.id), '"marcar todas" não ressuscita a excluída');
  let nf = false;
  try { await internal.deleteForUser(t.id, U(manager, 'manager'), '00000000-0000-4000-8000-000000000000'); } catch { nf = true; }
  ok(nf, 'excluir id inexistente = 404');

  console.log('7) Expiração de 7 dias');
  const [old] = await q(
    `INSERT INTO internal_notifications (tenant_id,type,title,message,author_name,author_role,target_role,created_at)
     VALUES ($1,'note_updated','Antiga','x','Sistema','owner','all', now() - interval '8 days') RETURNING id`, [t.id]);
  const [fresh] = await q(
    `INSERT INTO internal_notifications (tenant_id,type,title,message,author_name,author_role,target_role,created_at)
     VALUES ($1,'note_updated','Recente','x','Sistema','owner','all', now() - interval '6 days') RETURNING id`, [t.id]);
  const visible = (await internal.list(t.id, U(owner, 'owner'))).items.map((i) => i.id);
  ok(!visible.includes(old.id) && visible.includes(fresh.id), 'lista esconde > 7 dias e mantém 6 dias');
  const sys = (await internal.list(t.id, U(owner, 'owner'))).items.find((i) => i.id === fresh.id)!;
  ok(sys.isSystem && sys.authorRoleLabel === 'Sistema' && sys.authorName === 'Sistema', 'sem autor = Sistema');
  await internal.purgeOld();
  ok((await q(`SELECT count(*)::int c FROM internal_notifications WHERE id=$1`, [old.id]))[0].c === 0, 'limpeza apaga > 7 dias do banco');
  ok((await q(`SELECT count(*)::int c FROM internal_notifications WHERE id=$1`, [fresh.id]))[0].c === 1, 'limpeza preserva o recente');

  await q(`TRUNCATE tenants CASCADE`);
  await ds.destroy();
  process.exit(finish());
})().catch((e) => {
  console.error(String(e).slice(0, 800));
  process.exit(1);
});
