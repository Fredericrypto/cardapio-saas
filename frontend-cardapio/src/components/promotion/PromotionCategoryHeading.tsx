import type { ReactNode } from 'react';
import { MENU_TEXT_SOFT } from '../../lib/menuTheme';
import { PROMO_INK, PROMO_SERIF } from '../../lib/promotionTheme';

// Título de categoria do Modo Promoção: ícone + serifado + filete que se dissolve
// (mesmo recurso do SectionHeading do cardápio, sem o recolher/"Ver todos").
export function PromotionCategoryHeading({ id, icon, title }: { id: string; icon?: ReactNode; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <h3 id={id} className={`m-0 flex shrink-0 items-center gap-2 ${PROMO_INK}`}>
        {icon ? (
          <span aria-hidden="true" className={MENU_TEXT_SOFT}>
            {icon}
          </span>
        ) : null}
        <span className="text-[1.3rem] font-normal leading-none" style={{ fontFamily: PROMO_SERIF }}>
          {title}
        </span>
      </h3>
      <span
        aria-hidden="true"
        className="h-px min-w-6 flex-1 bg-gradient-to-r from-black/15 via-black/[0.06] to-transparent dark:from-white/20 dark:via-white/[0.07]"
      />
    </div>
  );
}
