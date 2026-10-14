// Nota média de UM item para o card do cardápio. Lógica PURA (sem axios), para
// poder ser testada sem navegador; lib/itemRatings.ts liga isso ao endpoint real.
//
// Só é chamada quando o mouse para no card (a grade não faz uma requisição por
// produto). Guarda a resposta por alguns minutos, junta pedidos repetidos do mesmo
// item e NUNCA guarda falha (tenta de novo na próxima vez que o mouse parar).
export interface ItemRating {
  average: number;
  count: number;
}

export interface RatingSummary {
  average: number;
  count: number;
}

export const ITEM_RATING_TTL_MS = 5 * 60 * 1000;

export function createItemRatingLoader(
  fetchSummary: (tenantId: string, productId: string) => Promise<RatingSummary>,
  now: () => number = Date.now,
  ttlMs: number = ITEM_RATING_TTL_MS,
) {
  const cache = new Map<string, { at: number; value: ItemRating }>();
  const inflight = new Map<string, Promise<ItemRating | null>>();
  const keyOf = (tenantId: string, productId: string) => `${tenantId}:${productId}`;

  function peek(tenantId: string, productId: string): ItemRating | undefined {
    const key = keyOf(tenantId, productId);
    const hit = cache.get(key);
    if (!hit) return undefined;
    if (now() - hit.at > ttlMs) {
      cache.delete(key);
      return undefined;
    }
    return hit.value;
  }

  function load(tenantId: string, productId: string): Promise<ItemRating | null> {
    const cached = peek(tenantId, productId);
    if (cached) return Promise.resolve(cached);
    const key = keyOf(tenantId, productId);
    const pending = inflight.get(key);
    if (pending) return pending;

    const request = fetchSummary(tenantId, productId)
      .then((summary): ItemRating => {
        const average = Number(summary.average);
        const count = Number(summary.count);
        const value: ItemRating =
          Number.isFinite(average) && Number.isFinite(count) && count > 0 ? { average, count } : { average: 0, count: 0 };
        cache.set(key, { at: now(), value });
        return value;
      })
      .catch((): null => null)
      .finally(() => {
        inflight.delete(key);
      });
    inflight.set(key, request);
    return request;
  }

  return { peek, load };
}
