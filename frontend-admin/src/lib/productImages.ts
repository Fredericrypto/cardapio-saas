import type { Product } from '../types';

// Galeria de fotos do item (até 5; a primeira é a CAPA mostrada no cardápio).
// O backend devolve `images` ordenada e mantém `imageUrl` = capa. Produto que só
// tem `imageUrl` (dado antigo) conta como galeria de 1 foto.
export const MAX_PRODUCT_IMAGES = 5;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // mesmo limite do servidor
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export function getProductImages(product: Pick<Product, 'images' | 'imageUrl'>): string[] {
  const list = (product.images ?? []).map((u) => u.trim()).filter((u) => u.length > 0);
  const unique = list.filter((u, i) => list.indexOf(u) === i);
  if (unique.length === 0) {
    const cover = product.imageUrl?.trim();
    return cover ? [cover] : [];
  }
  return unique.slice(0, MAX_PRODUCT_IMAGES);
}

// Move o item de `from` para `to` (arrastar/setas). Índices fora da lista não mudam nada.
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const copy = [...list];
  if (from === to || from < 0 || to < 0 || from >= copy.length || to >= copy.length) return copy;
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

export function removeAt<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}

// Conferência no navegador ANTES de enviar (o servidor confere de novo, pelo
// conteúdo real do arquivo). Devolve a mensagem do problema ou null se está ok.
export function validateImageFile(file: Pick<File, 'type' | 'size'>): string | null {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return 'formato inválido (use JPG, PNG ou WebP)';
  }
  if (file.size > MAX_IMAGE_BYTES) return 'passa de 5 MB';
  return null;
}

// Quantas fotos novas cabem e quantas sobrariam: base do aviso de limite.
export function planAddition(currentCount: number, incomingCount: number): { accepted: number; ignored: number } {
  const room = Math.max(0, MAX_PRODUCT_IMAGES - currentCount);
  const accepted = Math.min(room, incomingCount);
  return { accepted, ignored: incomingCount - accepted };
}
