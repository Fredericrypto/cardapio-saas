import { CheckCircle2, Info, Tag, Wallet } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { promotionReasonLabel } from '../../i18n/labels';
import { formatBRL, getPromotionHeroValue, withAlpha } from '../../lib/promotionPresentation';
import { MENU_SURFACE, MENU_DIVIDER, MENU_TEXT, MENU_TEXT_BODY, MENU_TEXT_SOFT } from '../../lib/menuTheme';
import { PROMO_LINK_BTN, PROMO_SUCCESS_CARD, PROMO_SUCCESS_TEXT } from '../../lib/promotionTheme';
import type { Promotion } from '../../types';
import type { PromotionEligibility } from '../../lib/promotionEligibility';

// Card de benefício: o GANHO em primeiro lugar.
// - Com itens elegíveis no carrinho: quanto a pessoa economiza agora (o mesmo
//   `eligibility.discountAmount` de sempre).
// - Sem eles: "Você economiza 70%" + a quem vale. A restrição de elegibilidade
//   NÃO é mais um bloco próprio: vira uma nota pequena no rodapé do card, para
//   o benefício receber mais atenção que a limitação.
export function PromotionBenefitCard({
  promotion,
  eligibility,
  isApplied,
  primaryColor,
  accent,
  hasEligibleProducts,
  onSeeProducts,
}: {
  promotion: Promotion;
  eligibility: PromotionEligibility;
  isApplied: boolean;
  primaryColor: string;
  accent: string;
  hasEligibleProducts: boolean;
  onSeeProducts: () => void;
}) {
  const { t } = useI18n();

  if (eligibility.isEligible) {
    return (
      <div className={`${PROMO_SUCCESS_CARD} p-4 md:p-5 flex items-center gap-4`}>
        <span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-green-100 dark:bg-green-500/15"
          aria-hidden="true"
        >
          <Wallet size={22} strokeWidth={1.5} className={PROMO_SUCCESS_TEXT} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-semibold ${PROMO_SUCCESS_TEXT}`}>{t('promotionDetailPage.voce_economiza')}</p>
          <p className={`font-display text-3xl md:text-4xl font-extrabold tabular-nums leading-tight ${PROMO_SUCCESS_TEXT}`}>
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

  const hero = getPromotionHeroValue(promotion);
  const scopeText =
    promotion.scope === 'all'
      ? t('promotionDetailPage.em_todo_o_cardapio')
      : t('promotionDetailPage.nos_itens_selecionados');
  const canSuggestItems = eligibility.reasonCode === 'no_eligible_items' && hasEligibleProducts;

  return (
    <div
      className={`rounded-2xl border p-4 md:p-5 ${MENU_SURFACE}`}
      style={{
        borderColor: withAlpha(primaryColor, 0.3),
        backgroundImage: `linear-gradient(135deg, ${withAlpha(primaryColor, 0.1)}, transparent 70%)`,
      }}
    >
      <div className="flex items-center gap-4">
        <span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-xl"
          style={{ backgroundColor: withAlpha(primaryColor, 0.14), color: accent }}
          aria-hidden="true"
        >
          <Tag size={22} strokeWidth={1.5} />
        </span>
        <div className="min-w-0">
          <p className={`font-display text-xl md:text-2xl font-extrabold leading-tight ${MENU_TEXT}`}>
            {t('promotionDetailPage.voce_economiza_valor', { value: hero.text })}
          </p>
          <p className={`text-sm md:text-base font-medium ${MENU_TEXT_SOFT}`}>{scopeText}</p>
        </div>
      </div>
      <p className={`mt-3 text-[13px] ${MENU_TEXT_BODY}`}>{t('promotionDetailPage.aplique_e_veja_o_desconto')}</p>

      {!eligibility.isEligible && eligibility.reason && (
        <div
          role="status"
          className={`mt-3 pt-3 border-t ${MENU_DIVIDER} flex flex-wrap items-center gap-x-2 gap-y-1 text-xs ${MENU_TEXT_BODY}`}
        >
          <Info size={14} strokeWidth={1.5} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{promotionReasonLabel(eligibility, t)}</span>
          {canSuggestItems && (
            <button type="button" onClick={onSeeProducts} className={PROMO_LINK_BTN} style={{ color: accent }}>
              {t('promotionDetailPage.ver_itens_elegiveis')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
