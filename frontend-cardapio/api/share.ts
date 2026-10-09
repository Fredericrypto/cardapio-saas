// Preview de compartilhamento (OpenGraph) para produtos e promoções.
//
// O cardápio é um SPA estático: o HTML que a Vercel serve é sempre o mesmo e as
// meta tags só existiriam depois do JavaScript rodar — coisa que os robôs de
// preview do WhatsApp, Telegram, Instagram, Facebook, X, Slack, Discord e do
// Gmail NÃO fazem. Por isso o vercel.json manda os links /:slug/produto/:id e
// /:slug/promocao/:id para ESTA função SOMENTE quando o User-Agent é de robô;
// pessoas continuam recebendo o app normalmente (e caem direto no item).
//
// A função busca o item na API pública, devolve um HTML mínimo com as meta tags
// og:* / twitter:* e, por garantia, um redirecionamento para o mesmo link.
import type { IncomingMessage, ServerResponse } from 'node:http';

export type ShareKind = 'produto' | 'promocao';

interface PublicTenant {
  name: string;
  logoUrl: string | null;
  coverImageUrl: string | null;
}
interface PublicProduct {
  id: string;
  name: string;
  description: string | null;
  price: number | string;
  promoPrice?: number | string | null;
  imageUrl: string | null;
}
interface PublicPromotion {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  discountType: string;
  discountValue: number | string;
}

export interface SharePageInput {
  siteName: string;
  title: string;
  description: string;
  imageUrl: string | null;
  pageUrl: string;
  kind: ShareKind | 'tenant';
}

const MAX_DESCRIPTION = 200;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function brl(value: number | string): string {
  return `R$ ${Number(value).toFixed(2).replace('.', ',')}`;
}

export function truncate(text: string, max: number = MAX_DESCRIPTION): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

/** Só URL absoluta http(s) serve de og:image; caminho relativo é resolvido na API. */
export function absoluteImage(url: string | null | undefined, apiBase: string): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return `${apiBase.replace(/\/+$/, '')}${url}`;
  return null;
}

/** Mesmo link com o marcador que desliga o preview para robôs (anti-laço). */
export function appUrl(pageUrl: string): string {
  return `${pageUrl}${pageUrl.includes('?') ? '&' : '?'}app=1`;
}

export function buildSharePage(input: SharePageInput): string {
  const t = escapeHtml(input.title);
  const d = escapeHtml(input.description);
  const site = escapeHtml(input.siteName);
  const url = escapeHtml(input.pageUrl);
  const image = input.imageUrl ? escapeHtml(input.imageUrl) : null;
  const ogType = input.kind === 'produto' ? 'product' : 'website';
  const lines = [
    '<!doctype html>',
    '<html lang="pt-BR">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${t}</title>`,
    `<meta name="description" content="${d}">`,
    `<link rel="canonical" href="${url}">`,
    `<meta property="og:type" content="${ogType}">`,
    '<meta property="og:locale" content="pt_BR">',
    `<meta property="og:site_name" content="${site}">`,
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${d}">`,
    `<meta property="og:url" content="${url}">`,
  ];
  if (image) {
    lines.push(`<meta property="og:image" content="${image}">`, `<meta property="og:image:alt" content="${t}">`);
  }
  lines.push(
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${t}">`,
    `<meta name="twitter:description" content="${d}">`,
  );
  if (image) lines.push(`<meta name="twitter:image" content="${image}">`);
  lines.push(
    '</head>',
    '<body>',
    `<h1>${t}</h1>`,
    `<p>${d}</p>`,
    image ? `<img src="${image}" alt="${t}" width="600">` : '',
    `<p><a href="${url}">Abrir no cardápio</a></p>`,
    // Pessoas normalmente nunca chegam aqui (o rewrite é por User-Agent), mas o
    // navegador embutido de alguns apps (ex.: Instagram) traz o nome do app no
    // User-Agent e cai neste caminho. O redirecionamento leva `?app=1`, que o
    // vercel.json usa (`missing`) para NÃO reescrever de novo — sem isso a
    // pessoa ficaria num laço infinito entre esta página e ela mesma.
    `<script>location.replace(${JSON.stringify(appUrl(input.pageUrl)).replace(/</g, '\\u003c')});</script>`,
    '</body>',
    '</html>',
  );
  return lines.filter(Boolean).join('\n');
}

function productPage(
  tenant: PublicTenant,
  product: PublicProduct,
  pageUrl: string,
  apiBase: string,
): SharePageInput {
  const hasPromo = product.promoPrice != null && Number(product.promoPrice) > 0;
  const price = brl(hasPromo ? (product.promoPrice as number | string) : product.price);
  const description = product.description ? `${price} — ${truncate(product.description)}` : `${price} — peça pelo cardápio de ${tenant.name}`;
  return {
    siteName: tenant.name,
    title: product.name,
    description,
    imageUrl: absoluteImage(product.imageUrl, apiBase) ?? absoluteImage(tenant.logoUrl, apiBase),
    pageUrl,
    kind: 'produto',
  };
}

function promotionPage(
  tenant: PublicTenant,
  promo: PublicPromotion,
  pageUrl: string,
  apiBase: string,
): SharePageInput {
  const discount = promo.discountType === 'percentage' ? `${Number(promo.discountValue)}% de desconto` : `${brl(promo.discountValue)} de desconto`;
  return {
    siteName: tenant.name,
    title: promo.title,
    description: promo.description ? truncate(promo.description) : `${discount} em ${tenant.name}`,
    imageUrl: absoluteImage(promo.imageUrl, apiBase) ?? absoluteImage(tenant.coverImageUrl, apiBase) ?? absoluteImage(tenant.logoUrl, apiBase),
    pageUrl,
    kind: 'promocao',
  };
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  return (await res.json()) as T;
}

function send(res: ServerResponse, status: number, body: string, cache: string): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', cache);
  res.end(body);
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/i;
const ID_RE = /^[0-9a-f-]{8,40}$/i;
const HOST_RE = /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?(:\d{1,5})?$/i;

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const params = new URL(req.url ?? '/', 'http://localhost').searchParams;
  const slug = params.get('slug') ?? '';
  const kind = params.get('kind') ?? '';
  const id = params.get('id') ?? '';
  if (!SLUG_RE.test(slug) || (kind !== 'produto' && kind !== 'promocao') || !ID_RE.test(id)) {
    send(res, 400, '<!doctype html><title>Link inválido</title>', 'no-store');
    return;
  }

  const apiBase = (process.env.API_URL || process.env.VITE_API_URL || '').replace(/\/+$/, '');
  if (!apiBase) {
    send(res, 500, '<!doctype html><title>API_URL não configurada</title>', 'no-store');
    return;
  }
  // Host vem de cabeçalho: só aceita nome de host válido (sem esquema, caminho,
  // credenciais ou espaços) antes de montar og:url/canonical e o redirecionamento.
  const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '').split(',')[0].trim();
  if (!HOST_RE.test(host)) {
    send(res, 400, '<!doctype html><title>Link inválido</title>', 'no-store');
    return;
  }
  const pageUrl = `https://${host}/${slug}/${kind}/${id}`;

  try {
    const tenant = await getJson<PublicTenant & { id: string }>(`${apiBase}/tenants/public/${encodeURIComponent(slug)}`);
    let page: SharePageInput = {
      siteName: tenant.name,
      title: tenant.name,
      description: `Veja o cardápio de ${tenant.name}`,
      imageUrl: absoluteImage(tenant.logoUrl, apiBase),
      pageUrl,
      kind: 'tenant',
    };
    if (kind === 'produto') {
      const products = await getJson<PublicProduct[]>(`${apiBase}/products/public/${tenant.id}`);
      const product = products.find((p) => p.id === id);
      if (product) page = productPage(tenant, product, pageUrl, apiBase);
    } else {
      const promos = await getJson<PublicPromotion[]>(`${apiBase}/promotions/public/${tenant.id}`);
      const promo = promos.find((p) => p.id === id);
      if (promo) page = promotionPage(tenant, promo, pageUrl, apiBase);
    }
    send(res, 200, buildSharePage(page), 'public, s-maxage=300, stale-while-revalidate=600');
  } catch {
    // Falha de rede/API: o robô tenta de novo depois; não cacheia o erro.
    send(res, 502, '<!doctype html><title>Indisponível no momento</title>', 'no-store');
  }
}
