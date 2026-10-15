import { useI18n } from '../i18n/I18nContext';
import { useCart } from '../contexts/CartContext';
import type { CSSProperties } from 'react';
import { ArrowRight, ShoppingBag } from 'lucide-react';
import { Tooltip } from './Tooltip';
import { AnimatedGradientButton } from './AnimatedGradientButton';

interface CartBarProps {
  primaryColor: string;
  onClick: () => void;
}

// Celular: faixa acima da barra de navegação inferior. Desktop (md+): a barra
// inferior some, então o carrinho vira um cartão flutuante no canto inferior
// direito, com largura fixa — nunca de ponta a ponta.
//
// Desenho: ícone da sacola num disco translúcido, quantidade de itens em
// legenda e o total em destaque logo abaixo, seta no disco da direita. O anel
// fino (preto no claro, branco no escuro) separa o cartão do fundo mesmo
// quando a cor principal do restaurante é escura como a do tema escuro.
export function CartBar({ primaryColor, onClick }: CartBarProps) {
  const { t } = useI18n();
  const { totalItems, totalPrice } = useCart();

  if (totalItems === 0) return null;

  // "3 items in your cart" / "1 item in your cart": um texto completo por
  // idioma (singular e plural em chaves próprias) em vez de montar "N itens" +
  // "no carrinho" em português por dentro do componente.
  const itemsLabel = t(totalItems === 1 ? 'cartBar.itemOne' : 'cartBar.itemMany', { count: totalItems });

  return (
    // `contents`: o botão é `fixed`; o invólucro não pode ganhar caixa própria.
    <Tooltip label={t('tooltip.viewCart')} className="contents">
      <AnimatedGradientButton
        onClick={onClick}
        aria-label={`${itemsLabel} · ${t('tooltip.viewCart')}`}
        className="fixed bottom-20 left-4 right-4 max-w-md mx-auto md:bottom-8 md:left-auto md:right-8 md:mx-0 md:w-[22rem] md:max-w-none rounded-2xl shadow-[0_10px_28px_rgba(0,0,0,0.22)] z-50"
        fillClassName="bg-[var(--brand)] text-white"
        contentClassName="flex items-center gap-3 pl-3 pr-3.5 py-3 text-left"
        style={{ '--brand': primaryColor, transform: 'translateZ(0)' } as CSSProperties}
      >
        <span className="shrink-0 w-10 h-10 rounded-full bg-white/15 flex items-center justify-center">
          <ShoppingBag size={18} strokeWidth={1.5} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[11px] leading-tight text-white/80 truncate">{itemsLabel}</span>
          <span className="block text-base font-bold leading-tight mt-0.5">
            R$ {totalPrice.toFixed(2).replace('.', ',')}
          </span>
        </span>
        <span className="shrink-0 w-8 h-8 rounded-full bg-white/15 flex items-center justify-center">
          <ArrowRight size={16} strokeWidth={2} />
        </span>
      </AnimatedGradientButton>
    </Tooltip>
  );
}
