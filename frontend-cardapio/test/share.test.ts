import assert from 'node:assert/strict';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { readFileSync } from 'node:fs';
import handler, { absoluteImage, appUrl, buildSharePage, escapeHtml, truncate } from '../api/share';

assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
assert.equal(truncate('a '.repeat(200)).length <= 200, true);
assert.equal(absoluteImage('https://x/y.png', 'https://api'), 'https://x/y.png');
assert.equal(absoluteImage('/uploads/a.png', 'https://api/'), 'https://api/uploads/a.png');
assert.equal(absoluteImage('data:image/png;base64,xx', 'https://api'), null);
assert.equal(absoluteImage(null, 'https://api'), null);

// HTML: injeção de aspas/tags no nome do produto não escapa do atributo
const html = buildSharePage({ siteName: 'Loja "X"', title: 'Pizza "G" <script>alert(1)</script>', description: 'R$ 10,00', imageUrl: 'https://i/p.png?a=1&b=2', pageUrl: 'https://app.com/loja/produto/abc', kind: 'produto' });
for (const needle of ['property="og:title"', 'property="og:description"', 'property="og:image" content="https://i/p.png?a=1&amp;b=2"', 'property="og:url" content="https://app.com/loja/produto/abc"', 'name="twitter:card" content="summary_large_image"', 'og:type" content="product"']) assert.ok(html.includes(needle), needle);
assert.ok(!html.includes('<script>alert(1)'), 'sem XSS');
assert.ok(!buildSharePage({ siteName: 's', title: 't', description: 'd', imageUrl: null, pageUrl: 'https://a/b', kind: 'promocao' }).includes('og:image'), 'sem imagem não emite og:image');

// handler com API simulada
const TENANT = { id: 't-1', name: 'Pizzaria Boa', logoUrl: 'https://i/logo.png', coverImageUrl: null };
const PRODUCTS = [{ id: 'aaaaaaaa-1111', name: 'Calabresa', description: 'Muito queijo', price: 40, promoPrice: 35.5, imageUrl: 'https://i/cal.png' }];
const PROMOS = [{ id: 'bbbbbbbb-2222', title: 'Terça em dobro', description: null, imageUrl: null, discountType: 'percentage', discountValue: 20 }];
const calls: string[] = [];
globalThis.fetch = (async (input: unknown) => {
  const url = String(input); calls.push(url);
  const body = url.includes('/tenants/public/') ? (url.endsWith('/naoexiste') ? null : TENANT) : url.includes('/products/public/') ? PRODUCTS : PROMOS;
  return body === null ? new Response('nf', { status: 404 }) : new Response(JSON.stringify(body), { status: 200 });
}) as typeof fetch;
process.env.API_URL = 'https://api.exemplo.com/';

async function call(qs: string) {
  const req = new IncomingMessage(new Socket()); req.url = `/api/share?${qs}`; req.headers.host = 'app.exemplo.com';
  const res = new ServerResponse(req); let body = ''; res.end = ((c?: string) => { body = c ?? ''; return res; }) as typeof res.end;
  await handler(req, res); return { status: res.statusCode, body, cache: String(res.getHeader('Cache-Control')) };
}
(async () => {
  let r = await call('slug=pizzaria&kind=produto&id=aaaaaaaa-1111');
  assert.equal(r.status, 200);
  assert.ok(r.body.includes('og:title" content="Calabresa"') && r.body.includes('R$ 35,50') && r.body.includes('https://i/cal.png') && r.body.includes('https://app.exemplo.com/pizzaria/produto/aaaaaaaa-1111'));
  assert.ok(r.cache.includes('s-maxage=300'));
  assert.ok(calls[0] === 'https://api.exemplo.com/tenants/public/pizzaria', 'base da API sem barra dupla');
  r = await call('slug=pizzaria&kind=promocao&id=bbbbbbbb-2222');
  assert.ok(r.body.includes('og:title" content="Terça em dobro"') && r.body.includes('20% de desconto em Pizzaria Boa') && r.body.includes('https://i/logo.png'));
  r = await call('slug=pizzaria&kind=produto&id=cccccccc-9999'); // item que não existe: cai no preview da loja, 200
  assert.equal(r.status, 200); assert.ok(r.body.includes('og:title" content="Pizzaria Boa"'));
  assert.equal((await call('slug=../etc&kind=produto&id=aaaaaaaa-1111')).status, 400);
  assert.equal((await call('slug=pizzaria&kind=outro&id=aaaaaaaa-1111')).status, 400);
  r = await call('slug=naoexiste&kind=produto&id=aaaaaaaa-1111'); assert.equal(r.status, 502); assert.equal(r.cache, 'no-store');
  // Host inválido nunca vira og:url/redirecionamento.
  {
    const req = new IncomingMessage(new Socket()); req.url = '/api/share?slug=loja&kind=produto&id=12345678-aaaa'; req.headers.host = 'evil.com/"><script>';
    const res = new ServerResponse(req); res.end = (() => res) as typeof res.end;
    await handler(req, res);
    assert.equal(res.statusCode, 400, 'host inválido => 400');
  }
  console.log('share: todas as verificacoes passaram');
})();

// Anti-laço (navegador embutido do Instagram etc.): o redirecionamento da página de
// preview leva `?app=1`, que o vercel.json usa em `missing` para não reescrever de novo.
assert.equal(appUrl('https://app.com/loja/produto/abc'), 'https://app.com/loja/produto/abc?app=1');
assert.equal(appUrl('https://app.com/x?a=1'), 'https://app.com/x?a=1&app=1');
const redirectHtml = buildSharePage({ siteName: 's', title: 't', description: 'd', imageUrl: null, pageUrl: 'https://app.com/loja/produto/abc', kind: 'produto' });
assert.ok(redirectHtml.includes('location.replace("https://app.com/loja/produto/abc?app=1")'), 'redireciona com ?app=1');
assert.ok(redirectHtml.includes('rel="canonical" href="https://app.com/loja/produto/abc"'), 'canonical continua limpo');
const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as { rewrites: Array<{ has?: unknown; missing?: Array<{ key: string }> }> };
for (const r of vercel.rewrites.filter((x) => x.has)) assert.ok(r.missing?.some((m) => m.key === 'app'), 'rewrite de robô ignora ?app=1');
