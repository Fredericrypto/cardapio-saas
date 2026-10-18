import { CheckCircle2, Info } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { promotionReasonLabel } from '../../i18n/labels';
import { formatBRL, getPromotionHeroValue } from '../../lib/promotionPresentation';
import { PROMO_INK, PROMO_LINK_BTN, PROMO_MUTED, PROMO_SAGE, PROMO_SERIF } from '../../lib/promotionTheme';
import type { Promotion } from '../../types';
import type { PromotionEligibility } from '../../lib/promotionEligibility';

// Bloco do ganho, SEM caixa (faz parte da composição da coluna):
// - Com itens elegíveis no carrinho: quanto a pessoa economiza agora (o mesmo
//   `eligibility.discountAmount` de sempre), em verde sálvia e serifa.
// - Sem eles: "Você economiza {valor}" + a quem vale (+ teto, se houver). A
//   restrição de elegibilidade é uma nota pequena abaixo.
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
      <div className="flex flex-col gap-1.5">
        <p className={`text-sm ${PROMO_MUTED}`}>{t('promotionDetailPage.voce_economiza')}</p>
        <p
          className={`text-5xl font-semibold leading-none tabular-nums md:text-[3.25rem] ${PROMO_SAGE}`}
          style={{ fontFamily: PROMO_SERIF }}
        >
          R$ {formatBRL(eligibility.discountAmount)}
        </p>
        <p className={`text-sm ${PROMO_INK}`}>{t('promotionDetailPage.com_o_carrinho_atual')}</p>
        {isApplied && (
          <p className={`mt-1 inline-flex items-center gap-1.5 text-xs font-medium ${PROMO_SAGE}`}>
            <CheckCircle2 size={14} strokeWidth={1.5} aria-hidden="true" />
            {t('promotionDetailPage.promocao_aplicada')}
          </p>
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
    <div className="flex flex-col gap-1.5">
      <p className={`text-4xl font-semibold leading-tight md:text-[2.5rem] ${PROMO_SAGE}`} style={{ fontFamily: PROMO_SERIF }}>
        {t('promotionDetailPage.voce_economiza_valor', { value: hero.text })}
      </p>
      <p className={`text-sm ${PROMO_INK}`}>{scopeText}</p>
      {promotion.discountType === 'percentage' && promotion.maxDiscountAmount != null && (
        <p className={`text-sm ${PROMO_MUTED}`}>
          {t('promotionDetailPage.desconto_maximo_de_r', { v0: formatBRL(promotion.maxDiscountAmount) })}
        </p>
      )}
      <p className={`mt-1 text-sm ${PROMO_MUTED}`}>{t('promotionDetailPage.aplique_e_veja_o_desconto')}</p>

      {eligibility.reason && (
        <div role="status" className={`mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] ${PROMO_MUTED}`}>
          <Info size={15} strokeWidth={1.5} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{promotionReasonLabel(eligibility, t)}</span>
          {canSuggestItems && (
            <button type="button" onClick={onSeeProducts} className={`${PROMO_LINK_BTN} ${PROMO_INK}`}>
              {t('promotionDetailPage.ver_itens_elegiveis')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
