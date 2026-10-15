import type { Response } from 'express';
import { bytesForEtag, httpCacheMetrics } from './tenant-cache';

function stripWeak(tag: string): string {
  return tag.trim().replace(/^W\//, '');
}

// Cabeçalhos para revalidação condicional: o navegador sempre pergunta ao
// servidor ("mudou?") e, se o ETag for igual, o Express responde 304 sem
// corpo — a lista não trafega de novo. `no-cache` NÃO significa "não guardar":
// significa "guardar, mas revalidar sempre" (nunca serve dado velho às cegas).
//
// Também conta, por `label`, quantas respostas saíram, quantas chegaram com
// If-None-Match (prova de que o navegador revalida) e quantas viram 304.
export function applyRevalidationHeaders(
  res: Response,
  etag: string | null,
  label = 'http',
  visibility: 'private' | 'public' = 'private',
): void {
  if (!etag) return;
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', visibility === 'private' ? 'private, no-cache' : 'no-cache');
  if (visibility === 'private') res.append('Vary', 'Authorization');

  const header = res.req?.headers?.['if-none-match'];
  const conditional = typeof header === 'string' && header.length > 0;
  const notModified =
    conditional && header.split(',').some((candidate) => stripWeak(candidate) === stripWeak(etag));
  httpCacheMetrics.record(label, conditional, notModified, notModified ? bytesForEtag(etag) : 0);
}
