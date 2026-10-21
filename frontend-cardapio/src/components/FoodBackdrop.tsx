import { memo } from 'react';
import './food-backdrop.css';

// Fundo da página: só a cor chapada do tema (claro = fundo da página; escuro = #101010).
// Sem ícones e sem fumaça. Mantido como componente para todas as páginas que já o usam.
function FoodBackdropBase() {
  return <div aria-hidden="true" className="fb-layer" />;
}

export const FoodBackdrop = memo(FoodBackdropBase);
