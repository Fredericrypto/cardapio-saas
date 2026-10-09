// Links públicos de compartilhamento. Sempre o link GERAL do item (nunca o da
// mesa escaneada: o QR da mesa é pessoal e a sessão não deve vazar num grupo de
// WhatsApp). O link abre direto o item/promoção (rotas /:slug/produto/:id e
// /:slug/promocao/:id) e, para robôs de preview, serve o card OpenGraph
// (ver api/share.ts).
export type ShareKind = 'produto' | 'promocao';

// No app Android (Capacitor) window.location.origin é local; defina
// VITE_PUBLIC_APP_URL com o domínio público do cardápio nesse caso.
function publicOrigin(): string {
  const configured = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim();
  const origin = configured || (typeof window !== 'undefined' ? window.location.origin : '');
  return origin.replace(/\/+$/, '');
}

export function buildShareUrl(kind: ShareKind, slug: string, id: string, origin: string = publicOrigin()): string {
  return `${origin}/${encodeURIComponent(slug)}/${kind}/${encodeURIComponent(id)}`;
}
