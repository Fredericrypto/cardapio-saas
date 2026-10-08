// Auditoria das Anotações + notificações internas + Web Push (envio mockado): destinatários
// por perfil, isolamento dos clientes, "lido" por usuário, agrupamento de edições e isolamento
// entre restaurantes. Banco de teste obrigatório (ver helpers.ts).
import 'reflect-metadata';
import { assertTestDatabase } from './helpers';
assertTestDatabase();
process.env.VAPID_PUBLIC_KEY = 'BPubFake'; process.env.VAPID_PRIVATE_KEY = 'PrivFake';
const webpush = require('web-push');
import { AppDataSource } from '../src/config/data-source';
import { NotesService } from '../src/modules/notes/notes.service';
import { Note } from '../src/modules/notes/note.entity';
import { InternalNotificationsService } from '../src/modules/internal-notifications/internal-notifications.service';
import { InternalNotification } from '../src/modules/internal-notifications/internal-notification.entity';
import { UserPushSubscription } from '../src/modules/internal-notifications/user-push-subscription.entity';
import { AdminUser } from '../src/modules/auth/admin-user.entity';
import { Tenant } from '../src/modules/tenants/tenant.entity';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (cond: boolean, label: string) => { cond ? pass++ : fail++; console.log(cond ? '  OK ' : '  FALHOU', label); };

(async () => {
  const ds = await AppDataSource.initialize();
  const q = (s: string, p: any[] = []) => ds.query(s, p);
  await q(`TRUNCATE tenants CASCADE`);
  const [t] = await q(`INSERT INTO tenants (slug,name,logo_url) VALUES ('t1','T1','https://x/logo.png') RETURNING id`);
  const [t2] = await q(`INSERT INTO tenants (slug,name) VALUES ('t2','T2') RETURNING id`);
  const mkUser = async (email: string, name: string, role: string, tenant = t.id) =>
    (await q(`INSERT INTO admin_users (tenant_id,email,password_hash,name,role) VALUES ($1,$2,'x',$3,$4) RETURNING id`, [tenant, email, name, role]))[0].id;
  const owner = await mkUser('o@x.com', 'Marina', 'owner'), manager = await mkUser('m@x.com', 'Carlos', 'manager'),
        s1 = await mkUser('s1@x.com', 'Joana', 'staff'), s2 = await mkUser('s2@x.com', 'Pedro', 'staff');
  const U = (id: string, role: string, tenantId = t.id) => ({ userId: id, tenantId, email: 'x@x.com', role });

  const sent: Array<{ endpoint: string; payload: any; opts: any }> = [];
  webpush.sendNotification = async (sub: any, payload: string, opts: any) => { sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload), opts }); };

  const internal = new InternalNotificationsService(ds.getRepository(InternalNotification), ds.getRepository(UserPushSubscription), ds.getRepository(AdminUser), ds.getRepository(Tenant), ds);
  const notes = new NotesService(ds.getRepository(Note), internal);
  const sub = (e: string) => ({ endpoint: e, keys: { p256dh: 'p', auth: 'a' }, userAgent: 'test' });
  await internal.subscribe(t.id, U(owner, 'owner'), sub('https://push/owner'));
  await internal.subscribe(t.id, U(manager, 'manager'), sub('https://push/manager'));
  await internal.subscribe(t.id, U(s1, 'staff'), sub('https://push/staff1'));
  await internal.subscribe(t.id, U(s2, 'staff'), sub('https://push/staff2'));
  const [c] = await q(`INSERT INTO customers (tenant_id,email,password_hash,name) VALUES ($1,'c@c.com','x','Cliente') RETURNING id`, [t.id]);
  await q(`INSERT INTO push_subscriptions (tenant_id,customer_id,endpoint,p256dh,auth) VALUES ($1,$2,'https://push/CLIENTE','p','a')`, [t.id, c.id]);

  console.log('1) Criar anotação (Carlos/gerente, alvo "all")');
  const n1 = await notes.create(U(manager, 'manager'), { content: 'Trocar o gás', tag: 'Cozinha', color: '#FBCFE8' });
  await sleep(600);
  const eps = sent.map((s) => s.endpoint).sort();
  ok(JSON.stringify(eps) === JSON.stringify(['https://push/owner', 'https://push/staff1', 'https://push/staff2']), `push para dono+2 funcionários, não para o autor (${eps.join(',')})`);
  ok(!eps.includes('https://push/CLIENTE'), 'aparelho de cliente nunca recebe');
  const p = sent[0].payload;
  ok(p.title === 'Nova Anotação (#Cozinha)' && p.body === 'Carlos (Gerente) adicionou um novo recado', `título/corpo: "${p.title}" / "${p.body}"`);
  ok(p.url === `/anotacoes?nota=${n1.id}` && p.icon === 'https://x/logo.png', 'url abre a aba Anotações; ícone = logo do restaurante');
  ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(p.title + p.body), 'sem emoji no push');
  ok(sent[0].opts.vapidDetails.publicKey === 'BPubFake', 'VAPID enviada por chamada');

  console.log('2) Layout (arrastar/redimensionar/fixar/minimizar) NÃO notifica');
  sent.length = 0;
  await notes.updateLayout(t.id, { items: [{ id: n1.id, posX: 300, posY: 120, width: 320, height: 240 }] });
  await notes.update(U(manager, 'manager'), n1.id, { isPinned: true, isMinimized: true });
  await sleep(400);
  const after = await notes.list(t.id);
  ok(sent.length === 0, 'nenhum push');
  ok(after[0].posX === 300 && after[0].width === 320 && after[0].isPinned && after[0].isMinimized, 'posição/tamanho/pin/minimizar persistidos');
  ok(after[0].lastEditedByName === null, 'arrastar não vira "editada por"');

  console.log('3) Editar conteúdo notifica; edição repetida em 5 min é agrupada');
  await notes.update(U(s1, 'staff'), n1.id, { content: 'Trocar o gás URGENTE', tag: 'Urgente' });
  await sleep(600);
  ok(sent.length === 3 && sent.every((s) => s.payload.title === 'Anotação Editada (#Urgente)'), `editada -> 3 pushes (${sent.length})`);
  ok(sent.every((s) => s.opts.urgency === 'high' && s.payload.urgent === true), 'tag Urgente = prioridade alta');
  ok(!sent.map((s) => s.endpoint).includes('https://push/staff1'), 'quem editou não recebe');
  sent.length = 0;
  await notes.update(U(s1, 'staff'), n1.id, { content: 'Trocar o gás URGENTE agora' });
  await sleep(500);
  const editRows = await q(`SELECT count(*)::int c FROM internal_notifications WHERE type='note_updated'`);
  ok(sent.length === 0 && editRows[0].c === 1, `2a edição do mesmo autor agrupada (alertas: ${editRows[0].c}, pushes: ${sent.length})`);
  const edited = (await notes.list(t.id))[0];
  ok(edited.lastEditedByName === 'Joana' && edited.authorName === 'Carlos', 'autor original preservado; última edição = Joana');

  console.log('4) Alvo (preferência) e permissão');
  let denied = false; try { await internal.setPreferences(t.id, U(manager, 'manager'), 'owner'); } catch { denied = true; }
  ok(denied, 'gerente NÃO pode mudar o alvo');
  await internal.setPreferences(t.id, U(owner, 'owner'), 'owner');
  sent.length = 0;
  await notes.create(U(s2, 'staff'), { content: 'Caixa fechado', tag: 'Caixa' });
  await sleep(600);
  ok(sent.length === 1 && sent[0].endpoint === 'https://push/owner', `só o dono recebe (${sent.map((s) => s.endpoint)})`);
  await internal.setPreferences(t.id, U(owner, 'owner'), 'owner_manager');
  sent.length = 0;
  await notes.create(U(s2, 'staff'), { content: 'x', tag: 'Geral' });
  await sleep(600);
  ok(JSON.stringify(sent.map((s) => s.endpoint).sort()) === JSON.stringify(['https://push/manager', 'https://push/owner']), 'dono+gerente recebem; funcionários não');

  console.log('5) Excluir: alerta sobrevive à nota');
  sent.length = 0;
  await internal.setPreferences(t.id, U(owner, 'owner'), 'all');
  await notes.remove(U(owner, 'owner'), n1.id);
  await sleep(600);
  ok((await notes.list(t.id)).every((n) => n.id !== n1.id), 'nota removida');
  ok(sent.length === 3 && sent[0].payload.title === 'Anotação Excluída (#Urgente)', 'push de exclusão');
  const del = await q(`SELECT * FROM internal_notifications WHERE type='note_deleted'`);
  ok(del.length === 1 && del[0].note_id === n1.id, 'registro de exclusão mantém o noteId');

  console.log('6) Lista, "lido" por usuário e contador');
  const lOwner = await internal.list(t.id, U(owner, 'owner')), lStaff = await internal.list(t.id, U(s1, 'staff'));
  ok(lOwner.items.length >= 4, `dono vê ${lOwner.items.length} alertas`);
  ok(lStaff.items.every((i) => i.targetRole === 'all'), 'funcionário só vê alertas de alvo "todos"');
  const ownerUnread = lOwner.unreadCount;
  ok(lOwner.items.filter((i) => i.authorName === 'Marina').every((i) => i.isRead), 'alertas da própria pessoa já vêm lidos e não contam');
  const firstUnread = lOwner.items.find((i) => !i.isRead)!;
  await internal.markRead(t.id, U(owner, 'owner'), firstUnread.id);
  ok((await internal.unreadCount(t.id, U(owner, 'owner'))) === ownerUnread - 1, 'marcar 1 como lido reduz o contador do dono');
  ok((await internal.unreadCount(t.id, U(s1, 'staff'))) === lStaff.unreadCount, 'o "lido" do dono não afeta o funcionário');
  let blocked = false; const ownerOnly = (await q(`SELECT id FROM internal_notifications WHERE target_role='owner' LIMIT 1`))[0];
  try { await internal.markRead(t.id, U(s1, 'staff'), ownerOnly.id); } catch { blocked = true; }
  ok(blocked, 'funcionário não consegue ler alerta restrito ao dono');
  await internal.markAllRead(t.id, U(owner, 'owner'));
  ok((await internal.unreadCount(t.id, U(owner, 'owner'))) === 0, 'marcar todas como lidas zera o contador');

  console.log('7) Isolamento entre restaurantes');
  const foreign = await mkUser('f@x.com', 'Outro', 'owner', t2.id);
  ok((await internal.list(t2.id, U(foreign, 'owner', t2.id))).items.length === 0, 'outro restaurante não vê nada');
  const fn = await notes.create(U(foreign, 'owner', t2.id), { content: 'secreta' });
  const res = await notes.updateLayout(t.id, { items: [{ id: fn.id, posX: 1, posY: 1 }] });
  ok(res.updated === 0 && (await notes.list(t2.id))[0].posX !== 1, 'layout não mexe em nota de outro restaurante');
  let nf = false; try { await notes.update(U(owner, 'owner'), fn.id, { content: 'hack' }); } catch { nf = true; }
  ok(nf, 'editar nota de outro restaurante = 404');

  console.log('8) Push expirado (410)');
  webpush.sendNotification = async () => { const e: any = new Error('gone'); e.statusCode = 410; throw e; };
  await notes.create(U(s2, 'staff'), { content: 'y' }); await sleep(600);
  ok((await q(`SELECT count(*)::int c FROM user_push_subscriptions WHERE tenant_id=$1 AND user_id <> $2`, [t.id, s2]))[0].c === 0, 'inscrições mortas (410) removidas');
  ok((await q(`SELECT count(*)::int c FROM push_subscriptions`))[0].c === 1, 'inscrição de cliente intacta');

  console.log(`\nResultado: ${pass} ok, ${fail} falhas`);
  await q(`TRUNCATE tenants CASCADE`);
  await ds.destroy();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
