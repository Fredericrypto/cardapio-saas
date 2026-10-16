import { Minus, Plus } from 'lucide-react';
import { Tooltip } from '../Tooltip';
import { MENU_TEXT } from '../../lib/menuTheme';
import { PROMO_FOCUS } from '../../lib/promotionTheme';

interface PromotionQuantityStepperProps {
  value: number;
  onDecrease: () => void;
  onIncrease: () => void;
  // 'compact' = sobre o card da grade; 'regular' = rodapé do painel do item.
  size: 'compact' | 'regular';
  groupLabel: string;
  increaseLabel: string;
  decreaseLabel: string;
  // Rótulo do "−" quando o valor é 1 (a ação passa a REMOVER o item).
  removeLabel?: string;
  disableDecrease?: boolean;
  disableIncrease?: boolean;
  className?: string;
}

// Visual idêntico ao que o painel já tinha (variant 'regular'); o 'compact'
// usa a mesma linguagem em 32px de altura para caber no canto do card.
const REGULAR_CONTAINER =
  'inline-flex shrink-0 items-center gap-1 rounded-full border border-[#E5E7EB] bg-[#F3F4F6] p-1 dark:border-white/10 dark:bg-[#1E1E20]';
const REGULAR_BUTTON =
  'w-9 h-9 rounded-full bg-[#FFFFFF] dark:bg-[#3A3C3E] text-[#374151] dark:text-[#E3E2E6] ' +
  'flex items-center justify-center shadow-sm border border-[#E5E7EB] dark:border-white/10 ' +
  'hover:bg-[#F9FAFB] dark:hover:bg-[#46484A] disabled:opacity-40 disabled:cursor-not-allowed transition';

const COMPACT_CONTAINER =
  'inline-flex h-8 items-center rounded-full border border-[#E5E7EB] bg-[#FFFFFF] p-0.5 shadow-md dark:border-white/10 dark:bg-[#282A2C]';
const COMPACT_MINUS =
  'flex h-7 w-7 items-center justify-center rounded-full text-[#374151] transition hover:bg-black/[0.05] ' +
  'dark:text-[#E3E2E6] dark:hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40';
const COMPACT_PLUS =
  'flex h-7 w-7 items-center justify-center rounded-full bg-[var(--brand)] text-[#FFFFFF] transition ' +
  'hover:brightness-110 dark:bg-[#E3E2E6] dark:text-[#131314] dark:hover:brightness-95 ' +
  'disabled:cursor-not-allowed disabled:opacity-40';

// Seletor [ − ] [ qtd ] [ + ]. Só apresenta: a quantidade vem do chamador (o
// carrinho, quando o item já está nele) e as ações são callbacks dele.
export function PromotionQuantityStepper({
  value,
  onDecrease,
  onIncrease,
  size,
  groupLabel,
  increaseLabel,
  decreaseLabel,
  removeLabel,
  disableDecrease = false,
  disableIncrease = false,
  className = '',
}: PromotionQuantityStepperProps) {
  const compact = size === 'compact';
  const minusLabel = value <= 1 && removeLabel ? removeLabel : decreaseLabel;
  const iconSize = compact ? 14 : 16;

  return (
    <div role="group" aria-label={groupLabel} className={`${compact ? COMPACT_CONTAINER : REGULAR_CONTAINER} ${className}`}>
      <Tooltip label={minusLabel}>
        <button
          type="button"
          onClick={onDecrease}
          disabled={disableDecrease}
          aria-label={minusLabel}
          className={`${compact ? COMPACT_MINUS : REGULAR_BUTTON} ${PROMO_FOCUS}`}
        >
          <Minus size={iconSize} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </Tooltip>
      <span
        className={`${compact ? 'w-5 text-xs font-bold' : 'w-7 font-semibold'} text-center tabular-nums ${MENU_TEXT}`}
        aria-live="polite"
      >
        {value}
      </span>
      <Tooltip label={increaseLabel}>
        <button
          type="button"
          onClick={onIncrease}
          disabled={disableIncrease}
          aria-label={increaseLabel}
          className={`${compact ? COMPACT_PLUS : REGULAR_BUTTON} ${PROMO_FOCUS}`}
        >
          <Plus size={iconSize} strokeWidth={compact ? 2.25 : 1.5} aria-hidden="true" />
        </button>
      </Tooltip>
    </div>
  );
}
