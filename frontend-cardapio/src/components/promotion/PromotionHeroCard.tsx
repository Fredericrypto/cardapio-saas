import { useI18n } from '../../i18n/I18nContext';
import { getPromotionHeroValue, withAlpha } from '../../lib/promotionPresentation';
import { MENU_SURFACE, MENU_TEXT, MENU_TEXT_SOFT } from '../../lib/menuTheme';
import type { Promotion } from '../../types';

// Placa do desconto: o maior elemento da página, sobreposta à borda do banner
// (quem posiciona é a página) para banner e desconto lerem como UMA peça.
// Só exibe valores que a promoção já tem; não calcula nada.
export function PromotionHeroCard({
  promotion,
  primaryColor,
  accent,
  ariaLabel,
  muted = false,
  className = '',
}: {
  promotion: Promotion;
  primaryColor: string;
  accent: string;
  ariaLabel: string;
  muted?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const hero = getPromotionHeroValue(promotion);
  const subtitle =
    promotion.scope === 'all'
      ? t('promotionDetailPage.em_todo_o_cardapio')
      : t('promotionDetailPage.nos_itens_selecionados');
  // Valores em reais ("R$ 10,50") têm mais caracteres que "70%": fonte menor
  // para nunca estourar a largura no celular.
  const numberSize =
    hero.kind === 'percentage' ? 'text-7xl md:text-8xl' : 'text-5xl md:text-7xl';

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`relative w-max max-w-full overflow-hidden rounded-2xl md:rounded-3xl border-2 py-4 pl-6 pr-5 md:py-5 md:pl-8 md:pr-7 ${MENU_SURFACE} ${muted ? 'opacity-80' : ''} ${className}`}
      style={{
        borderColor: withAlpha(primaryColor, 0.55),
        backgroundImage: `linear-gradient(135deg, ${withAlpha(primaryColor, 0.22)}, ${withAlpha(primaryColor, 0.06)} 60%, transparent)`,
        boxShadow: `0 24px 48px -16px ${withAlpha(primaryColor, 0.55)}, 0 8px 24px rgba(0, 0, 0, 0.25)`,
      }}
    >
      <div aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: primaryColor }} />
      <div className="relative flex flex-wrap items-end gap-x-2.5">
        <span className={`font-display font-extrabold leading-[0.9] tracking-tight tabular-nums ${numberSize} ${MENU_TEXT}`}>
          {hero.text}
        </span>
        <span
          className="pb-1 md:pb-2 font-display font-extrabold text-2xl md:text-3xl tracking-wide"
          style={{ color: accent }}
        >
          {t('promotionDetailPage.off')}
        </span>
      </div>
      <p className={`relative mt-2 text-sm md:text-base font-semibold ${MENU_TEXT_SOFT}`}>{subtitle}</p>
    </div>
  );
}
