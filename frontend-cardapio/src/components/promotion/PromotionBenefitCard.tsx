import { CheckCircle2, Info, Tag, Wallet } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { promotionReasonLabel } from '../../i18n/labels';
import { formatBRL, getPromotionHeroValue } from '../../lib/promotionPresentation';
import { MENU_BORDER, MENU_TEXT, MENU_TEXT_SOFT } from '../../lib/menuTheme';
import { PROMO_LINK_BTN, PROMO_SUCCESS_TEXT } from '../../lib/promotionTheme';
import type { Promotion } from '../../types';
import type { PromotionEligibility } from '../../lib/promotionEligibility';

// Card de benefício: o GANHO em primeiro lugar, em vidro transparente (a luz
// ambiente aparece através) e com o ícone em bloco sólido nas cores do app.
// - Com itens elegíveis no carrinho: quanto a pessoa economiza agora (o mesmo
//   `eligibility.discountAmount` de sempre).
// - Sem eles: "Você economiza {valor}" + a quem vale (+ teto, se houver). A
//   restrição de elegibilidade é só uma nota pequena no rodapé do card.
export function PromotionBenefitCard({
  promotion,
  eligibility,
  isApplied,
  hasEligibleProducts,
  onSeeProducts,
}: {
  promotion: Promotion;
  eligibility: PromotionEligibility;
  isApplied: boolean;
  hasEligibleProducts: boolean;
  onSeeProducts: () => void;
}) {
  const { t } = useI18n();

  if (eligibility.isEligible) {
    return (
      <div className="rounded-2xl md:rounded-3xl border border-green-300/70 bg-green-500/10 backdrop-blur-md dark:border-green-400/20 p-5 md:p-6 flex items-center gap-4">
        <span
          className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-green-300/70 bg-transparent backdrop-blur-md dark:border-green-400/30 ${PROMO_SUCCESS_TEXT}`}
          aria-hidden="true"
        >
          <Wallet size={26} strokeWidth={1.5} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${PROMO_SUCCESS_TEXT}`}>{t('promotionDetailPage.voce_economiza')}</p>
          <p className={`font-display text-4xl md:text-5xl font-extrabold tabular-nums leading-tight ${PROMO_SUCCESS_TEXT}`}>
            R$ {formatBRL(eligibility.discountAmount)}
          </p>
          <p className={`text-sm ${PROMO_SUCCESS_TEXT} opacity-90`}>{t('promotionDetailPage.com_o_carrinho_atual')}</p>
        </div>
        {isApplied && (
          <span
            className={`hidden sm:inline-flex shrink-0 items-center gap-1.5 rounded-full border border-green-300 dark:border-green-400/30 px-3 py-1.5 text-xs font-semibold ${PROMO_SUCCESS_TEXT}`}
          >
            <CheckCircle2 size={14} strokeWidth={1.5} aria-hidden="true" />
            {t('promotionDetailPage.promocao_aplicada')}
          </span>
        )}
      </div>
    );
  }

  const hero = getPromotionHeroValue(promotion);
  const scopeText =
    promotion.scope === 'all'
      ? t('promotionDetailPage.em_todo_o_cardapio')
      : t('promotionDetailPage.nos_itens_selecionados');
  const canSuggestItems = eligibility.reasonCode === 'no_eligible_items' && hasEligibleProducts;

  return (
    <div className={`rounded-2xl md:rounded-3xl border bg-transparent backdrop-blur-md p-5 md:p-6 ${MENU_BORDER}`}>
      <div className="flex items-center gap-4">
        <span
          className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl border bg-transparent backdrop-blur-md ${MENU_BORDER} ${MENU_TEXT}`}
          aria-hidden="true"
        >
          <Tag size={26} strokeWidth={1.5} />
        </span>
        <div className="min-w-0">
          <p className={`font-display text-2xl md:text-3xl font-extrabold leading-tight ${MENU_TEXT}`}>
            {t('promotionDetailPage.voce_economiza_valor', { value: hero.text })}
          </p>
          <p className={`text-base font-medium ${MENU_TEXT_SOFT}`}>{scopeText}</p>
          {promotion.discountType === 'percentage' && promotion.maxDiscountAmount != null && (
            <p className={`text-sm ${MENU_TEXT_SOFT}`}>
              {t('promotionDetailPage.desconto_maximo_de_r', { v0: formatBRL(promotion.maxDiscountAmount) })}
            </p>
          )}
        </div>
      </div>
      <p className={`mt-4 text-sm ${MENU_TEXT_SOFT}`}>{t('promotionDetailPage.aplique_e_veja_o_desconto')}</p>

      {!eligibility.isEligible && eligibility.reason && (
        <div
          role="status"
          className={`mt-4 pt-4 border-t border-black/10 dark:border-white/10 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] ${MENU_TEXT_SOFT}`}
        >
          <Info size={15} strokeWidth={1.5} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{promotionReasonLabel(eligibility, t)}</span>
          {canSuggestItems && (
            <button type="button" onClick={onSeeProducts} className={`${PROMO_LINK_BTN} ${MENU_TEXT}`}>
              {t('promotionDetailPage.ver_itens_elegiveis')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
