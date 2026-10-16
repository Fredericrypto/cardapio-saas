// Linhas do carrinho: lógica PURA (sem React) compartilhada pelo CartContext e
// pelo Modo Promoção. Uma linha = produto + combinação de adicionais; o mesmo
// produto com customizações diferentes são linhas separadas.
import type { CartItem, SelectedCartOption } from '../types';

// Chave que identifica uma linha do carrinho de forma única — o mesmo
// produto com customizações DIFERENTES (ex: 'sem cebola' vs 'com bacon')
// são linhas separadas, nunca somadas na mesma quantidade. Ids de opção
// ordenados pra 'bacon + queijo' e 'queijo + bacon' caírem na mesma
// linha (mesma escolha, ordem diferente). É a ÚNICA fonte dessa chave:
// CartContext (addItem) e as telas leem daqui.
export function buildLineKey(productId: string, selectedOptions: readonly SelectedCartOption[]): string {
  const sortedIds = selectedOptions.map((o) => o.valueId).sort().join(',');
  return `${productId}::${sortedIds}`;
}

/** Linha exata do carrinho (null se não existe — ex.: acabou de ser removida). */
export function findCartLine(items: readonly CartItem[], lineKey: string): CartItem | null {
  return items.find((item) => item.lineKey === lineKey) ?? null;
}

/** Quantidade de cada produto no carrinho, somando todas as suas linhas. */
export function buildProductQuantityMap(items: readonly CartItem[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) map.set(item.product.id, (map.get(item.product.id) ?? 0) + item.quantity);
  return map;
}

/**
 * Linha que o seletor compacto de um card controla: a linha SEM adicionais (a
 * que o '+' rápido cria) se existir; senão a última linha do produto no
 * carrinho. Determinística, então '+' e '−' sempre agem na mesma linha.
 */
export function findProductCartLine(items: readonly CartItem[], productId: string): CartItem | null {
  const plainKey = buildLineKey(productId, []);
  let last: CartItem | null = null;
  for (const item of items) {
    if (item.product.id !== productId) continue;
    if (item.lineKey === plainKey) return item;
    last = item;
  }
  return last;
}
