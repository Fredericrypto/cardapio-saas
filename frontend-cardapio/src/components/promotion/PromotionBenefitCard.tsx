import { CheckCircle2, Info, PiggyBank, Wallet } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { promotionReasonLabel } from '../../i18n/labels';
import { formatBRL, withAlpha } from '../../lib/promotionPresentation';
import { MENU_SURFACE_SUBTLE, MENU_BORDER, MENU_TEXT, MENU_TEXT_BODY, MENU_TEXT_SOFT } from '../../lib/menuTheme';
import { PROMO_CARD, PROMO_LINK_BTN, PROMO_SUCCESS_CARD, PROMO_SUCCESS_TEXT } from '../../lib/promotionTheme';
import type { PromotionEligibility } from '../../lib/promotionEligibility';

// Card de benefício: mostra o GANHO. Com itens elegíveis no carrinho, o valor
// que a pessoa economiza agora (o mesmo `eligibility.discountAmount` de antes);
// sem eles, a proposta de valor da promoção. A restrição fica em outro bloco
// (PromotionEligibilityNote), depois do benefício.
export function PromotionBenefitCard({
  eligibility,
  isApplied,
  primaryColor,
  accent,
}: {
  eligibility: PromotionEligibility;
  isApplied: boolean;
  primaryColor: string;
  accent: string;
}) {
  const { t } = useI18n();

  if (eligibility.isEligible) {
    return (
      <div className={`${PROMO_SUCCESS_CARD} p-4 md:p-5 flex items-center gap-4`}>
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-green-100 dark:bg-green-500/15"
          aria-hidden="true"
        >
          <Wallet size={20} strokeWidth={1.5} className={PROMO_SUCCESS_TEXT} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-semibold ${PROMO_SUCCESS_TEXT}`}>{t('promotionDetailPage.voce_economiza')}</p>
          <p className={`font-display text-3xl font-extrabold tabular-nums leading-tight ${PROMO_SUCCESS_TEXT}`}>
            R$ {formatBRL(eligibility.discountAmount)}
          </p>
          <p className={`text-xs ${PROMO_SUCCESS_TEXT} opacity-90`}>{t('promotionDetailPage.com_o_carrinho_atual')}</p>
        </div>
        {isApplied && (
          <span
            className={`hidden sm:inline-flex shrink-0 items-center gap-1.5 rounded-full border border-green-200 dark:border-green-400/30 px-3 py-1.5 text-xs font-semibold ${PROMO_SUCCESS_TEXT}`}
          >
            <CheckCircle2 size={14} strokeWidth={1.5} aria-hidden="true" />
            {t('promotionDetailPage.promocao_aplicada')}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`${PROMO_CARD} p-4 md:p-5 flex items-center gap-4`}>
      <span
        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
        style={{ backgroundColor: withAlpha(primaryColor, 0.12), color: accent }}
        aria-hidden="true"
      >
        <PiggyBank size={20} strokeWidth={1.5} />
      </span>
      <div className="min-w-0">
        <p className={`text-base font-semibold leading-snug ${MENU_TEXT}`}>
          {t('promotionDetailPage.economize_nos_itens_elegiveis')}
        </p>
        <p className={`mt-0.5 text-sm ${MENU_TEXT_BODY}`}>{t('promotionDetailPage.aplique_e_veja_o_desconto')}</p>
      </div>
    </div>
  );
}

// Restrição de elegibilidade, deliberadamente discreta: vem DEPOIS do benefício
// e usa o texto que a regra já devolve (promotionReasonLabel). Se o motivo é
// "nenhum item elegível" e há itens para mostrar, oferece levar até eles.
export function PromotionEligibilityNote({
  eligibility,
  hasEligibleProducts,
  accent,
  onSeeProducts,
}: {
  eligibility: PromotionEligibility;
  hasEligibleProducts: boolean;
  accent: string;
  onSeeProducts: () => void;
}) {
  const { t } = useI18n();
  if (eligibility.isEligible || !eligibility.reason) return null;
  const canSuggestItems = eligibility.reasonCode === 'no_eligible_items' && hasEligibleProducts;

  return (
    <div
      role="status"
      className={`rounded-xl border ${MENU_BORDER} ${MENU_SURFACE_SUBTLE} px-3.5 py-3 flex flex-wrap items-center gap-x-2 gap-y-1`}
    >
      <Info size={15} strokeWidth={1.5} className={`${MENU_TEXT_BODY} shrink-0`} aria-hidden="true" />
      <p className={`text-[13px] leading-snug ${MENU_TEXT_SOFT} min-w-0 flex-1`}>
        {promotionReasonLabel(eligibility, t)}
      </p>
      {canSuggestItems && (
        <button type="button" onClick={onSeeProducts} className={PROMO_LINK_BTN} style={{ color: accent }}>
          {t('promotionDetailPage.ver_itens_elegiveis')}
        </button>
      )}
    </div>
  );
}
