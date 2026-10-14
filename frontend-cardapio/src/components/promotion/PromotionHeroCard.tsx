import { useI18n } from '../../i18n/I18nContext';
import { getPromotionHeroValue, withAlpha } from '../../lib/promotionPresentation';
import { MENU_SURFACE, MENU_TEXT, MENU_TEXT_SOFT } from '../../lib/menuTheme';
import type { Promotion } from '../../types';

// O desconto como protagonista: número grande + "OFF" + a quem se aplica.
// Só exibe valores que a promoção já tem; não calcula nada.
export function PromotionHeroCard({
  promotion,
  primaryColor,
  accent,
  ariaLabel,
  muted = false,
}: {
  promotion: Promotion;
  primaryColor: string;
  accent: string;
  ariaLabel: string;
  muted?: boolean;
}) {
  const { t } = useI18n();
  const hero = getPromotionHeroValue(promotion);
  const subtitle =
    promotion.scope === 'all'
      ? t('promotionDetailPage.em_todo_o_cardapio')
      : t('promotionDetailPage.nos_itens_selecionados');

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`relative overflow-hidden rounded-3xl border px-5 py-6 md:px-7 md:py-8 ${MENU_SURFACE} ${muted ? 'opacity-70' : ''}`}
      style={{
        borderColor: withAlpha(primaryColor, 0.35),
        backgroundImage: `linear-gradient(135deg, ${withAlpha(primaryColor, 0.16)}, ${withAlpha(primaryColor, 0.04)} 55%, transparent)`,
      }}
    >
      <div
        aria-hidden="true"
        className="absolute -right-16 -top-16 h-56 w-56"
        style={{ background: `radial-gradient(closest-side, ${withAlpha(primaryColor, 0.28)}, transparent)` }}
      />
      <div className="relative flex items-end gap-2.5">
        <span
          className={`font-display font-extrabold leading-[0.9] tracking-tight tabular-nums text-6xl md:text-7xl ${MENU_TEXT}`}
        >
          {hero.text}
        </span>
        <span
          className="pb-1 md:pb-1.5 font-display font-extrabold text-xl md:text-2xl tracking-wide"
          style={{ color: accent }}
        >
          {t('promotionDetailPage.off')}
        </span>
      </div>
      <p className={`relative mt-3 text-sm md:text-base font-medium ${MENU_TEXT_SOFT}`}>{subtitle}</p>
    </div>
  );
}
