import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Tooltip } from './Tooltip';
import { MENU_TEXT_MUTED, MENU_TEXT_SOFT } from '../lib/menuTheme';
import { PROMO_FOCUS, PROMO_INK, PROMO_SERIF } from '../lib/promotionTheme';

// Título de seção editorial do cardápio (Promoções e cada categoria): ícone +
// título serifado (clicável: recolhe/expande a seção) + filete que se dissolve
// + ação opcional "Ver todos" à direita. O filete é o mesmo recurso da borda
// recuada da navbar: gradiente que some, sem linha cheia.
export function SectionHeading({
  icon,
  title,
  expanded,
  onToggle,
  toggleLabel,
  action,
}: {
  icon?: ReactNode;
  title: string;
  expanded: boolean;
  onToggle: () => void;
  /** aria-label do botão de recolher; sem ele vale o próprio título. */
  toggleLabel?: string;
  action?: { to: string; label: string; aria: string };
}) {
  return (
    <div className="relative z-[1] flex w-full items-center gap-3 px-4 pb-1.5 pt-4 md:px-0 md:pt-6">
      <h2 className="m-0 shrink-0">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={toggleLabel}
          className={`flex items-center gap-2 rounded-lg py-1 ${PROMO_INK} ${PROMO_FOCUS}`}
        >
          {icon ? (
            <span aria-hidden="true" className={MENU_TEXT_SOFT}>
              {icon}
            </span>
          ) : null}
          <span className="text-[1.35rem] font-normal leading-none" style={{ fontFamily: PROMO_SERIF }}>
            {title}
          </span>
          <ChevronDown
            size={15}
            strokeWidth={1.5}
            aria-hidden="true"
            className={`transition-transform ${MENU_TEXT_MUTED} ${expanded ? '' : '-rotate-90'}`}
          />
        </button>
      </h2>
      <span
        aria-hidden="true"
        className="h-px min-w-6 flex-1 bg-gradient-to-r from-black/15 via-black/[0.06] to-transparent dark:from-white/20 dark:via-white/[0.07]"
      />
      {action ? (
        <Tooltip label={action.aria} className="inline-flex shrink-0">
          <Link
            to={action.to}
            aria-label={action.aria}
            className={`inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[13px] font-medium transition-colors hover:text-[#111827] dark:hover:text-[#EDE6D6] ${MENU_TEXT_MUTED} ${PROMO_FOCUS}`}
          >
            {action.label}
            <ChevronRight size={14} strokeWidth={1.5} aria-hidden="true" />
          </Link>
        </Tooltip>
      ) : null}
    </div>
  );
}
