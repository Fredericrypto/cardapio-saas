import type { Response } from 'express';

// Cabeçalhos para revalidação condicional: o navegador sempre pergunta ao
// servidor ("mudou?") e, se o ETag for igual, o Express responde 304 sem
// corpo — a lista não trafega de novo. `no-cache` NÃO significa "não guardar":
// significa "guardar, mas revalidar sempre" (nunca serve dado velho às cegas).
export function applyRevalidationHeaders(
  res: Response,
  etag: string | null,
  visibility: 'private' | 'public' = 'private',
): void {
  if (!etag) return;
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', visibility === 'private' ? 'private, no-cache' : 'no-cache');
  if (visibility === 'private') res.append('Vary', 'Authorization');
}
