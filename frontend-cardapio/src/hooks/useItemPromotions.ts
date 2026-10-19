import { useMemo } from 'react';
import { useCart } from '../contexts/CartContext';
import { pickItemPromotion, type ItemPromotionPreview } from '../lib/promotionEligibility';
import type { Product, Promotion } from '../types';

// Preço promocional também FORA do Modo Promoção: só para promoções que o
// cliente ativou (selectedPromotionIds), na ordem da seleção — a mesma em que o
// carrinho as aplica. Item sem promoção ativa e elegível: sem entrada no mapa.
// Fonte ÚNICA usada pelo cardápio e pela subpágina de categoria, para o mesmo
// produto nunca mostrar preços diferentes entre as telas.
export function useItemPromotions(
  promotions: Promotion[],
  products: Product[],
): Map<string, ItemPromotionPreview> {
  const { selectedPromotionIds } = useCart();
  return useMemo(() => {
    const map = new Map<string, ItemPromotionPreview>();
    const selected = selectedPromotionIds
      .map((id) => promotions.find((p) => p.id === id))
      .filter((p): p is Promotion => p != null);
    if (selected.length === 0) return map;
    for (const product of products) {
      const applied = pickItemPromotion(selected, product);
      if (applied) map.set(product.id, applied.preview);
    }
    return map;
  }, [selectedPromotionIds, promotions, products]);
}
