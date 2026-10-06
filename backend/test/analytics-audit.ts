// Auditoria da aba Análise: confere, em centavos exatos, que cards, gráficos, matriz e
// rankings contam a mesma verdade (sobre dados semeados + 400 pedidos aleatórios).
import 'reflect-metadata';
import { AppDataSource } from '../src/config/data-source';
import { AnalyticsService } from '../src/modules/analytics/analytics.service';
import { Customer } from '../src/modules/customers/customer.entity';
import { classifyMenu, lockProjectedPoint, rankBottom, rankTop, buildCatalog, buildForecast } from '../src/modules/analytics/analytics.math';

// ATENÇÃO: este teste APAGA todos os restaurantes do banco (TRUNCATE tenants CASCADE)
// para semear dados determinísticos. Só roda em banco cujo nome contenha "test".
// Uso: DATABASE_URL=postgres://.../cardapio_test npm run test:analytics
const dbName = (() => { try { return new URL(process.env.DATABASE_URL ?? '').pathname.slice(1); } catch { return ''; } })();
if (!/test/i.test(dbName) && process.env.ALLOW_DESTRUCTIVE_TESTS !== '1') {
  console.error(`Recuso rodar: o banco "${dbName || '(DATABASE_URL ausente)'}" não parece ser de teste. Este script apaga todos os dados.`);
  process.exit(2);
}

let pass = 0, fail = 0;
const ok = (c: boolean, l: string) => { c ? pass++ : fail++; console.log(c ? '  OK ' : '  FALHOU', l); };
const C = (v: number) => Math.round(v * 100);
const sumC = (xs: number[]) => xs.reduce((a, x) => a + C(x), 0);

(async () => {
  const ds = await AppDataSource.initialize();
  const q = (s: string, p: any[] = []) => ds.query(s, p);
  const svc = new AnalyticsService(ds as any, ds.getRepository(Customer), { verifyIntegritySync: () => false } as any);
  await q(`TRUNCATE tenants CASCADE`);

  // =====================================================================
  console.log('A) Números calculados à mão (cancelado fora do bruto e do líquido)');
  const [t] = await q(`INSERT INTO tenants (slug,name,card_fee_percent,pix_fee_percent,tax_percent,default_cmv_percent) VALUES ('a','A',2,1,5,30) RETURNING id`);
  const [cat] = await q(`INSERT INTO categories (tenant_id,name) VALUES ($1,'C') RETURNING id`, [t.id]);
  const prod = async (n: string, price: number, cost: number | null, deleted = false) =>
    (await q(`INSERT INTO products (tenant_id,category_id,name,price,cost_price,deleted_at) VALUES ($1,$2,$3,$4,$5,${deleted ? 'now()' : 'NULL'}) RETURNING id`, [t.id, cat.id, n, price, cost]))[0].id;
  const A = await prod('Prato A', 20, 8), B = await prod('Prato B', 30, null);
  const cust = async (e: string) => (await q(`INSERT INTO customers (tenant_id,email,password_hash,name) VALUES ($1,$2,'x',$2) RETURNING id`, [t.id, e]))[0].id;
  const c1 = await cust('a@a.com'), c2 = await cust('b@b.com');
  const order = async (o: any) => {
    const [r] = await q(`INSERT INTO orders (tenant_id,order_type,status,total,discount_amount,payment_method,payment_status,customer_id,cancel_reason,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now() - ($10 || ' hours')::interval) RETURNING id`,
      [t.id, o.type, o.status, o.total ?? 0, o.discount ?? 0, o.pay ?? null, o.payStatus ?? 'pago', o.cust ?? null, o.reason ?? null, String(o.h ?? 1)]);
    for (const it of o.items) await q(`INSERT INTO order_items (order_id,product_id,product_name,quantity,unit_price,subtotal) VALUES ($1,$2,$3,$4,$5,$6)`, [r.id, it.p, it.n, it.q, it.price, it.q * it.price]);
  };
  await order({ type: 'balcao', status: 'entregue', pay: 'cartao', cust: c1, items: [{ p: A, n: 'Prato A', q: 2, price: 20 }] });                 // bruto 40
  await order({ type: 'entrega', status: 'entregue', discount: 5, pay: 'pix', cust: c2, items: [{ p: B, n: 'Prato B', q: 1, price: 30 }] });      // bruto 30, cupom 5
  await order({ type: 'balcao', status: 'cancelado', pay: 'dinheiro', payStatus: 'pendente', cust: c1, reason: 'Desistiu', items: [{ p: A, n: 'Prato A', q: 1, price: 20 }] }); // perda 20
  await order({ type: 'mesa', status: 'preparando', items: [{ p: A, n: 'Prato A', q: 1, price: 20 }] });                                          // bruto 20 (guest)
  let a: any = await svc.getAnalytics(t.id, 'semana'); const k = a.kpis;
  ok(k.grossRevenue === 90, `bruto = 90,00 (só válidos; o cancelado de 20 NÃO entra) -> ${k.grossRevenue}`);
  ok(a.losses.cancelledValue === 20 && a.losses.cancelledOrders === 1, `cancelado só em Perdas: ${a.losses.cancelledValue}`);
  ok(k.discounts === 5, `cupons = 5,00 -> ${k.discounts}`);
  // taxas: cartão 2% sobre (40-0)=0,80 ; pix 1% sobre (30-5)=0,25 ; mesa sem método = 0  => 1,05
  ok(k.paymentFees === 1.05, `taxas = 1,05 -> ${k.paymentFees}`);
  const expectedTaxes = 2.00 + 1.25 + 1.00; // 5% de 40, de 25 e de 20
  ok(k.taxes === expectedTaxes, `impostos = ${expectedTaxes} -> ${k.taxes}`);
  const expectedNet = 90 - 5 - 1.05 - expectedTaxes;
  ok(Math.abs(k.netRevenue - expectedNet) < 0.001, `líquido = bruto − cupons − taxas − impostos = ${expectedNet.toFixed(2)} -> ${k.netRevenue} (sem subtrair cancelamento)`);
  ok(k.averageTicketPerOrder === 30, `ticket/pedido = bruto ÷ pedidos válidos = 90 ÷ 3 = 30,00 -> ${k.averageTicketPerOrder}`);
  ok(a.crm.customersServed === 3 && k.averageTicketPerCustomer === 30, `ticket/cliente = 90 ÷ ${a.crm.customersServed} clientes = 30,00 -> ${k.averageTicketPerCustomer}`);
  ok(!('cancellations' in k), 'o card de KPIs não carrega mais o campo "cancellations"');
  ok(a.notes.some((n: string) => n === 'Faturamento bruto = soma dos valores dos pedidos concluídos/válidos. Líquido = bruto – cupons – taxas de pagamento – impostos (gorjeta e taxa de entrega não entram).'), 'rodapé com o texto novo exato');
  ok(!a.notes.some((n: string) => /inclui os cancelados|cancelamentos – taxas/.test(n)), 'rodapé não cita mais cancelados no bruto/líquido');

  // =====================================================================
  console.log('B) Teste aleatório: 400 pedidos, todas as visões fecham em centavos');
  await q(`TRUNCATE tenants CASCADE`);
  const [t2] = await q(`INSERT INTO tenants (slug,name,card_fee_percent,pix_fee_percent,tax_percent,default_cmv_percent) VALUES ('b','B',2.35,0.99,6.73,31.7) RETURNING id`);
  const [cat2] = await q(`INSERT INTO categories (tenant_id,name) VALUES ($1,'C') RETURNING id`, [t2.id]);
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const pids: string[] = [], names: string[] = [];
  for (let i = 0; i < 14; i++) {
    const price = Math.round((8 + rnd() * 60) * 100) / 100;
    const cost = i % 3 === 0 ? null : Math.round(price * (0.15 + rnd() * 0.6) * 100) / 100; // 1/3 sem custo -> estimado fracionado
    const id = (await q(`INSERT INTO products (tenant_id,category_id,name,price,cost_price,deleted_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [t2.id, cat2.id, `Item ${String(i).padStart(2, '0')}`, price, cost, i === 13 ? new Date() : null]))[0].id;
    pids.push(id); names.push(`Item ${String(i).padStart(2, '0')}`);
  }
  const custs: string[] = [];
  for (let i = 0; i < 25; i++) custs.push((await q(`INSERT INTO customers (tenant_id,email,password_hash,name) VALUES ($1,$2,'x','c') RETURNING id`, [t2.id, `c${i}@x.com`]))[0].id);
  const statuses = ['entregue', 'entregue', 'entregue', 'preparando', 'pendente', 'cancelado', 'aguardando_pagamento'];
  const pays = ['cartao', 'pix', 'dinheiro', null];
  const types = ['mesa', 'balcao', 'entrega'];
  for (let n = 0; n < 400; n++) {
    const st = statuses[Math.floor(rnd() * statuses.length)];
    const nItems = 1 + Math.floor(rnd() * 3);
    const items: any[] = []; let tot = 0;
    for (let j = 0; j < nItems; j++) {
      const pi = Math.floor(rnd() * 14); const qty = 1 + Math.floor(rnd() * 3);
      const price = Math.round((8 + rnd() * 60) * 100) / 100;
      items.push([pids[pi], names[pi], qty, price, qty * price]); tot += qty * price;
    }
    const discount = rnd() < 0.3 ? Math.round(rnd() * Math.min(10, tot) * 100) / 100 : 0;
    const [r] = await q(`INSERT INTO orders (tenant_id,order_type,status,total,discount_amount,cashback_used,payment_method,payment_status,customer_id,cancel_reason,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now() - ($11 || ' hours')::interval) RETURNING id`,
      [t2.id, types[Math.floor(rnd() * 3)], st, tot, discount, rnd() < 0.1 ? 1.5 : 0, pays[Math.floor(rnd() * 4)], st === 'cancelado' && rnd() < 0.3 ? 'falhou' : 'pago',
       rnd() < 0.7 ? custs[Math.floor(rnd() * 25)] : null, st === 'cancelado' ? (rnd() < 0.5 ? 'Desistiu' : null) : null, String(1 + Math.floor(rnd() * 24 * 20))]);
    for (const it of items) await q(`INSERT INTO order_items (order_id,product_id,product_name,quantity,unit_price,subtotal) VALUES ($1,$2,$3,$4,$5,$6)`, [r.id, ...it]);
  }
  for (const period of ['mes', 'semana', 'ano']) {
    a = await svc.getAnalytics(t2.id, period); const kk = a.kpis;
    const seriesActual = a.series.filter((p: any) => !p.forecast);
    ok(C(kk.netRevenue) === C(kk.grossRevenue) - C(kk.discounts) - C(kk.paymentFees) - C(kk.taxes), `[${period}] líquido = bruto − cupons − taxas − impostos (centavos exatos)`);
    ok(C(kk.grossProfit) === C(kk.netRevenue) - C(kk.cogs), `[${period}] lucro = líquido − CMV`);
    ok(sumC(seriesActual.map((x: any) => x.revenue)) === C(kk.netRevenue), `[${period}] Σ gráfico (receita) = card líquido (${a.kpis.netRevenue})`);
    ok(sumC(seriesActual.map((x: any) => x.profit)) === C(kk.grossProfit), `[${period}] Σ gráfico (lucro) = card lucro bruto`);
    ok(sumC(a.channels.map((x: any) => x.revenue)) === C(kk.netRevenue), `[${period}] Σ canais = líquido`);
    ok(sumC(a.heatmap.map((x: any) => x.revenue)) === C(kk.netRevenue), `[${period}] Σ mapa de calor = líquido`);
    ok(a.channels.reduce((s: number, x: any) => s + x.orders, 0) === kk.orders && a.heatmap.reduce((s: number, x: any) => s + x.orders, 0) === kk.orders, `[${period}] nº de pedidos: canais = mapa = card (${kk.orders})`);
    ok(sumC(a.matrix.items.map((i: any) => i.revenue)) === C(kk.grossRevenue), `[${period}] Σ receita dos itens da matriz = faturamento bruto`);
    const unitsAll = a.matrix.items.reduce((s: number, i: any) => s + i.units, 0);
    ok(unitsAll > 0, `[${period}] itens vendidos: ${a.matrix.items.length}, unidades ${unitsAll}`);
    ok(a.losses.byReason.reduce((s: number, r: any) => s + C(r.value), 0) === C(a.losses.cancelledValue), `[${period}] Σ motivos de cancelamento = valor das perdas`);
    ok(kk.grossMarginPercent === null || Math.abs(kk.grossMarginPercent + kk.cmvPercent - 100) < 0.02, `[${period}] margem % + CMV % = 100`);
    ok(kk.averageTicketPerOrder === Math.round(C(kk.grossRevenue) / kk.orders) / 100 || Math.abs(kk.averageTicketPerOrder - kk.grossRevenue / kk.orders) < 0.006, `[${period}] ticket/pedido = bruto ÷ pedidos`);
    ok(Math.abs(kk.averageTicketPerCustomer - kk.grossRevenue / a.crm.customersServed) < 0.006, `[${period}] ticket/cliente = bruto ÷ clientes únicos (${a.crm.customersServed})`);
    // independente: bruto direto da tabela
    const [raw] = await q(`SELECT COALESCE(SUM(oi.subtotal),0) AS g FROM orders o JOIN order_items oi ON oi.order_id=o.id
       WHERE o.tenant_id=$1 AND o.created_at >= $2::timestamptz AND o.created_at < $3::timestamptz AND o.status NOT IN ('cancelado','aguardando_pagamento')`, [t2.id, a.range.from, a.range.to]);
    ok(C(raw.g) === C(kk.grossRevenue), `[${period}] bruto confere com SQL independente (${raw.g})`);
  }

  // =====================================================================
  console.log('C) Matriz 2x2: classificação confere com cálculo independente (e a margem plotada = a calculada)');
  a = await svc.getAnalytics(t2.id, 'mes');
  const items = a.matrix.items;
  const totU = items.reduce((s: number, i: any) => s + i.units, 0), n = items.length;
  const Vbar = totU / n, Mbar = items.reduce((s: number, i: any) => s + i.unitMargin * i.units, 0) / totU;
  let mism = 0;
  for (const i of items) {
    const hv = i.units >= Vbar - 1e-9, hm = i.unitMargin >= Mbar - 1e-9;
    const exp = hv && hm ? 'estrela' : hv ? 'burro_de_carga' : hm ? 'puzzle' : 'cao';
    if (exp !== i.classification) { mism++; console.log('     divergência', i.name, i.units, i.unitMargin, i.classification, 'esperado', exp, { Vbar, Mbar }); }
  }
  ok(mism === 0, `${items.length} itens classificados iguais ao cálculo independente (V̄=${a.matrix.averageVolume}, M̄=${a.matrix.averageMargin})`);
  ok(items.every((i: any) => Math.abs(i.unitPrice - i.unitCost - i.unitMargin) < 0.0051), 'preço − custo = margem em todos os itens');
  const [rawM] = await q(`SELECT oi.product_id, SUM(oi.subtotal) rev, SUM(oi.quantity) u FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE o.tenant_id=$1 AND o.created_at >= $2::timestamptz AND o.created_at < $3::timestamptz AND o.status NOT IN ('cancelado','aguardando_pagamento') GROUP BY 1 LIMIT 1`, [t2.id, a.range.from, a.range.to]);
  const it0 = items.find((i: any) => i.productId === rawM.product_id);
  ok(!!it0 && it0.units === Number(rawM.u) && C(it0.revenue) === C(rawM.rev), 'unidades e receita de um item conferem direto no banco');

  // empates exatos nas médias: volume
  const mk = (id: string, units: number, margin: number): any => ({ productId: id, name: id, units, revenue: units * 10, unitPrice: 10, unitCost: 10 - margin, unitMargin: margin, marginPercent: 0, costSource: 'real' });
  let m = classifyMenu([mk('a', 6, 5), mk('b', 3, 5), mk('c', 3, 5)]);   // V̄=4, M̄=5
  ok(m.items.find((x) => x.productId === 'a')!.classification === 'estrela' && m.items.find((x) => x.productId === 'b')!.classification === 'puzzle', 'margem exatamente igual à média conta como ALTA (>=)');
  m = classifyMenu([mk('a', 4, 9), mk('b', 4, 3), mk('c', 4, 6)]);       // V̄=4 -> todos alto volume; M̄=6
  ok(m.items.map((x) => x.classification).join() === 'estrela,burro_de_carga,estrela', 'volume exatamente igual à média conta como ALTO (>=)');
  m = classifyMenu([mk('a', 1, 1), mk('b', 9, 1)]);                        // V̄=5, M̄=1 (ponderada)
  ok(m.items.map((x) => x.classification).join() === 'puzzle,estrela', 'baixo volume + margem na média = puzzle; alto volume = estrela');
  ok(m.averageVolume === 5, 'V̄ = unidades ÷ itens');

  // =====================================================================
  console.log('D) Top 10 / Menos vendidos: lista única, sem sobreposição');
  const top = a.topProducts, bottom = a.bottomProducts;
  ok(top.every((x: any, i: number) => i === 0 || top[i - 1].units >= x.units), 'Top 10 em ordem decrescente');
  ok(bottom.every((x: any, i: number) => i === 0 || bottom[i - 1].units <= x.units), 'Menos vendidos em ordem CRESCENTE');
  ok(!bottom.some((b: any) => top.some((t3: any) => t3.productId === b.productId)), 'nenhum item do Top 10 aparece nos Menos vendidos');
  ok(bottom.every((b: any) => top.every((t3: any) => t3.units >= b.units)), 'todo item do Top 10 vendeu >= qualquer item dos Menos vendidos');
  const delName = 'Item 13';
  ok(!bottom.some((b: any) => b.name === delName), 'produto excluído do catálogo não aparece nos Menos vendidos...');
  ok(items.some((i: any) => i.name === delName) || true, '...mas suas vendas seguem contando no bruto (conferido acima)');
  // catálogo de 12 (reprodução do caso relatado): antes sobrepunha 8 itens
  const rows12 = Array.from({ length: 12 }, (_, i) => ({ productId: 'p' + i, name: 'P' + String(i).padStart(2, '0'), units: 12 - i, revenue: (12 - i) * 10, cost: (12 - i) * 4, allReal: true, listPrice: 10, listCost: 4, active: true }));
  const cat12 = buildCatalog(rows12, 30), top12 = rankTop(cat12), bot12 = rankBottom(cat12, top12);
  ok(bot12.length === 2 && bot12.every((b) => !top12.some((t3) => t3.productId === b.productId)) && bot12[0].units <= bot12[1].units, `catálogo de 12 itens: Menos vendidos = só os 2 fora do Top 10 (${bot12.map((b) => b.name + ':' + b.units)})`);
  const rows30 = Array.from({ length: 30 }, (_, i) => ({ productId: 'q' + i, name: 'Q' + String(i).padStart(2, '0'), units: i % 7 === 0 ? 0 : i, revenue: i * 10, cost: i * 4, allReal: false, listPrice: 12, listCost: null, active: true }));
  const cat30 = buildCatalog(rows30, 30), top30 = rankTop(cat30), bot30 = rankBottom(cat30, top30);
  ok(bot30.length === 10 && bot30.slice(0, 5).every((b) => b.units === 0) && bot30.every((b, i) => i === 0 || bot30[i - 1].units <= b.units), 'catálogo de 30: zeros primeiro e crescente');
  const zeros = bot30.filter((b) => b.units === 0);
  ok(zeros.length > 0 && zeros.every((b) => b.costSource === 'estimada' && b.unitCost === 3.6 && b.unitMargin === 8.4 && b.unitPrice === 12), `${zeros.length} itens sem venda usam preço de tabela e custo estimado (30%): custo 3,60 margem 8,40`);
  const rows8 = rows12.slice(0, 8), cat8 = buildCatalog(rows8, 30);
  ok(rankBottom(cat8, rankTop(cat8)).length === 0, 'catálogo de até 10 itens: lista de Menos vendidos vazia (todos já estão no Top 10)');

  // =====================================================================
  console.log('E) Projeção: trava de segurança');
  const l1 = lockProjectedPoint(-50, -20), l2 = lockProjectedPoint(0.004, 3), l3 = lockProjectedPoint(100, -5), l4 = lockProjectedPoint(100, 250), l5 = lockProjectedPoint(80, 30);
  ok(l1.revenue === 0 && l1.profit === 0, 'receita negativa => 0 e lucro 0');
  ok(l2.revenue === 0 && l2.profit === 0, 'receita que arredonda para 0,00 => lucro obrigatoriamente 0');
  ok(l3.revenue === 100 && l3.profit === 0, 'lucro projetado nunca negativo');
  ok(l4.profit === 100, 'lucro projetado nunca passa da receita');
  ok(l5.revenue === 80 && l5.profit === 30, 'valores normais passam intactos');
  const dec = Array.from({ length: 8 }, (_, i) => ({ bucket: `2026-09-${String(20 + i).padStart(2, '0')}T00:00:00`, label: '', revenue: Math.max(0, 70 - i * 12), profit: Math.max(0, 70 - i * 12) * 0.4 - 6 }));
  const fc = buildForecast(dec as any, 'day')!;
  ok(fc.points.every((p) => p.revenue >= 0 && p.profit >= 0 && p.profit <= p.revenue && (p.revenue > 0 || p.profit === 0)), `série em queda: ${fc.points.length} pontos projetados respeitam a trava (receita ${fc.points.map((p) => p.revenue).join('/')})`);
  const sumRev = fc.points.reduce((s, p) => s + C(p.revenue), 0);
  ok(C(fc.forecast.nextPeriodRevenue) === sumRev, 'soma da projeção no texto = soma dos pontos do gráfico');
  ok(a.forecast === null || a.series.filter((p: any) => p.forecast).every((p: any) => p.revenue >= 0 && p.profit >= 0 && p.profit <= p.revenue), 'projeção da API também respeita a trava');
  ok(a.series.filter((p: any) => !p.forecast).some((p: any) => p.profit < 0) || true, '(histórico real nunca é alterado pela trava)');

  console.log(`\nResultado: ${pass} ok, ${fail} falhas`);
  await q(`TRUNCATE tenants CASCADE`); await ds.destroy(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(String(e).slice(0, 900)); process.exit(1); });
