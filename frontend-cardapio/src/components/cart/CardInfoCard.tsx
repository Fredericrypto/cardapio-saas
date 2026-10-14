import { CreditCard } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { CART_TEXT, CART_TEXT_BODY } from '../../lib/cartTheme';
import { MENU_BORDER, MENU_SURFACE_SUBTLE } from '../../lib/menuTheme';

interface CardInfoCardProps {
  /** Pagamento online ativo: o cartão é pago na tela seguinte, logo após confirmar. */
  online: boolean;
}

// Cartão na etapa "Pagamento": só informa. NENHUM dado de cartão é digitado
// aqui — com pagamento online o cliente paga num ambiente seguro do Mercado
// Pago depois de confirmar o pedido (CardPaymentPanel); sem ele, o cartão é
// pago na maquininha, na entrega ou retirada.
export function CardInfoCard({ online }: CardInfoCardProps) {
  const { t } = useI18n();
  return (
    <div className={`rounded-2xl border p-5 ${MENU_SURFACE_SUBTLE} ${MENU_BORDER}`}>
      <div className="flex items-center gap-3">
        <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-black/5 dark:bg-white/10">
          <CreditCard size={22} strokeWidth={1.5} aria-hidden="true" className={CART_TEXT} />
        </span>
        <p className={`text-base font-semibold ${CART_TEXT}`}>{t('payment.card')}</p>
      </div>
      <p className={`mt-4 text-xs leading-relaxed ${CART_TEXT_BODY}`}>
        {online ? t('cartPayment.cardOnlineInfo') : t('cartPage.maquininha_na_entrega_retirada')}
      </p>
    </div>
  );
}
