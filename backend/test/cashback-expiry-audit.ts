// Auditoria do cashback: validade, edição da configuração sem alterar saldo e avisos
// de vencimento (1 semana / 2 dias). Banco de teste obrigatório (ver helpers.ts).
import 'reflect-metadata';
import { assertTestDatabase, createChecker } from './helpers';
assertTestDatabase();
import { AppDataSource } from '../src/config/data-source';
import { CashbackService } from '../src/modules/cashback/cashback.service';
import { CashbackSettings } from '../src/modules/cashback/cashback-settings.entity';
import { CashbackLedgerEntry } from '../src/modules/cashback/cashback-ledger-entry.entity';
import { CashbackConsumption } from '../src/modules/cashback/cashback-consumption.entity';
import { Location } from '../src/modules/locations/location.entity';
import { Tenant } from '../src/modules/tenants/tenant.entity';

const { ok, finish } = createChecker();

(async () => {
  const ds = await AppDataSource.initialize();
  const q = (s: string, p: any[] = []) => ds.query(s, p);
  await q(`TRUNCATE tenants CASCADE`);
  const [t] = await q(`INSERT INTO tenants (slug,name) VALUES ('t1','T1') RETURNING id`);
  const [c] = await q(`INSERT INTO customers (tenant_id,email,password_hash,name) VALUES ($1,'a@a.com','x','Ana') RETURNING id`, [t.id]);
  const pushed: any[] = [];
  const svc = new CashbackService(
    ds.getRepository(CashbackSettings), ds.getRepository(CashbackLedgerEntry), ds.getRepository(CashbackConsumption),
    ds.getRepository(Location), ds.getRepository(Tenant), { sendToCustomer: async (...a: any[]) => { pushed.push(a); } } as any,
  );

  console.log('1) Configuração padrão');
  const list = await svc.findAllSettings(t.id);
  ok(list.length === 1 && list[0].isActive === false, 'restaurante sem configuração ganha 1 padrão, pausada');
  const sid = list[0].id;
  ok((await svc.findAllSettings(t.id)).length === 1, 'listar de novo não cria outra');

  console.log('2) Carteira: saldo e tempo restante');
  const mk = (daysToExpire: number, createdDaysAgo: number, rem = 10) =>
    q(`INSERT INTO cashback_ledger_entries (tenant_id,customer_id,source_type,original_amount,remaining_amount,expires_at,settings_id,created_at)
       VALUES ($1,$2,'order',$3,$3, now() + ($4 || ' days')::interval, $5, now() - ($6 || ' days')::interval)`,
      [t.id, c.id, rem, String(daysToExpire), sid, String(createdDaysAgo)]);
  await mk(6, 24); await mk(1, 29); await mk(-1, 31); // vence em 6 dias, em 1 dia, e já venceu
  const w = await svc.getWallet(t.id, c.id);
  ok(w.balance === 20, `saldo = 20 (o vencido não conta): ${w.balance}`);
  ok(w.expiringAmount === 10 && w.nextExpiresAt != null && +new Date(w.nextExpiresAt) - Date.now() < 26 * 3600 * 1000, 'próximo vencimento = o crédito de 1 dia (R$ 10)');
  ok(w.credits.length === 2, 'só os 2 créditos válidos entram na carteira');

  console.log('3) Avisos de vencimento (cron)');
  await svc.notifyExpiringCredits();
  const titles = pushed.map((p) => p[2].title).sort();
  ok(pushed.length === 2 && titles.some((x: string) => /2 dias/.test(x)) && titles.some((x: string) => /1 semana/.test(x)), `1ª rodada: ${titles.join(' | ')}`);
  ok(pushed.every((p) => String(p[2].url).endsWith('/conta-cliente/cashback')), 'toque na notificação leva à área de cashback');
  await svc.notifyExpiringCredits();
  ok(pushed.length === 2, 'segunda rodada NÃO repete os avisos (um por crédito)');

  console.log('4) Admin estende a validade: saldo intocado, vencido continua vencido');
  const before = await svc.getBalance(t.id, c.id);
  await svc.updateSettings(t.id, sid, { expirationDays: 60 } as any);
  const after = await svc.getBalance(t.id, c.id);
  ok(before === 20 && after === 20, `saldo antes/depois = ${before}/${after}`);
  const rows = await q(`SELECT remaining_amount::float AS rem, (expires_at > now() + interval '27 days') AS far, (notified_week_at IS NULL AND notified_two_days_at IS NULL) AS reset
                          FROM cashback_ledger_entries ORDER BY created_at`);
  ok(rows.length === 3 && rows.filter((r: any) => r.far).length === 2, 'os 2 créditos abertos ganharam o novo prazo; o já vencido não foi ressuscitado');
  ok(rows.filter((r: any) => r.far).every((r: any) => r.reset), 'avisos de vencimento voltam a poder sair após estender');
  await svc.updateSettings(t.id, sid, { expirationDays: null } as any);
  ok((await q(`SELECT count(*)::int c FROM cashback_ledger_entries WHERE expires_at IS NOT NULL`))[0].c === 1, '"nunca expira" limpa a validade dos abertos (o vencido segue vencido)');
  ok((await svc.getBalance(t.id, c.id)) === 20, 'saldo continua 20');

  console.log('5) Só editar: nada de nova configuração nem exclusão');
  let delBlocked = false; try { await svc.deleteSettings(t.id, sid); } catch { delBlocked = true; }
  let createBlocked = false; try { await svc.createSettings(t.id, { percentage: 3 } as any); } catch { createBlocked = true; }
  ok(delBlocked && createBlocked, 'excluir e criar nova configuração são recusados');

  const code = finish();
  await q(`TRUNCATE tenants CASCADE`); await ds.destroy(); process.exit(code);
})().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
