// Destino de "voltar depois do login": só caminho INTERNO do mesmo restaurante.
// Qualquer coisa fora disso (outro domínio, `//host`, `javascript:`, `/outro-restaurante`,
// `..`, caracteres de controle) cai no início do próprio restaurante. Evita open redirect:
// o link de login pode ser forjado e compartilhado.
const PROBE_ORIGIN = 'https://redirect-check.invalid';
const MAX_REDIRECT_LENGTH = 2048;

export function safeRedirectPath(raw: string | null | undefined, slug: string | null | undefined): string {
  if (!slug) return '/';
  const fallback = `/${slug}`;
  if (typeof raw !== 'string' || raw === '' || raw.length > MAX_REDIRECT_LENGTH) return fallback;
  if (/[\u0000-\u001F\u007F\\]/.test(raw)) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;
  let url: URL;
  try {
    url = new URL(raw, PROBE_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== PROBE_ORIGIN) return fallback;
  const base = `/${encodeURIComponent(slug)}`;
  if (url.pathname !== base && !url.pathname.startsWith(`${base}/`)) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}
