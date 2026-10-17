import { Compass, Wallet, X } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { AnimatedGradientButton } from '../AnimatedGradientButton';
import { Tooltip } from '../Tooltip';
import { localizedField } from '../../i18n/contentText';
import { formatBRL, getPromotionHeroValue } from '../../lib/promotionPresentation';
import type { MinOrderProgress } from '../../lib/promotionEligibility';
import { MENU_BORDER, MENU_TEXT, MENU_TEXT_SOFT } from '../../lib/menuTheme';
import { PROMO_FOCUS, PROMO_SUCCESS_TEXT } from '../../lib/promotionTheme';
import type { Promotion } from '../../types';

interface PromotionModeBannerProps {
  promotion: Promotion;
  eligibleCount: number;
  // null = a promoção não tem pedido mínimo.
  minOrder: MinOrderProgress | null;
  // Desconto do carrinho atual com a promoção ATIVA (0 = nada a mostrar).
  savingAmount: number;
  isActive: boolean;
  canActivate: boolean;
  onActivate: () => void;
  onExit: () => void;
}

// Status do Modo Promoção. Um único elemento responsivo (sem duplicar DOM):
// - celular/tablet: faixa sticky no topo, compacta, de ponta a ponta;
// - desktop (lg+): cartão sticky na coluna lateral, sempre visível ao rolar.
// Só apresenta números que o motor (lib/promotionEligibility.ts) já calculou.
export function PromotionModeBanner({
  promotion,
  eligibleCount,
  minOrder,
  savingAmount,
  isActive,
  canActivate,
  onActivate,
  onExit,
}: PromotionModeBannerProps) {
  const { t } = useI18n();
  const hero = getPromotionHeroValue(promotion);
  const countLabel = t(eligibleCount === 1 ? 'promotionMode.eligibleOne' : 'promotionMode.eligibleMany', {
    count: eligibleCount,
  });

  return (
    <aside
      aria-label={t('promotionMode.badge')}
      className={`sticky top-0 md:top-16 z-30 border-b ${MENU_BORDER} bg-[#FFFFFF]/60 px-4 py-3 backdrop-blur-xl dark:bg-[#131314]/60 lg:top-24 lg:self-start lg:rounded-2xl lg:border lg:p-5`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--brand)] text-[#FFFFFF] dark:bg-[#E3E2E6] dark:text-[#131314]"
            aria-hidden="true"
          >
            <Compass size={16} strokeWidth={1.75} />
          </span>
          <span className={`truncate text-[11px] font-bold uppercase tracking-wider ${MENU_TEXT_SOFT}`}>
            {t('promotionMode.badge')}
          </span>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              isActive
                ? 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-300'
                : 'bg-[#F3F4F6] text-[#374151] dark:bg-white/10 dark:text-[#C4C7C5]'
            }`}
          >
            {isActive ? t('promotionMode.statusActive') : t('promotionMode.statusInactive')}
          </span>
        </div>
        <Tooltip label={t('promotionMode.exit')} className="inline-flex shrink-0">
          <button
            type="button"
            onClick={onExit}
            aria-label={t('promotionMode.exit')}
            className={`loc-dist [--glow:var(--accent)] inline-flex items-center gap-1.5 rounded-full border bg-transparent px-2.5 py-1 text-[12px] font-semibold backdrop-blur-md active:scale-95 ${MENU_BORDER} ${MENU_TEXT_SOFT} ${PROMO_FOCUS}`}
          >
            <X size={14} strokeWidth={1.5} aria-hidden="true" />
            <span>{t('promotionMode.exitShort')}</span>
          </button>
        </Tooltip>
      </div>

      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 lg:mt-4 lg:block">
        <p className={`min-w-0 truncate font-display text-base font-extrabold leading-tight lg:text-xl lg:whitespace-normal ${MENU_TEXT}`}>
          {localizedField(promotion, 'title')}
        </p>
        <p className={`text-sm font-semibold tabular-nums ${MENU_TEXT_SOFT} lg:mt-1`}>
          {hero.text} {t('promotionDetailPage.off')} · {countLabel}
        </p>
      </div>

      {minOrder && (
        <div className="mt-2.5 lg:mt-4">
          <div
            role="progressbar"
            aria-label={t('promotionMode.minOrderLabel')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={minOrder.percent}
            className="h-2 w-full overflow-hidden rounded-full bg-[#E5E7EB] dark:bg-white/10"
          >
            <div
              className={`h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none ${
                minOrder.reached ? 'bg-green-600 dark:bg-green-400' : 'bg-[var(--accent)]'
              }`}
              style={{ width: `${minOrder.percent}%` }}
            />
          </div>
          <p
            aria-live="polite"
            className={`mt-1.5 text-xs font-medium tabular-nums ${minOrder.reached ? PROMO_SUCCESS_TEXT : MENU_TEXT_SOFT}`}
          >
            {minOrder.reached
              ? t('promotionMode.minOrderReached', { minimum: formatBRL(minOrder.required) })
              : t('promotionMode.minOrderMissing', {
                  missing: formatBRL(minOrder.missing),
                  minimum: formatBRL(minOrder.required),
                })}
          </p>
        </div>
      )}

      {isActive && savingAmount > 0 && (
        <p
          className={`mt-2 flex items-center gap-1.5 text-xs font-semibold tabular-nums lg:mt-3 lg:text-sm ${PROMO_SUCCESS_TEXT}`}
        >
          <Wallet size={14} strokeWidth={1.75} aria-hidden="true" />
          {t('promotionMode.saving', { value: formatBRL(savingAmount) })}
        </p>
      )}

      {!isActive && canActivate && (
        <AnimatedGradientButton
          onClick={onActivate}
          className="mt-3 w-full rounded-xl"
          contentClassName="px-4 py-2.5 text-center text-sm font-bold"
        >
          {t('promotionMode.activate')}
        </AnimatedGradientButton>
      )}
    </aside>
  );
}
