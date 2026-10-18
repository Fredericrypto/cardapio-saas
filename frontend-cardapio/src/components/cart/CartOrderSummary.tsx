import { useI18n } from '../../i18n/I18nContext';
import { formatBRL } from '../../lib/cartFormat';
import { CART_TEXT, CART_TEXT_BODY, CART_TEXT_ERROR } from '../../lib/cartTheme';
import { PROMO_SERIF, PROMO_SAGE } from '../../lib/promotionTheme';

export interface CartOrderSummaryProps {
  totalPrice: number;
  /** Só os cupons ELEGÍVEIS agora (os que o backend vai aceitar). */
  coupons: { id: string; title: string; discount: number }[];
  /** Taxa de entrega cotada (null = sem entrega/sem cotação). */
  deliveryFee: number | null;
  cashbackUsed: number;
  tip: number;
  /** `displayTotal` já calculado — nada é recalculado aqui. */
  total: number;
}

// Linhas do resumo (subtotal, cupons, taxa, cashback, gorjeta e total). Só
// apresenta valores que a CartPage já calculou em centavos/reais.
export function CartOrderSummary({ totalPrice, coupons, deliveryFee, cashbackUsed, tip, total }: CartOrderSummaryProps) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <div className={`flex justify-between gap-3 ${CART_TEXT_BODY}`}>
        <span>{t('closingPaymentSheet.subtotal')}</span>
        <span className="tabular-nums">{formatBRL(totalPrice)}</span>
      </div>
      {coupons.map((coupon) => (
        <div key={coupon.id} className={`flex justify-between gap-3 ${CART_TEXT_ERROR}`}>
          <span className="min-w-0">
            {t('cartPage.cupom')}
            {coupon.title})
          </span>
          <span className="tabular-nums shrink-0">- {formatBRL(coupon.discount)}</span>
        </div>
      ))}
      {deliveryFee !== null && (
        <div className={`flex justify-between gap-3 ${CART_TEXT_BODY}`}>
          <span>{t('cartPage.taxa_de_entrega')}</span>
          <span className="tabular-nums">{formatBRL(deliveryFee)}</span>
        </div>
      )}
      {cashbackUsed > 0 && (
        <div className={`flex justify-between gap-3 ${CART_TEXT_ERROR}`}>
          <span>{t('receiptContent.cashback_usado')}</span>
          <span className="tabular-nums">- {formatBRL(cashbackUsed)}</span>
        </div>
      )}
      {tip > 0 && (
        <div className={`flex justify-between gap-3 ${CART_TEXT_BODY}`}>
          <span>{t('closingPaymentSheet.gorjeta')}</span>
          <span className="tabular-nums">{formatBRL(tip)}</span>
        </div>
      )}
      <div className={`flex justify-between items-baseline gap-3 pt-2 ${CART_TEXT}`}>
        <span className="text-sm font-semibold">{t('closingPaymentSheet.total')}</span>
        <span className={`text-4xl font-light tabular-nums ${PROMO_SAGE}`} style={{ fontFamily: PROMO_SERIF }}>{formatBRL(total)}</span>
      </div>
    </div>
  );
}
