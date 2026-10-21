// Auditoria de PROMOCOES sob concorrencia (Fase C, Patch 1: P-02 + P-03).
//
// Rodar:   DATABASE_URL=postgres://.../cardapio_test npm run test:promotions
// ATENCAO: APAGA todos os restaurantes do banco (TRUNCATE tenants CASCADE).
//          Recusa rodar em banco cujo nome nao contenha "test" (assertTestDatabase).
//          O banco de teste precisa ter TODAS as migrations aplicadas.
//
// Usa o OrdersService / PromotionsService / CashbackService REAIS (codigo de
// producao) contra Postgres real. Fora do banco, so o que e rede e stub:
// Mercado Pago (Proxy que registra as chamadas), push, entrega, mesas, SIOD.
//
// COMO A CONCORRENCIA E SIMULADA (sem depender de sorte)
//  - Chamadas paralelas de verdade: Promise.allSettled([...]) sobre o pool do pg,
//    cada create() abre a PROPRIA transacao em outra conexao.
//  - Janela de corrida alargada de forma deterministica: um spy em
//    PromotionsService.recordRedemption espera N ms ANTES de gravar. Isso fica
//    entre "validou o limite" e "commit", exatamente onde a corrida mora. Sem
//    trava, todos os pedidos leem a mesma contagem; com trava, o concorrente
//    e recusado/serializado ANTES de chegar la.
//  - Deadlock (P-17): o spy atrasa a SEGUNDA promocao de cada pedido, entao
//    [A,B] e [B,A] seguram uma linha cada um e pedem a do outro.
//
// SEMANTICA DOS RESULTADOS
//  OK        o comportamento correto foi observado.
//  FALHOU    bug reproduzido (esperado ANTES do Patch 1, nao pode existir DEPOIS).
//  ABERTO    bug CONHECIDO, fora do Patch 1 (P-15, P-18). Nao derruba o test:all.
//            Com STRICT_KNOWN_OPEN=1 vira FALHOU. Se passar a dar OK, o script
//            avisa "CORRIGIDO" para tirar da lista de abertos.
//  ERRO      problema do proprio teste/ambiente (seed, schema). Exit code 3.
//
// NAO COBERTO (documentado, ver tambem PLANO no fim do arquivo):
//  P-18 so e caracterizado (ABERTO), nao corrigido. P-16 (sem Idempotency-Key)
//  nao tem API para testar o comportamento desejado: so ha caracterizacao.
//  Nao cobre: camada HTTP/guards/assinatura do webhook, Mercado Pago real,
//  pooler do Supabase, pedido de mesa e entrega ponta a ponta, admin poll
//  (findAll) como chamador de cancelamento, volume/latencia de producao.

import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { AppDataSource } from '../src/config/data-source';
import { assertTestDatabase, createChecker } from './helpers';
import { OrdersService } from '../src/modules/orders/orders.service';
import { PromotionsService } from '../src/modules/promotions/promotions.service';
import { CashbackService } from '../src/modules/cashback/cashback.service';
import { Order } from '../src/modules/orders/order.entity';
import { Tenant } from '../src/modules/tenants/tenant.entity';
import { Customer } from '../src/modules/customers/customer.entity';
import { Category } from '../src/modules/categories/category.entity';
import { Product } from '../src/modules/products/product.entity';
import { Location } from '../src/modules/locations/location.entity';
import { Promotion } from '../src/modules/promotions/promotion.entity';
import { PromotionCustomerReset } from '../src/modules/promotions/promotion-customer-reset.entity';
import { OrderPromotionDiscount } from '../src/modules/promotions/order-promotion-discount.entity';
import { CashbackSettings } from '../src/modules/cashback/cashback-settings.entity';
import { CashbackLedgerEntry } from '../src/modules/cashback/cashback-ledger-entry.entity';
import { CashbackConsumption } from '../src/modules/cashback/cashback-consumption.entity';

assertTestDatabase();

const STRICT_KNOWN_OPEN = process.env.STRICT_KNOWN_OPEN === '1';
const PARALLEL = 8; // abaixo do pool padrao do pg (10): sobra conexao para leituras fora da transacao

// ------------------------------------------------------------------ infra

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const checker = createChecker();
const rand = () => Math.random().toString(36).slice(2, 8);

class SetupError extends Error {}

type Status = 'OK' | 'FALHOU' | 'ABERTO' | 'CORRIGIDO' | 'ERRO';
const table: { id: string; title: string; status: Status }[] = [];
let execErrors = 0;

interface Scenario {
  ok(cond: boolean, label: string, evidence?: string): void;
  knownOpen(cond: boolean, label: string, evidence?: string): void;
  note(text: string): void;
}

async function scenario(id: string, title: string, fn: (t: Scenario) => Promise<void>): Promise<void> {
  console.log(`\n[${id}] ${title}`);
  let failed = false;
  let open = false;
  let fixed = false;
  const t: Scenario = {
    ok(cond, label, evidence) {
      checker.ok(cond, label);
      if (!cond) failed = true;
      if (evidence) console.log(`      evidencia: ${evidence}`);
    },
    knownOpen(cond, label, evidence) {
      if (cond) {
        console.log(`  CORRIGIDO (era bug aberto) ${label}  -> tire este cenario da lista de abertos`);
        fixed = true;
      } else if (STRICT_KNOWN_OPEN) {
        checker.ok(false, `${label} [bug aberto, modo estrito]`);
        failed = true;
      } else {
        console.log(`  ABERTO ${label}`);
        open = true;
      }
      if (evidence) console.log(`      evidencia: ${evidence}`);
    },
    note(text) {
      console.log(`      nota: ${text}`);
    },
  };
  try {
    await fn(t);
    table.push({ id, title, status: failed ? 'FALHOU' : open ? 'ABERTO' : fixed ? 'CORRIGIDO' : 'OK' });
  } catch (err) {
    execErrors++;
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ERRO DE EXECUCAO (teste/ambiente, nao e resultado de bug): ${msg}`);
    table.push({ id, title, status: 'ERRO' });
  } finally {
    restoreAll();
  }
}

// -------- spies reversiveis (instancia, nao prototipo)
const restores: (() => void)[] = [];
function wrap(obj: any, name: string, make: (orig: (...a: any[]) => any) => (...a: any[]) => any): void {
  const saved = obj[name];
  obj[name] = make(saved.bind(obj));
  restores.push(() => {
    obj[name] = saved;
  });
}
function restoreAll(): void {
  while (restores.length) restores.pop()!();
}

// -------- classificacao de resultado de chamadas paralelas
function classify(r: PromiseSettledResult<unknown>): string {
  if (r.status === 'fulfilled') return 'ok';
  const e: any = r.reason;
  const st = e?.getStatus?.();
  if (typeof st === 'number' && st >= 400 && st < 500) return `http${st}`;
  const code = e?.code ?? e?.driverError?.code;
  if (code === '40P01') return 'DEADLOCK(40P01)';
  return `erro:${String(e?.message ?? e).slice(0, 70)}`;
}
function tally(results: PromiseSettledResult<unknown>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of results) {
    const k = classify(r);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
const fmt = (o: unknown) => JSON.stringify(o);
const only4xxOrOk = (tl: Record<string, number>) => Object.keys(tl).every((k) => k === 'ok' || /^http4\d\d$/.test(k));

// -------- seed generico: descobre colunas NOT NULL sem default pelo information_schema
const colCache = new Map<string, any[]>();
async function cols(tableName: string): Promise<any[]> {
  if (!colCache.has(tableName)) {
    colCache.set(
      tableName,
      await AppDataSource.query(
        `SELECT column_name, data_type, udt_name, is_nullable, column_default, character_maximum_length
           FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
        [tableName],
      ),
    );
  }
  return colCache.get(tableName)!;
}
async function autofill(c: any): Promise<unknown> {
  switch (c.data_type) {
    case 'character varying':
    case 'character':
    case 'text': {
      const s = `t${rand()}${rand()}`;
      return c.character_maximum_length ? s.slice(0, c.character_maximum_length) : s;
    }
    case 'uuid':
      return randomUUID();
    case 'boolean':
      return false;
    case 'integer':
    case 'bigint':
    case 'smallint':
    case 'numeric':
    case 'double precision':
    case 'real':
      return 0;
    case 'json':
    case 'jsonb':
      return '{}';
    case 'ARRAY':
      return '{}';
    case 'USER-DEFINED': {
      const rows = await AppDataSource.query(
        `SELECT e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = $1 ORDER BY e.enumsortorder LIMIT 1`,
        [c.udt_name],
      );
      if (rows[0]) return rows[0].enumlabel;
      throw new SetupError(`coluna ${c.column_name}: enum ${c.udt_name} sem valores`);
    }
    default:
      if (c.data_type.startsWith('timestamp') || c.data_type === 'date') return new Date();
      throw new SetupError(`seed: nao sei preencher ${c.column_name} (${c.data_type})`);
  }
}
async function insertRow(tableName: string, values: Record<string, unknown>): Promise<string> {
  const cs = await cols(tableName);
  if (cs.length === 0) throw new SetupError(`tabela "${tableName}" nao existe (migrations aplicadas?)`);
  const names = new Set(cs.map((c) => c.column_name));
  for (const k of Object.keys(values)) {
    if (!names.has(k)) console.log(`      [seed] aviso: coluna ${tableName}.${k} nao existe; ignorada`);
  }
  const row: Record<string, unknown> = {};
  for (const c of cs) {
    if (c.column_name in values) row[c.column_name] = values[c.column_name];
    else if (c.is_nullable === 'NO' && c.column_default === null) row[c.column_name] = await autofill(c);
  }
  const keys = Object.keys(row);
  const sql = `INSERT INTO "${tableName}" (${keys.map((k) => `"${k}"`).join(',')}) VALUES (${keys
    .map((_, i) => `$${i + 1}`)
    .join(',')}) RETURNING id`;
  const params = keys.map((k) => {
    const v = row[k];
    return v !== null && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v) ? JSON.stringify(v) : v;
  });
  try {
    const res = await AppDataSource.query(sql, params);
    return res[0].id;
  } catch (e: any) {
    throw new SetupError(`seed de ${tableName} falhou: ${e.message}`);
  }
}

// ------------------------------------------------------------ servicos reais

const noop: any = new Proxy({}, { get: () => async () => undefined });
const mpCalls: Record<string, any[][]> = {};
const mpStub: any = new Proxy(
  {},
  {
    get: (_t, name: string) => async (...args: any[]) => {
      (mpCalls[name] ??= []).push(args);
      if (name === 'createPixPayment') return { id: `mp-${(mpCalls[name] ?? []).length}`, qrCode: '000201MP-STUB' };
      if (name === 'getPaymentStatus') return { status: 'pending', statusDetail: null };
      return {};
    },
  },
);
const mpCount = (name: string) => (mpCalls[name] ?? []).length;
const mpReset = () => Object.keys(mpCalls).forEach((k) => delete mpCalls[k]);

let promotions: PromotionsService;
let cashback: CashbackService;
let orders: OrdersService;

function buildServices(): void {
  const ds = AppDataSource;
  promotions = new PromotionsService(
    ds.getRepository(Promotion),
    ds.getRepository(Category),
    ds.getRepository(Product),
    ds.getRepository(Location),
    ds.getRepository(Order),
    ds.getRepository(PromotionCustomerReset),
    ds.getRepository(OrderPromotionDiscount),
    noop,
  );
  cashback = new CashbackService(
    ds.getRepository(CashbackSettings),
    ds.getRepository(CashbackLedgerEntry),
    ds.getRepository(CashbackConsumption),
    ds.getRepository(Location),
    ds.getRepository(Tenant),
    noop,
  );
  orders = new OrdersService(
    ds.getRepository(Order),
    ds.getRepository(Tenant),
    ds.getRepository(Customer),
    ds,
    noop, // deliveryService (nao usado em balcao)
    mpStub,
    promotions,
    cashback,
    noop, // pushService
    noop, // verificationService
    noop, // tablesService
    noop, // siodEngine
  );
}

// ------------------------------------------------------------------- mundo

interface World {
  tenantId: string;
  locationId: string;
  burger: string; // R$ 40
  coke: string; // R$ 10
  categoryId: string;
}
async function seedWorld(tag: string): Promise<World> {
  const tenantId = await insertRow('tenants', { slug: `pa-${tag}-${rand()}`, name: `Teste ${tag}` });
  const locationId = await insertRow('locations', { tenant_id: tenantId, name: 'Loja Teste', is_open: true });
  const categoryId = await insertRow('categories', { tenant_id: tenantId, name: 'Lanches' });
  const burger = await insertRow('products', {
    tenant_id: tenantId, category_id: categoryId, name: 'Burger', price: 40, is_available: true,
  });
  const coke = await insertRow('products', {
    tenant_id: tenantId, category_id: categoryId, name: 'Coca', price: 10, is_available: true,
  });
  return { tenantId, locationId, categoryId, burger, coke };
}
async function mkCustomer(w: World, i: number): Promise<string> {
  return insertRow('customers', { tenant_id: w.tenantId, name: `Cliente ${i}` });
}
// Promocao de R$ valor fixo sobre um produto (ou o cardapio todo se productId = null).
async function mkPromo(
  w: World,
  o: { title: string; value?: number; productId?: string | null; limitPerCustomer?: number | null; maxRedemptions?: number | null },
): Promise<string> {
  const id = await insertRow('promotions', {
    tenant_id: w.tenantId,
    title: o.title,
    discount_type: 'fixed',
    discount_value: o.value ?? 5,
    min_order_value: 0,
    scope: o.productId ? 'product' : 'all',
    usage_limit_per_customer: o.limitPerCustomer ?? null,
    max_redemptions: o.maxRedemptions ?? null,
    redemption_count: 0,
    is_active: true,
    allow_reuse_across_locations: false,
  });
  if (o.productId) await AppDataSource.query(`INSERT INTO promotion_products (promotion_id, product_id) VALUES ($1, $2)`, [id, o.productId]);
  return id;
}
function dto(w: World, items: { productId: string; quantity?: number }[], promotionIds: string[] = [], extra: any = {}): any {
  return {
    orderType: 'balcao',
    locationId: w.locationId,
    paymentMethod: 'dinheiro',
    items: items.map((i) => ({ productId: i.productId, quantity: i.quantity ?? 1 })),
    promotionIds,
    ...extra,
  };
}
const place = (w: World, customerId: string | null, d: any) => orders.create(w.tenantId, d, customerId);

async function q<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  return AppDataSource.query(sql, params);
}
async function redemptionCount(promoId: string): Promise<number> {
  return Number((await q(`SELECT redemption_count FROM promotions WHERE id = $1`, [promoId]))[0].redemption_count);
}
async function ordersWithPromo(promoId: string, includeCancelled = false): Promise<number> {
  const r = await q(
    `SELECT count(*)::int AS n FROM orders WHERE $1 = ANY(promotion_ids) ${includeCancelled ? '' : `AND status <> 'cancelado'`}`,
    [promoId],
  );
  return r[0].n;
}
async function discountRows(promoId: string): Promise<number> {
  return (await q(`SELECT count(*)::int AS n FROM order_promotion_discounts WHERE promotion_id = $1`, [promoId]))[0].n;
}
async function advisoryLocksHeld(): Promise<number> {
  return (await q(`SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND granted`))[0].n;
}

// Invariantes de consistencia valem em qualquer cenario sem adulteracao manual.
async function invariants(t: Scenario, w: World, label: string): Promise<void> {
  const bad = await q(
    `SELECT o.id, o.discount_amount, COALESCE(s.sum_d, 0) AS sum_d
       FROM orders o LEFT JOIN (SELECT order_id, SUM(discount_amount) AS sum_d FROM order_promotion_discounts GROUP BY order_id) s ON s.order_id = o.id
      WHERE o.tenant_id = $1 AND o.status <> 'cancelado' AND o.promotion_ids IS NOT NULL
        AND ABS(o.discount_amount - COALESCE(s.sum_d, 0)) > 0.004`,
    [w.tenantId],
  );
  t.ok(bad.length === 0, `${label}: soma de order_promotion_discounts = discount_amount em todo pedido nao cancelado`, `divergentes=${bad.length}`);
  const badTotal = await q(
    `SELECT o.id FROM orders o JOIN (SELECT order_id, SUM(subtotal) AS items FROM order_items GROUP BY order_id) i ON i.order_id = o.id
      WHERE o.tenant_id = $1 AND ABS(o.total - (i.items - o.discount_amount + o.delivery_fee - o.cashback_used)) > 0.004`,
    [w.tenantId],
  );
  t.ok(badTotal.length === 0, `${label}: total = itens - desconto + taxa - cashback`, `divergentes=${badTotal.length}`);
}

// ------------------------------------------------------------------ main

async function preflight(): Promise<void> {
  const w = await seedWorld('preflight');
  try {
    await place(w, null, dto(w, [{ productId: w.burger }], [], { customerName: 'Visitante' }));
  } catch (e: any) {
    throw new SetupError(`pedido-base de balcao falhou (seed/loja/horario): ${e?.message ?? e}`);
  }
}

async function main(): Promise<number> {
  await AppDataSource.initialize();
  await AppDataSource.query('TRUNCATE tenants CASCADE');
  buildServices();
  // O Mercado Pago e stub: o decrypt do token vira identidade (nao ha chave real).
  try {
    const enc = require('../src/common/utils/encryption');
    enc.decryptSecret = (v: string) => v;
  } catch {
    /* sem o modulo: cenarios de MP reportam ERRO e o resto roda */
  }

  try {
    await preflight();
  } catch (e: any) {
    console.error(`\nERRO DE AMBIENTE (nada foi testado): ${e.message}`);
    await AppDataSource.destroy();
    return 3;
  }

  // ===================================================== P-02: limite por cliente
  await scenario('P-02a', `limite 1 por cliente: ${PARALLEL} pedidos paralelos do MESMO cliente`, async (t) => {
    const w = await seedWorld('p02a');
    const c = await mkCustomer(w, 1);
    const promo = await mkPromo(w, { title: 'Primeira compra', limitPerCustomer: 1 });
    wrap(promotions, 'recordRedemption', (orig) => async (...a) => { await sleep(150); return orig(...a); });
    const res = await Promise.allSettled(
      Array.from({ length: PARALLEL }, () => place(w, c, dto(w, [{ productId: w.burger }], [promo]))),
    );
    const tl = tally(res);
    const n = await ordersWithPromo(promo);
    const rows = await discountRows(promo);
    const cnt = await redemptionCount(promo);
    const ev = `resultados=${fmt(tl)} pedidos_com_a_promo=${n} linhas_opd=${rows} redemption_count=${cnt}`;
    t.ok(n === 1, 'exatamente 1 pedido usou a promocao de limite 1', ev);
    t.ok(rows === 1, 'exatamente 1 linha em order_promotion_discounts');
    t.ok(cnt === 1, 'redemption_count = 1');
    t.ok(only4xxOrOk(tl), 'os recusados sao 4xx (nunca 5xx/deadlock)');
    await invariants(t, w, 'P-02a');
  });

  await scenario('P-02b', `teto global 1: ${PARALLEL} clientes DIFERENTES disputam a ultima vaga`, async (t) => {
    const w = await seedWorld('p02b');
    const promo = await mkPromo(w, { title: 'Ultima vaga', maxRedemptions: 1 });
    const cs = await Promise.all(Array.from({ length: PARALLEL }, (_, i) => mkCustomer(w, i)));
    wrap(promotions, 'recordRedemption', (orig) => async (...a) => { await sleep(150); return orig(...a); });
    const res = await Promise.allSettled(cs.map((c) => place(w, c, dto(w, [{ productId: w.burger }], [promo]))));
    const tl = tally(res);
    const n = await ordersWithPromo(promo);
    const cnt = await redemptionCount(promo);
    t.ok(n === 1, 'so 1 pedido ocupa a vaga do teto global', `resultados=${fmt(tl)} pedidos=${n} redemption_count=${cnt} (teto=1)`);
    t.ok(cnt <= 1, 'redemption_count nunca passa do teto');
    t.ok(only4xxOrOk(tl), 'os recusados sao 4xx');
    await invariants(t, w, 'P-02b');
  });

  await scenario('P-02c', 'sem falso bloqueio: clientes diferentes e promocao sem limite nao se serializam', async (t) => {
    const w = await seedWorld('p02c');
    const limited = await mkPromo(w, { title: 'Limite 1', limitPerCustomer: 1 });
    const free = await mkPromo(w, { title: 'Sem limite', value: 2 });
    const cs = await Promise.all(Array.from({ length: PARALLEL }, (_, i) => mkCustomer(w, i)));
    const same = await mkCustomer(w, 99);
    wrap(promotions, 'recordRedemption', (orig) => async (...a) => { await sleep(150); return orig(...a); });
    const t0 = Date.now();
    const r1 = await Promise.allSettled(cs.map((c) => place(w, c, dto(w, [{ productId: w.burger }], [limited]))));
    const r2 = await Promise.allSettled(Array.from({ length: 6 }, () => place(w, same, dto(w, [{ productId: w.burger }], [free]))));
    const ms = Date.now() - t0;
    t.ok(r1.every((r) => r.status === 'fulfilled'), `${PARALLEL} clientes diferentes com limite 1 passam todos`, `resultados=${fmt(tally(r1))}`);
    t.ok(r2.every((r) => r.status === 'fulfilled'), '6 pedidos do mesmo cliente com promocao SEM limite passam todos', `resultados=${fmt(tally(r2))} tempo_total=${ms}ms`);
    t.ok((await redemptionCount(free)) === 6, 'contador da promocao sem limite = 6');
    await invariants(t, w, 'P-02c');
  });

  await scenario('P-02d', 'replay SEQUENCIAL com limite 1: o segundo e recusado (guarda de regressao)', async (t) => {
    const w = await seedWorld('p02d');
    const c = await mkCustomer(w, 1);
    const promo = await mkPromo(w, { title: 'Limite 1', limitPerCustomer: 1 });
    await place(w, c, dto(w, [{ productId: w.burger }], [promo]));
    const second = await Promise.allSettled([place(w, c, dto(w, [{ productId: w.burger }], [promo]))]);
    t.ok(second[0].status === 'rejected' && classify(second[0]).startsWith('http4'), 'segundo pedido com a mesma promocao e recusado com 4xx', `resultado=${classify(second[0])}`);
    t.ok((await ordersWithPromo(promo)) === 1, 'continua 1 pedido');
  });

  await scenario('P-16', 'replay SEM limite (caracterizacao, sem Idempotency-Key a API cria 2 pedidos)', async (t) => {
    const w = await seedWorld('p16');
    const c = await mkCustomer(w, 1);
    const d = dto(w, [{ productId: w.burger }], []);
    await place(w, c, d);
    await place(w, c, d);
    const n = (await q(`SELECT count(*)::int AS n FROM orders WHERE tenant_id = $1 AND customer_id = $2`, [w.tenantId, c]))[0].n;
    t.note(`mesma requisicao enviada 2x => ${n} pedidos. Nao ha Idempotency-Key na API; nao existe comportamento desejado definido para asserir.`);
    t.note('P-16 fica DOCUMENTADO, nao testado: exige decisao de API (cabecalho + tabela de chaves).');
  });

  // ===================================================== P-17: deadlock por ordem
  await scenario('P-17', 'deadlock: pedidos [A,B] e [B,A] ao mesmo tempo (promocoes sem limite)', async (t) => {
    const w = await seedWorld('p17');
    const A = await mkPromo(w, { title: 'A burger', value: 2, productId: w.burger });
    const B = await mkPromo(w, { title: 'B coca', value: 2, productId: w.coke });
    const c1 = await mkCustomer(w, 1);
    const c2 = await mkCustomer(w, 2);
    // atrasa a 2a promocao DE CADA TRANSACAO (contagem por manager, nao global):
    // cada transacao segura a 1a linha e so pede a 2a depois, cruzando com a outra.
    const perTx = new WeakMap<object, number>();
    wrap(promotions, 'recordRedemption', (orig) => async (...a) => {
      const idx = perTx.get(a[0]) ?? 0;
      perTx.set(a[0], idx + 1);
      if (idx === 1) await sleep(250);
      return orig(...a);
    });
    const items = [{ productId: w.burger }, { productId: w.coke }];
    const rounds = 3;
    const all: PromiseSettledResult<unknown>[] = [];
    for (let i = 0; i < rounds; i++) {
      all.push(...(await Promise.allSettled([place(w, c1, dto(w, items, [A, B])), place(w, c2, dto(w, items, [B, A]))])));
    }
    const tl = tally(all);
    t.ok(!('DEADLOCK(40P01)' in tl), 'nenhum deadlock detectado pelo Postgres', `resultados(${rounds} rodadas x 2 pedidos)=${fmt(tl)}`);
    t.ok(all.every((r) => r.status === 'fulfilled'), 'todos os pedidos foram criados');
    t.ok((await redemptionCount(A)) === rounds * 2 && (await redemptionCount(B)) === rounds * 2, 'contadores de A e B = pedidos criados');
    await invariants(t, w, 'P-17');
  });

  // ===================================================== falha libera trava
  await scenario('P-02e', 'falha apos validar: nao consome uso e nao deixa trava orfa', async (t) => {
    const w = await seedWorld('p02e');
    const c = await mkCustomer(w, 1);
    const promo = await mkPromo(w, { title: 'Limite 1', limitPerCustomer: 1 });
    let boom = true;
    wrap(promotions, 'recordRedemption', (orig) => async (...a) => {
      if (boom) { boom = false; throw new Error('falha-injetada'); }
      return orig(...a);
    });
    const first = await Promise.allSettled([place(w, c, dto(w, [{ productId: w.burger }], [promo]))]);
    t.ok(first[0].status === 'rejected', 'a 1a tentativa falhou (injetado)', `resultado=${classify(first[0])}`);
    const held = await advisoryLocksHeld();
    t.ok(held === 0, 'nenhum advisory lock restou apos o rollback', `locks_advisory_retidos=${held}`);
    const second = await Promise.allSettled([place(w, c, dto(w, [{ productId: w.burger }], [promo]))]);
    t.ok(second[0].status === 'fulfilled', 'o cliente consegue pedir de novo (uso nao foi consumido)', `resultado=${classify(second[0])}`);
    t.ok((await redemptionCount(promo)) === 1, 'redemption_count = 1');
    await invariants(t, w, 'P-02e');
  });

  // ===================================================== P-03: devolucao multipla
  // Monta um pedido que usou promocao + cashback; contador adulterado para 3
  // (como se outros 2 pedidos tambem usassem a promocao).
  async function buildCancelFixture(tag: string, expire: boolean) {
    const w = await seedWorld(tag);
    const c = await mkCustomer(w, 1);
    const promo = await mkPromo(w, { title: 'Cupom', value: 5 });
    await insertRow('cashback_ledger_entries', {
      tenant_id: w.tenantId, customer_id: c, source_type: 'admin_adjustment', source_id: null,
      original_amount: 10, remaining_amount: 10, expires_at: null,
    });
    const o = await place(w, c, dto(w, [{ productId: w.burger }], [promo], { useCashback: true }));
    await q(`UPDATE promotions SET redemption_count = 3 WHERE id = $1`, [promo]);
    if (expire) {
      await q(
        `UPDATE orders SET status = 'aguardando_pagamento', payment_method = 'pix', payment_status = 'pendente', pix_expires_at = now() - interval '5 minutes' WHERE id = $1`,
        [o.id],
      );
    }
    return { w, c, promo, orderId: o.id, tenantId: w.tenantId };
  }
  const ledgerRemaining = async (c: string) =>
    Number((await q(`SELECT COALESCE(SUM(remaining_amount),0) AS s FROM cashback_ledger_entries WHERE customer_id = $1`, [c]))[0].s);
  const reversedFlags = async (orderId: string) =>
    (await q(`SELECT reversed FROM cashback_consumptions WHERE order_id = $1`, [orderId])).map((r: any) => r.reversed);

  async function assertSingleRelease(
    t: Scenario,
    f: Awaited<ReturnType<typeof buildCancelFixture>>,
    label: string,
  ) {
    const cnt = await redemptionCount(f.promo);
    const rem = await ledgerRemaining(f.c);
    const st = (await q(`SELECT status, cancel_reason FROM orders WHERE id = $1`, [f.orderId]))[0];
    const ev = `redemption_count=${cnt} (esperado 2; foi 3 antes) cashback_restante=${rem} (esperado 10.00) status=${st.status} consumos_revertidos=${fmt(await reversedFlags(f.orderId))}`;
    t.ok(st.status === 'cancelado', `${label}: pedido cancelado`);
    t.ok(cnt === 2, `${label}: vaga da promocao devolvida UMA vez (3 -> 2)`, ev);
    t.ok(rem === 10, `${label}: cashback devolvido UMA vez (saldo volta a 10.00, nao mais)`);
  }

  await scenario('P-03a', 'cancelamento simultaneo: 5x markCancelled do MESMO pedido (copias em memoria distintas)', async (t) => {
    const f = await buildCancelFixture('p03a', false);
    // barreira: junta os 5 chamadores antes da devolucao de cashback para ampliar a janela de leitura-modificacao-escrita
    let arrived = 0;
    wrap(cashback, 'reverseConsumptionForOrder', (orig) => async (...a) => {
      arrived++;
      const t0 = Date.now();
      while (arrived < 5 && Date.now() - t0 < 400) await sleep(10);
      return orig(...a);
    });
    const copies = await Promise.all(Array.from({ length: 5 }, () => AppDataSource.getRepository(Order).findOneByOrFail({ id: f.orderId })));
    // markCancelled so muda o objeto em memoria e devolve vaga/cashback; quem persiste o status e o
    // CHAMADOR (orderRepo.save). Reproduz o par chamada+save de cada caminho real.
    const res = await Promise.allSettled(
      copies.map(async (o) => {
        await (orders as any).markCancelled(o, 'teste concorrente');
        await AppDataSource.getRepository(Order).save(o);
      }),
    );
    t.ok(res.every((r) => r.status === 'fulfilled'), 'nenhum chamador lancou erro', `resultados=${fmt(tally(res))}`);
    await assertSingleRelease(t, f, 'P-03a');
  });

  await scenario('P-03b', 'Pix expirado: 5x checkPixStatus do mesmo pedido (poll do cliente em abas/aparelhos)', async (t) => {
    const f = await buildCancelFixture('p03b', true);
    let arrived = 0;
    wrap(cashback, 'reverseConsumptionForOrder', (orig) => async (...a) => {
      arrived++;
      const t0 = Date.now();
      while (arrived < 5 && Date.now() - t0 < 400) await sleep(10);
      return orig(...a);
    });
    const res = await Promise.allSettled(Array.from({ length: 5 }, () => orders.checkPixStatus(f.tenantId, f.orderId)));
    t.ok(res.every((r) => r.status === 'fulfilled'), 'nenhum poll lancou erro', `resultados=${fmt(tally(res))}`);
    await assertSingleRelease(t, f, 'P-03b');
    const pay = (await q(`SELECT payment_status FROM orders WHERE id = $1`, [f.orderId]))[0].payment_status;
    t.ok(pay === 'falhou', 'payment_status = falhou', `payment_status=${pay}`);
  });

  await scenario('P-03c', 'cancelamento SEQUENCIAL repetido continua idempotente (guarda de regressao)', async (t) => {
    const f = await buildCancelFixture('p03c', false);
    for (let i = 0; i < 3; i++) {
      const copy = await AppDataSource.getRepository(Order).findOneByOrFail({ id: f.orderId });
      await (orders as any).markCancelled(copy, 'repetido');
      await AppDataSource.getRepository(Order).save(copy); // como o chamador real: a 2a leitura ja ve 'cancelado'
    }
    await assertSingleRelease(t, f, 'P-03c');
  });

  await scenario('P-03d', 'webhook duplicado: 5x applyMercadoPagoStatus(approved) -> uma unica transicao para pago', async (t) => {
    const w = await seedWorld('p03d');
    const c = await mkCustomer(w, 1);
    const o = await place(w, c, dto(w, [{ productId: w.burger }], []));
    await q(`UPDATE orders SET status = 'aguardando_pagamento', payment_method = 'pix', payment_status = 'pendente', mp_payment_id = 'mp-dup' WHERE id = $1`, [o.id]);
    const copies = await Promise.all(Array.from({ length: 5 }, () => AppDataSource.getRepository(Order).findOneByOrFail({ id: o.id })));
    const res = await Promise.allSettled(copies.map((x) => (orders as any).applyMercadoPagoStatus(x, 'approved', 'mp-dup')));
    const st = (await q(`SELECT status, payment_status, cashback_locked FROM orders WHERE id = $1`, [o.id]))[0];
    const credits = (await q(`SELECT count(*)::int AS n FROM cashback_ledger_entries WHERE source_type = 'order' AND source_id = $1`, [o.id]))[0].n;
    t.ok(res.every((r) => r.status === 'fulfilled'), 'nenhuma chamada lancou erro', `resultados=${fmt(tally(res))}`);
    t.ok(st.status === 'pendente' && st.payment_status === 'pago', 'pedido foi para pendente/pago', `status=${st.status}/${st.payment_status}`);
    t.ok(credits <= 1, 'no maximo 1 credito de cashback para o pedido', `creditos=${credits}`);
    t.note('cobre a regra de negocio (transicao atomica), NAO a camada HTTP/assinatura do webhook.');
  });

  // ===================================================== P-15 (aberto, fora do Patch 1)
  await scenario('P-15', 'cobranca Pix orfa: falha DEPOIS de criar a cobranca no Mercado Pago (aberto)', async (t) => {
    const w = await seedWorld('p15');
    const c = await mkCustomer(w, 1);
    const promo = await mkPromo(w, { title: 'Cupom', value: 5 });
    await AppDataSource.getRepository(Tenant).update(w.tenantId, {
      mercadoPagoAccessTokenEncrypted: 'token-stub',
      mercadoPagoWebhookSecretEncrypted: 'secret-stub',
      mercadoPagoPublicKey: 'pk-stub',
    } as any);
    mpReset();
    wrap(promotions, 'recordRedemption', () => async () => { throw new Error('falha-injetada-apos-mp'); });
    const res = await Promise.allSettled([place(w, c, dto(w, [{ productId: w.burger }], [promo], { paymentMethod: 'pix' }))]);
    const created = mpCount('createPixPayment');
    const cancelled = mpCount('cancelPayment');
    const nOrders = (await q(`SELECT count(*)::int AS n FROM orders WHERE tenant_id = $1`, [w.tenantId]))[0].n;
    t.ok(res[0].status === 'rejected', 'o pedido falhou (injetado) e foi revertido', `pedidos_no_banco=${nOrders}`);
    t.ok(created === 1, 'o fluxo chegou a criar a cobranca Pix no MP (pre-condicao da reproducao)', `createPixPayment=${created}`);
    t.knownOpen(
      created === 0 || cancelled >= 1,
      'nenhuma cobranca Pix fica viva sem pedido (ou ela e cancelada)',
      `createPixPayment=${created} cancelPayment=${cancelled} pedidos=${nOrders} => cobranca valida no MP sem pedido`,
    );
    t.note('correcao estrutural (commit do pedido -> Pix fora da transacao -> atualizar payload) e recomendacao futura, FORA do Patch 1.');
  });

  // ===================================================== P-18 (aberto, fora do Patch 1)
  await scenario('P-18', 'cashbackLocked defasado: cancelamento com copia velha apos o pagamento (aberto)', async (t) => {
    const w = await seedWorld('p18');
    const c = await mkCustomer(w, 1);
    await insertRow('cashback_ledger_entries', {
      tenant_id: w.tenantId, customer_id: c, source_type: 'admin_adjustment', source_id: null,
      original_amount: 10, remaining_amount: 10, expires_at: null,
    });
    const o = await place(w, c, dto(w, [{ productId: w.burger }], [], { useCashback: true }));
    await q(`UPDATE orders SET status = 'aguardando_pagamento', payment_method = 'pix' WHERE id = $1`, [o.id]);
    const stale = await AppDataSource.getRepository(Order).findOneByOrFail({ id: o.id }); // cashbackLocked=false na memoria
    await q(`UPDATE orders SET status = 'pendente', payment_status = 'pago', cashback_locked = true WHERE id = $1`, [o.id]); // webhook pagou
    const before = await ledgerRemaining(c);
    await (orders as any).markCancelled(stale, 'cancelamento com copia defasada');
    const after = await ledgerRemaining(c);
    t.ok(before === 0, 'pre-condicao: o cashback do pedido foi gasto', `saldo_antes=${before}`);
    t.knownOpen(
      after === 0,
      'pedido PAGO (cashback travado) nao devolve o cashback usado',
      `saldo_depois=${after} (devolveu ${after - before} de um pedido ja pago)`,
    );
  });

  // ===================================================== resumo
  console.log('\n================ RESUMO POR CENARIO ================');
  for (const r of table) console.log(`  ${r.status.padEnd(9)} ${r.id.padEnd(6)} ${r.title}`);
  const code = checker.finish();
  if (execErrors > 0) {
    console.log(`\n${execErrors} cenario(s) com ERRO DE EXECUCAO (ambiente/seed) - resultado inconclusivo.`);
    return 3;
  }
  await AppDataSource.destroy();
  return code;
}

main()
  .then((c) => process.exit(c))
  .catch(async (e) => {
    console.error(e);
    try { await AppDataSource.destroy(); } catch { /* ignora */ }
    process.exit(3);
  });

/*
PLANO DOS TESTES (espelha docs/PLANO-TESTES-PROMOTIONS-AUDIT.md)

Cenario  Achado   O que prova                                         Antes do Patch 1 | Depois
P-02a    P-02     limite 1/cliente, 8 paralelos, mesmo cliente        FALHOU (8 pedidos) | OK (1 pedido, 7x 409)
P-02b    P-02     teto global 1, 8 clientes                           FALHOU (cnt=8)     | OK
P-02c    controle nao serializa clientes distintos / promo sem limite OK                 | OK
P-02d    controle replay sequencial recusado                          OK                 | OK
P-02e    controle falha libera trava, sem lock orfao                  OK                 | OK
P-16     P-16     replay sem limite (so caracterizacao)               nota               | nota
P-17     P-17     [A,B] x [B,A] sem limite                            FALHOU (40P01)     | OK (ordem fixa)
P-03a    P-03     5x markCancelled concorrente                        FALHOU             | OK
P-03b    P-03     5x checkPixStatus (Pix expirado)                    FALHOU             | OK
P-03c    controle cancelamento sequencial idempotente                 OK                 | OK
P-03d    controle webhook duplicado: 1 transicao                      OK                 | OK
P-15     P-15     cobranca Pix orfa                                    ABERTO             | ABERTO (fora do patch)
P-18     P-18     cashbackLocked defasado                              ABERTO             | ABERTO (fora do patch)
*/
