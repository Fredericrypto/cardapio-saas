// Verificação do cache por restaurante (sem banco, sem rede).
// Rodar: cd backend && npx ts-node test/tenant-cache-audit.ts
import assert from 'node:assert/strict';
import { TenantCache, ALL_TENANTS, httpCacheMetrics } from '../src/modules/tenant-cache/tenant-cache';
import { applyRevalidationHeaders } from '../src/modules/tenant-cache/http-cache';
import { InvalidatesTenantCache } from '../src/modules/tenant-cache/invalidates-tenant-cache.decorator';

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (err) {
    console.error(`  FALHOU ${name}\n${err instanceof Error ? err.stack : err}`);
    process.exitCode = 1;
  }
}

function clock() {
  let t = 1_000_000;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('tenant-cache');

  await check('segunda leitura sai da memória (loader roda 1 vez)', async () => {
    const c = new TenantCache(clock().now);
    let calls = 0;
    const loader = async () => { calls += 1; return [{ id: 1 }]; };
    const a = await c.getOrLoad('t1', 'orders', loader, { maxAgeMs: 60_000 });
    const b = await c.getOrLoad('t1', 'orders', loader, { maxAgeMs: 60_000 });
    assert.equal(calls, 1);
    assert.equal(a.source, 'miss');
    assert.equal(b.source, 'hit');
    assert.equal(a.value, b.value);
    assert.equal(a.etag, b.etag);
  });

  await check('restaurantes diferentes não se misturam', async () => {
    const c = new TenantCache(clock().now);
    const a = await c.getOrLoad('t1', 'orders', async () => 'A', { maxAgeMs: 1000 });
    const b = await c.getOrLoad('t2', 'orders', async () => 'B', { maxAgeMs: 1000 });
    assert.equal(a.value, 'A');
    assert.equal(b.value, 'B');
    c.invalidate('t1', 'orders');
    const b2 = await c.getOrLoad('t2', 'orders', async () => 'B2', { maxAgeMs: 1000 });
    assert.equal(b2.value, 'B', 'invalidar t1 não pode derrubar t2');
  });

  await check('escopos diferentes não se misturam', async () => {
    const c = new TenantCache(clock().now);
    await c.getOrLoad('t1', 'orders', async () => 'o', { maxAgeMs: 1000 });
    await c.getOrLoad('t1', 'products', async () => 'p', { maxAgeMs: 1000 });
    c.invalidate('t1', 'orders');
    const p = await c.getOrLoad('t1', 'products', async () => 'p2', { maxAgeMs: 1000 });
    assert.equal(p.value, 'p');
  });

  await check('invalidate força recarga e muda o conteúdo', async () => {
    const c = new TenantCache(clock().now);
    let v = 1;
    const loader = async () => ({ v });
    const a = await c.getOrLoad('t1', 'orders', loader, { maxAgeMs: 60_000 });
    v = 2;
    c.invalidate('t1', ['orders', 'tables']);
    const b = await c.getOrLoad('t1', 'orders', loader, { maxAgeMs: 60_000 });
    assert.deepEqual(b.value, { v: 2 });
    assert.notEqual(a.etag, b.etag);
  });

  await check('idade máxima recarrega mesmo sem invalidação', async () => {
    const k = clock();
    const c = new TenantCache(k.now);
    let calls = 0;
    const loader = async () => { calls += 1; return calls; };
    await c.getOrLoad('t1', 'tables', loader, { maxAgeMs: 10_000 });
    k.advance(9_999);
    await c.getOrLoad('t1', 'tables', loader, { maxAgeMs: 10_000 });
    assert.equal(calls, 1);
    k.advance(2);
    const r = await c.getOrLoad('t1', 'tables', loader, { maxAgeMs: 10_000 });
    assert.equal(calls, 2);
    assert.equal(r.value, 2);
  });

  await check('ETag igual para conteúdo igual (mesmo recarregando)', async () => {
    const c = new TenantCache(clock().now);
    const loader = async () => [{ id: 'a', total: 10 }];
    const a = await c.getOrLoad('t1', 'orders', loader, { maxAgeMs: 1000 });
    c.invalidate('t1', 'orders');
    const b = await c.getOrLoad('t1', 'orders', loader, { maxAgeMs: 1000 });
    assert.notEqual(a.value, b.value);
    assert.equal(a.etag, b.etag);
    assert.match(a.etag, /^W\/"[0-9a-f]{20}"$/);
  });

  await check('fingerprint igual = não recarrega (revalidated); diferente = recarrega', async () => {
    const k = clock();
    const c = new TenantCache(k.now);
    let fp = '3|x';
    let fpCalls = 0;
    let loads = 0;
    const opts = { maxAgeMs: 60_000, fingerprint: async () => { fpCalls += 1; return fp; } };
    const loader = async () => { loads += 1; return loads; };
    await c.getOrLoad('t1', 'orders', loader, opts); // carga (1 fingerprint)
    const r = await c.getOrLoad('t1', 'orders', loader, opts); // confere (2)
    assert.equal(r.source, 'revalidated');
    assert.equal(loads, 1);
    fp = '4|y';
    const r2 = await c.getOrLoad('t1', 'orders', loader, opts);
    assert.equal(r2.source, 'miss');
    assert.equal(loads, 2);
    assert.equal(fpCalls, 4);
  });

  await check('fingerprintEveryMs limita as conferências', async () => {
    const k = clock();
    const c = new TenantCache(k.now);
    let fpCalls = 0;
    const opts = { maxAgeMs: 60_000, fingerprintEveryMs: 2_000, fingerprint: async () => { fpCalls += 1; return 'same'; } };
    await c.getOrLoad('t1', 'orders', async () => 1, opts); // 1 (carga)
    for (let i = 0; i < 5; i += 1) await c.getOrLoad('t1', 'orders', async () => 1, opts); // dentro dos 2 s
    assert.equal(fpCalls, 1);
    k.advance(2_000);
    await c.getOrLoad('t1', 'orders', async () => 1, opts);
    assert.equal(fpCalls, 2);
  });

  await check('erro no fingerprint recarrega em vez de servir às cegas', async () => {
    const k = clock();
    const c = new TenantCache(k.now);
    let boom = false;
    let loads = 0;
    const opts = { maxAgeMs: 60_000, fingerprint: async () => { if (boom) throw new Error('db fora'); return 'ok'; } };
    const loader = async () => { loads += 1; return loads; };
    await c.getOrLoad('t1', 'orders', loader, opts);
    boom = true;
    const r = await c.getOrLoad('t1', 'orders', loader, opts);
    assert.equal(r.source, 'miss');
    assert.equal(loads, 2);
  });

  await check('requisições simultâneas compartilham UMA carga', async () => {
    const c = new TenantCache(clock().now);
    let calls = 0;
    const loader = async () => { calls += 1; await delay(20); return 'x'; };
    const results = await Promise.all(Array.from({ length: 10 }, () => c.getOrLoad('t1', 'orders', loader, { maxAgeMs: 1000 })));
    assert.equal(calls, 1);
    assert.equal(results.filter((r) => r.source === 'miss').length, 1);
    assert.equal(results.filter((r) => r.source === 'coalesced').length, 9);
  });

  await check('invalidar DURANTE a carga: resultado não é guardado', async () => {
    const c = new TenantCache(clock().now);
    let v = 'velho';
    const slow = async () => { const seen = v; await delay(30); return seen; };
    const pending = c.getOrLoad('t1', 'orders', slow, { maxAgeMs: 60_000 });
    await delay(5);
    v = 'novo';
    c.invalidate('t1', 'orders'); // escrita aconteceu no meio da leitura
    const first = await pending;
    assert.equal(first.value, 'velho'); // quem pediu recebe o que leu
    const next = await c.getOrLoad('t1', 'orders', async () => v, { maxAgeMs: 60_000 });
    assert.equal(next.value, 'novo'); // mas o velho NÃO ficou no cache
    assert.equal(next.source, 'miss');
    assert.equal(c.snapshot().endpoints.orders.discardedStale, 1);
  });

  await check('erro do loader propaga e não fica em cache', async () => {
    const c = new TenantCache(clock().now);
    let n = 0;
    const loader = async () => { n += 1; if (n === 1) throw new Error('falhou'); return 'ok'; };
    await assert.rejects(() => c.getOrLoad('t1', 'orders', loader, { maxAgeMs: 1000 }), /falhou/);
    const r = await c.getOrLoad('t1', 'orders', loader, { maxAgeMs: 1000 });
    assert.equal(r.value, 'ok');
  });

  await check('variantes são independentes, mas invalidate derruba todas', async () => {
    const c = new TenantCache(clock().now);
    let a = 0;
    let b = 0;
    await c.getOrLoad('t1', 'tables', async () => (a += 1), { maxAgeMs: 1000, variant: 'summary:s1' });
    await c.getOrLoad('t1', 'tables', async () => (b += 1), { maxAgeMs: 1000, variant: 'summary:s2' });
    await c.getOrLoad('t1', 'tables', async () => (a += 1), { maxAgeMs: 1000, variant: 'summary:s1' });
    assert.equal(a, 1);
    c.invalidate('t1', 'tables');
    await c.getOrLoad('t1', 'tables', async () => (a += 1), { maxAgeMs: 1000, variant: 'summary:s1' });
    await c.getOrLoad('t1', 'tables', async () => (b += 1), { maxAgeMs: 1000, variant: 'summary:s2' });
    assert.equal(a, 2);
    assert.equal(b, 2);
  });

  await check('invalidateAll derruba todos os restaurantes do escopo', async () => {
    const c = new TenantCache(clock().now);
    let n = 0;
    const loader = async () => (n += 1);
    await c.getOrLoad('t1', 'tables', loader, { maxAgeMs: 1000 });
    await c.getOrLoad('t2', 'tables', loader, { maxAgeMs: 1000 });
    await c.getOrLoad('t1', 'orders', loader, { maxAgeMs: 1000 });
    c.invalidateAll('tables');
    await c.getOrLoad('t1', 'tables', loader, { maxAgeMs: 1000 });
    await c.getOrLoad('t2', 'tables', loader, { maxAgeMs: 1000 });
    const o = await c.getOrLoad('t1', 'orders', loader, { maxAgeMs: 1000 });
    assert.equal(o.source, 'hit');
    assert.equal(n, 5);
  });

  await check('limite de entradas descarta as mais antigas', async () => {
    const c = new TenantCache(clock().now, 3);
    for (const id of ['a', 'b', 'c', 'd']) {
      await c.getOrLoad('t1', 'tables', async () => id, { maxAgeMs: 1000, variant: id });
    }
    assert.equal(c.snapshot().entries, 3);
    const a = await c.getOrLoad('t1', 'tables', async () => 'a2', { maxAgeMs: 1000, variant: 'a' });
    assert.equal(a.value, 'a2');
  });

  await check('estatísticas: acertos, cargas e bytes evitados', async () => {
    const c = new TenantCache(clock().now);
    const loader = async () => [{ id: 'x'.repeat(100) }];
    for (let i = 0; i < 10; i += 1) await c.getOrLoad('t1', 'orders', loader, { maxAgeMs: 60_000 });
    const s = c.snapshot();
    assert.equal(s.summary.cacheMisses, 1);
    assert.equal(s.summary.cacheHits, 9);
    assert.equal(s.summary.loaderRunsAvoided, 9);
    assert.equal(s.summary.hitRate, 90);
    assert.equal(s.summary.payloadReductionPercent, 90); // 9 servidas da memória / 10 que o banco teria entregue
    assert.equal(s.scopes.orders.hitRate, 90);
    assert.equal(s.scopes.orders.dbLoads, 1);
    assert.equal(s.endpoints.orders.payload.lastLoadItems, 1);
    assert.ok(s.endpoints.orders.payload.lastLoadBytes >= 100);
    c.resetStats();
    assert.equal(c.snapshot().summary.requests, 0);
  });

  console.log('métricas por endpoint');

  await check('rótulos separam endpoints e motivos de carga são classificados', async () => {
    const k = clock();
    const c = new TenantCache(k.now);
    let fp = 'a';
    const withFp = { label: 'admin-orders', maxAgeMs: 10_000, fingerprint: async () => fp };
    await c.getOrLoad('t1', 'orders', async () => 1, withFp); // cold
    c.invalidate('t1', 'orders');
    await c.getOrLoad('t1', 'orders', async () => 2, withFp); // invalidated
    fp = 'b';
    await c.getOrLoad('t1', 'orders', async () => 3, withFp); // fingerprint
    k.advance(10_001);
    await c.getOrLoad('t1', 'orders', async () => 4, withFp); // expired
    await c.getOrLoad('t1', 'tables', async () => 5, { label: 'tables-overview', maxAgeMs: 1000 });
    const e = c.snapshot().endpoints;
    assert.deepEqual(e['admin-orders'].loadReasons, { cold: 1, expired: 1, fingerprint: 1, invalidated: 1, error: 0 });
    assert.equal(e['admin-orders'].dbLoads, 4);
    assert.equal(e['tables-overview'].scope, 'tables');
    assert.equal(c.snapshot().scopes.orders.invalidations, 1);
  });

  await check('bypass é contado e vira alerta', async () => {
    const c = new TenantCache(clock().now);
    c.recordBypass('admin-orders', 'orders');
    c.recordBypass('admin-orders', 'orders');
    const s = c.snapshot();
    assert.equal(s.summary.bypasses, 2);
    assert.ok(s.alerts.some((a) => a.id === 'bypass:admin-orders'));
  });

  await check('invalidações são atribuídas ao método que as causou', async () => {
    const c = new TenantCache(clock().now);
    class Svc {
      constructor(readonly tenantCache: TenantCache) {}
      @InvalidatesTenantCache(['orders', 'tables'])
      async callWaiter(_tenantId: string): Promise<void> {}
      @InvalidatesTenantCache(['orders'])
      async updateStatus(_tenantId: string): Promise<void> {}
    }
    const svc = new Svc(c);
    await svc.callWaiter('t1');
    await svc.callWaiter('t1');
    await svc.updateStatus('t1');
    c.invalidate('t1', 'orders', 'checkPixStatus');
    const by = c.snapshot().invalidationsBySource;
    assert.equal(by['callWaiter'], 4); // 2 chamadas x 2 escopos
    assert.equal(by['updateStatus'], 1);
    assert.equal(by['checkPixStatus'], 1);
    assert.deepEqual(Object.keys(by)[0], 'callWaiter'); // ordenado do maior para o menor
  });

  console.log('alertas de regressão');

  const ids = (c: TenantCache) => c.snapshot().alerts.map((a) => a.id);

  await check('taxa de acerto baixa (< 70% com volume) dispara; pouco volume não', async () => {
    const c = new TenantCache(clock().now);
    for (let i = 0; i < 10; i += 1) {
      c.invalidate('t1', 'orders');
      await c.getOrLoad('t1', 'orders', async () => i, { label: 'admin-orders', maxAgeMs: 60_000 });
    }
    assert.ok(!ids(c).includes('low_hit_rate:admin-orders'), '10 requisições é pouco para alertar');
    for (let i = 0; i < 30; i += 1) {
      c.invalidate('t1', 'orders');
      await c.getOrLoad('t1', 'orders', async () => i, { label: 'admin-orders', maxAgeMs: 60_000 });
    }
    assert.ok(ids(c).includes('low_hit_rate:admin-orders'));
  });

  await check('cache saudável (99% de acerto) não dispara nada', async () => {
    const c = new TenantCache(clock().now);
    for (let i = 0; i < 200; i += 1) await c.getOrLoad('t1', 'orders', async () => 1, { label: 'admin-orders', maxAgeMs: 60_000 });
    assert.deepEqual(ids(c), []);
  });

  await check('"cache não está segurando": ≥ 1 carga a cada 5 s por 5 min', async () => {
    const c = new TenantCache(clock().now);
    for (let i = 0; i < 61; i += 1) {
      c.invalidate('t1', 'orders');
      await c.getOrLoad('t1', 'orders', async () => i, { label: 'admin-orders', maxAgeMs: 60_000 });
    }
    assert.ok(ids(c).includes('cache_not_holding:admin-orders'));
  });

  await check('invalidação excessiva por escopo', async () => {
    const c = new TenantCache(clock().now);
    for (let i = 0; i < 30; i += 1) c.invalidate('t1', 'tables');
    assert.ok(ids(c).includes('excessive_invalidation:tables'));
    assert.ok(!ids(c).includes('excessive_invalidation:orders'));
  });

  await check('cargas subindo rápido (≥ 2x os 5 min anteriores)', async () => {
    const k = clock();
    const c = new TenantCache(k.now);
    const opts = { label: 'session-orders', maxAgeMs: 60_000 };
    for (let i = 0; i < 5; i += 1) {
      c.invalidate('t1', 'tables');
      await c.getOrLoad('t1', 'tables', async () => i, opts);
    }
    k.advance(7 * 60_000);
    for (let i = 0; i < 25; i += 1) {
      c.invalidate('t1', 'tables');
      await c.getOrLoad('t1', 'tables', async () => i, opts);
    }
    assert.ok(ids(c).includes('misses_rising:session-orders'));
  });

  await check('crescimento da lista do painel (> 2 MB por carga) dispara', async () => {
    const c = new TenantCache(clock().now);
    const big = ['x'.repeat(2.2 * 1024 * 1024)];
    await c.getOrLoad('t1', 'orders', async () => big, { label: 'admin-orders', maxAgeMs: 60_000 });
    assert.ok(ids(c).includes('payload_growth:admin-orders'));
  });

  await check('alerta some quando a janela passa', async () => {
    const k = clock();
    const c = new TenantCache(k.now);
    for (let i = 0; i < 61; i += 1) {
      c.invalidate('t1', 'orders');
      await c.getOrLoad('t1', 'orders', async () => i, { label: 'admin-orders', maxAgeMs: 60_000 });
    }
    assert.ok(ids(c).length > 0);
    k.advance(11 * 60_000);
    assert.deepEqual(ids(c).filter((id) => id !== 'excessive_invalidation:orders'), []);
  });

  console.log('ETag / 304');

  const fakeRes = (ifNoneMatch?: string) => {
    const headers: Record<string, string> = {};
    return {
      headers,
      setHeader: (k: string, v: string) => { headers[k] = v; },
      append: (k: string, v: string) => { headers[k] = v; },
      req: { headers: ifNoneMatch ? { 'if-none-match': ifNoneMatch } : {} },
    };
  };

  await check('conta respostas, condicionais e 304 com os bytes poupados', async () => {
    httpCacheMetrics.reset();
    const c = new TenantCache(clock().now);
    const r = await c.getOrLoad('t1', 'orders', async () => [{ id: 'y'.repeat(500) }], { label: 'admin-orders', maxAgeMs: 60_000 });
    applyRevalidationHeaders(fakeRes() as never, r.etag, 'admin-orders'); // 1ª vez: sem If-None-Match
    const res2 = fakeRes(r.etag);
    applyRevalidationHeaders(res2 as never, r.etag, 'admin-orders'); // navegador revalidou: igual -> 304
    applyRevalidationHeaders(fakeRes('W/"outro"') as never, r.etag, 'admin-orders'); // mudou
    const h = c.snapshot().http['admin-orders'];
    assert.equal(h.responses, 3);
    assert.equal(h.conditional, 2);
    assert.equal(h.notModified, 1);
    assert.ok(h.bytesNotModified >= 500);
    assert.equal(res2.headers['ETag'], r.etag);
    assert.equal(res2.headers['Cache-Control'], 'private, no-cache');
    assert.equal(c.snapshot().summary.notModifiedResponses, 1);
  });

  await check('aviso quando o navegador nunca manda If-None-Match', async () => {
    httpCacheMetrics.reset();
    const c = new TenantCache(clock().now);
    for (let i = 0; i < 50; i += 1) applyRevalidationHeaders(fakeRes() as never, 'W/"abc"', 'public-menu', 'public');
    const a = c.snapshot().alerts.find((x) => x.id === 'etag_not_used:public-menu');
    assert.ok(a);
    assert.equal(a?.severity, 'info');
    httpCacheMetrics.reset();
  });

  console.log('InvalidatesTenantCache');

  class FakeService {
    constructor(public readonly tenantCache?: TenantCache) {}
    @InvalidatesTenantCache(['orders', 'tables'])
    async save(tenantId: string, ok: boolean): Promise<string> {
      if (!ok) throw new Error('falhou no meio');
      return `salvo ${tenantId}`;
    }
    @InvalidatesTenantCache(['tables'], () => ALL_TENANTS)
    async anyTenant(): Promise<void> {}
  }

  await check('invalida o restaurante do 1º argumento após sucesso', async () => {
    const c = new TenantCache(clock().now);
    const svc = new FakeService(c);
    let n = 0;
    await c.getOrLoad('t1', 'orders', async () => (n += 1), { maxAgeMs: 1000 });
    await c.getOrLoad('t2', 'orders', async () => (n += 1), { maxAgeMs: 1000 });
    assert.equal(await svc.save('t1', true), 'salvo t1');
    const a = await c.getOrLoad('t1', 'orders', async () => (n += 1), { maxAgeMs: 1000 });
    const b = await c.getOrLoad('t2', 'orders', async () => (n += 1), { maxAgeMs: 1000 });
    assert.equal(a.source, 'miss');
    assert.equal(b.source, 'hit');
  });

  await check('invalida também quando o método lança erro', async () => {
    const c = new TenantCache(clock().now);
    const svc = new FakeService(c);
    await c.getOrLoad('t1', 'orders', async () => 1, { maxAgeMs: 1000 });
    await assert.rejects(() => svc.save('t1', false), /falhou no meio/);
    const r = await c.getOrLoad('t1', 'orders', async () => 2, { maxAgeMs: 1000 });
    assert.equal(r.value, 2);
  });

  await check('ALL_TENANTS invalida todos; sem cache injetado não quebra', async () => {
    const c = new TenantCache(clock().now);
    const svc = new FakeService(c);
    await c.getOrLoad('t1', 'tables', async () => 1, { maxAgeMs: 1000 });
    await c.getOrLoad('t2', 'tables', async () => 1, { maxAgeMs: 1000 });
    await svc.anyTenant();
    assert.equal((await c.getOrLoad('t1', 'tables', async () => 2, { maxAgeMs: 1000 })).value, 2);
    assert.equal((await c.getOrLoad('t2', 'tables', async () => 2, { maxAgeMs: 1000 })).value, 2);
    assert.equal(await new FakeService(undefined).save('t1', true), 'salvo t1');
  });

  console.log(`\n${passed} verificações passaram${process.exitCode ? ' (COM FALHAS)' : ''}.`);
}

main();
