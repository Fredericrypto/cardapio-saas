import { useEffect } from 'react';
import { useCart } from '../contexts/CartContext';

// P-01: cada tela que conhece a unidade ativa publica o CONTEXTO das promoções:
// { scope: 'mesa' | 'geral', locationId }. O contexto vem só do fluxo (mesa ou
// geral) e da unidade; NUNCA do token do QR da mesa. Mesma loja: mesa != geral.
//
// Quando o contexto publicado muda (troca de unidade, mesa <-> geral), o
// CartContext descarta as promoções ativas da memória e mantém as lembradas
// (só sugestão no Carrinho). Mesmo contexto publicado de novo por outra tela:
// nada acontece. Sem unidade resolvida (carregando) não publica nada, para uma
// tela que ainda está montando nunca ser lida como "troca de contexto".
export function useCartPromotionContext(isTableFlow: boolean, locationId: string | null | undefined): void {
  const { setPromoContext } = useCart();
  useEffect(() => {
    if (!locationId) return;
    setPromoContext({ scope: isTableFlow ? 'mesa' : 'geral', locationId });
  }, [isTableFlow, locationId, setPromoContext]);
}
