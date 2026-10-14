// Regras da galeria de fotos de um item do cardápio (até 5 fotos).
//
// MODELO (decisão de compatibilidade — ver docs/MULTIPLAS-FOTOS.md):
//  - `products.images` (text[]) é a fonte da verdade: lista ORDENADA de URLs.
//  - `products.image_url` continua existindo e é SEMPRE a capa = images[0].
//    Quem só conhece um campo de imagem (fallback de imagem da promoção,
//    avaliações, miniatura do carrinho, og:image do link compartilhado)
//    segue funcionando sem nenhuma mudança.
//
// Este arquivo é PURO de propósito (nada de Nest/TypeORM): as regras abaixo são
// testadas sem banco em test/product-images-pure-audit.ts.

export const MAX_PRODUCT_IMAGES = 5;

// Limpa uma lista vinda de fora: tira espaços, descarta vazios e repetidas
// (a primeira ocorrência vence, então a ordem escolhida pelo dono é mantida).
export function sanitizeImageList(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of raw) {
    const url = item.trim();
    if (url.length === 0 || seen.has(url)) continue;
    seen.add(url);
    result.push(url);
  }
  return result;
}

// Lista que o resto do sistema deve enxergar. Cobre dois casos de dado "antigo":
//  - produto criado antes da migration (a migration já preenche, mas é barato
//    garantir de novo);
//  - backup anterior à migration restaurado: `images` volta com o padrão `{}`
//    enquanto `image_url` volta preenchido.
// Nunca devolve mais que MAX_PRODUCT_IMAGES (defesa; o banco também barra).
export function resolveProductImages(
  images: readonly string[] | null | undefined,
  imageUrl: string | null | undefined,
): string[] {
  const list = sanitizeImageList(images ?? []);
  if (list.length === 0 && imageUrl && imageUrl.trim().length > 0) {
    return [imageUrl.trim()];
  }
  return list.slice(0, MAX_PRODUCT_IMAGES);
}

// Escrita no formato antigo (`imageUrl` sozinho = "troque a foto do item"):
// troca só a CAPA e preserva as demais fotos, na ordem. Capa vazia/nula remove
// a capa atual (a próxima foto, se existir, vira a capa).
export function replaceCover(current: readonly string[], newCover: string | null | undefined): string[] {
  const rest = current.slice(1);
  const cover = newCover?.trim() ?? '';
  if (cover.length === 0) return sanitizeImageList(rest);
  return sanitizeImageList([cover, ...rest]);
}

// Quantas fotos ainda cabem.
export function remainingSlots(currentCount: number): number {
  return Math.max(0, MAX_PRODUCT_IMAGES - currentCount);
}
