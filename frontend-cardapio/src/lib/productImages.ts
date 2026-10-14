import type { Product } from '../types';

// Galeria de fotos do item (até 5). O backend manda `images` (ordenada; a
// primeira é a capa) e mantém `imageUrl` = capa. Itens em cache antigo (carrinho
// salvo no aparelho) ou respostas de um backend ainda sem a galeria só têm
// `imageUrl` — nesse caso a galeria é essa foto única.
export const MAX_PRODUCT_IMAGES = 5;

export function getProductImages(product: Pick<Product, 'images' | 'imageUrl'>): string[] {
  const list = (product.images ?? []).map((u) => u.trim()).filter((u) => u.length > 0);
  const unique = list.filter((u, i) => list.indexOf(u) === i);
  if (unique.length === 0) {
    const cover = product.imageUrl?.trim();
    return cover ? [cover] : [];
  }
  return unique.slice(0, MAX_PRODUCT_IMAGES);
}

// Próxima/anterior com volta ao início/fim (loop infinito).
export function wrapIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return ((index % count) + count) % count;
}

// Gesto de arrastar: só conta se for claramente horizontal e longo o bastante.
// Devolve 1 (próxima foto), -1 (anterior) ou 0 (ignorar — era rolagem/toque).
export function swipeDirection(dx: number, dy: number, minDistance = 40): 1 | -1 | 0 {
  if (Math.abs(dx) < minDistance) return 0;
  if (Math.abs(dx) < Math.abs(dy) * 1.2) return 0;
  return dx < 0 ? 1 : -1;
}
