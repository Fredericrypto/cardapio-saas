import type { CartItem } from '../types';

/** "R$ 12,34" — mesmo formato que o carrinho sempre usou (toFixed + vírgula). */
export function formatBRL(value: number): string {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

/** Preço unitário da linha: promoção (ou preço) + adicionais escolhidos. */
export function cartItemUnitPrice(item: CartItem): number {
  return (
    Number(item.product.promoPrice ?? item.product.price) +
    item.selectedOptions.reduce((sum, option) => sum + option.priceDelta, 0)
  );
}

/** "Bacon, Queijo" ou null quando a linha não tem adicionais. */
export function cartItemOptionsLabel(item: CartItem): string | null {
  return item.selectedOptions.length > 0 ? item.selectedOptions.map((o) => o.label).join(', ') : null;
}
