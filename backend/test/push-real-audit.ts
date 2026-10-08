// Auditoria do Web Push REAL: envia (sem mock) um push criptografado com VAPID para um servidor
// HTTPS local que faz o papel do serviço de push, e descriptografa com a chave do "aparelho".
// Precisa do `openssl` (gera um certificado descartável). Banco de teste obrigatório.
import 'reflect-metadata';
import { assertTestDatabase } from './helpers';
assertTestDatabase();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
// Par de chaves VAPID gerado na hora (nenhuma chave fica no repositório).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const vapid = require('web-push').generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
process.env.VAPID_PRIVATE_KEY = vapid.privateKey;
process.env.VAPID_SUBJECT = 'mailto:test@example.com';
import * as crypto from 'crypto';
import * as https from 'https';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';
import { AppDataSource } from '../src/config/data-source';
import { NotesService } from '../src/modules/notes/notes.service';
import { Note } from '../src/modules/notes/note.entity';
import { InternalNotificationsService } from '../src/modules/internal-notifications/internal-notifications.service';
import { InternalNotification } from '../src/modules/internal-notifications/internal-notification.entity';
import { UserPushSubscription } from '../src/modules/internal-notifications/user-push-subscription.entity';
import { AdminUser } from '../src/modules/auth/admin-user.entity';
import { Tenant } from '../src/modules/tenants/tenant.entity';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ece = require('http_ece');
const b64u = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'push-audit-'));
const KEY = path.join(TMP, 'key.pem');
const CERT = path.join(TMP, 'cert.pem');
execSync(`openssl req -x509 -newkey rsa:2048 -nodes -keyout ${KEY} -out ${CERT} -days 1 -subj "/CN=localhost"`, { stdio: 'ignore' });

(async () => {
  const received: Array<{ headers: any; body: Buffer }> = [];
  const server = https.createServer({ key: fs.readFileSync(KEY), cert: fs.readFileSync(CERT) }, (req, res) => {
    const chunks: Buffer[] = []; req.on('data', (c) => chunks.push(c));
    req.on('end', () => { received.push({ headers: req.headers, body: Buffer.concat(chunks) }); res.statusCode = 201; res.end(); });
  });
  await new Promise<void>((r) => server.listen(9443, r));

  const ds = await AppDataSource.initialize();
  const q = (s: string, p: any[] = []) => ds.query(s, p);
  await q(`TRUNCATE tenants CASCADE`);
  const [t] = await q(`INSERT INTO tenants (slug,name,logo_url) VALUES ('t1','T1','https://x/logo.png') RETURNING id`);
  const mk = async (email: string, name: string, role: string) => (await q(`INSERT INTO admin_users (tenant_id,email,password_hash,name,role) VALUES ($1,$2,'x',$3,$4) RETURNING id`, [t.id, email, name, role]))[0].id;
  const author = await mk('a@x.com', 'Carlos', 'manager'), receiver = await mk('r@x.com', 'Marina', 'owner');

  // "aparelho" da Marina: par de chaves P-256 + segredo de autenticação, como um navegador faria
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  const authSecret = crypto.randomBytes(16);
  const internal = new InternalNotificationsService(ds.getRepository(InternalNotification), ds.getRepository(UserPushSubscription), ds.getRepository(AdminUser), ds.getRepository(Tenant), ds);
  const notes = new NotesService(ds.getRepository(Note), internal);
  await internal.subscribe(t.id, { userId: receiver, tenantId: t.id, email: 'r@x.com', role: 'owner' }, {
    endpoint: 'https://localhost:9443/push/abc', keys: { p256dh: b64u(ecdh.getPublicKey()), auth: b64u(authSecret) }, userAgent: 'teste',
  });

  await notes.create({ userId: author, tenantId: t.id, email: 'a@x.com', role: 'manager' }, { content: 'Fechar o gás', tag: 'Urgente' });
  await new Promise((r) => setTimeout(r, 1500));

  let pass = 0, fail = 0; const ok = (c: boolean, l: string) => { c ? pass++ : fail++; console.log(c ? '  OK ' : '  FALHOU', l); };
  ok(received.length === 1, `push realmente enviado ao endpoint do aparelho (${received.length} requisição)`);
  const r = received[0];
  ok(new RegExp(`^vapid t=.+, k=${vapid.publicKey.slice(0, 8)}`).test(String(r.headers.authorization)), 'cabeçalho Authorization VAPID (JWT + chave pública)');
  ok(r.headers['content-encoding'] === 'aes128gcm', 'payload criptografado (aes128gcm)');
  ok(r.headers.urgency === 'high' && Number(r.headers.ttl) === 86400, `Urgency=${r.headers.urgency}, TTL=${r.headers.ttl}`);
  const plain = JSON.parse(ece.decrypt(r.body, { version: 'aes128gcm', privateKey: ecdh, authSecret }).toString());
  console.log('     payload:', JSON.stringify(plain));
  ok(plain.title === 'Nova Anotação (#Urgente)' && plain.body === 'Carlos (Gerente) adicionou um novo recado', 'título e corpo corretos, sem emoji');
  ok(plain.url.startsWith('/anotacoes?nota=') && plain.icon === 'https://x/logo.png' && plain.urgent === true, 'url abre a aba Anotações, ícone do restaurante, urgente');
  console.log(`\nResultado: ${pass} ok, ${fail} falhas`);
  await q(`TRUNCATE tenants CASCADE`); await ds.destroy(); server.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(String(e).slice(0, 600)); process.exit(1); });
