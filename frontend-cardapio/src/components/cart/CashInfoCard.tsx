import { Banknote } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { paymentMethodLabel } from '../../i18n/labels';

interface CashInfoCardProps {
  /** `displayTotal` já calculado no carrinho (centavos, cupom, cashback, taxa e gorjeta). */
  total: number;
  orderType: 'balcao' | 'entrega';
}

// Dinheiro: ícone, "R$" em destaque, valor total e as informações de sempre
// (troco combinado; na entrega ou na retirada). Sem campo "troco para" —
// isso exigiria backend.
export function CashInfoCard({ total, orderType }: CashInfoCardProps) {
  const { t } = useI18n();
  const where = t(orderType === 'entrega' ? 'cart.payOnDelivery' : 'cart.payOnPickup', {
    method: paymentMethodLabel('dinheiro', t),
  });
  return (
    <div className="rounded-2xl border p-5 bg-[#FFFBEB] border-[#FDE68A] dark:bg-[#2a2010] dark:border-[#5a4010]">
      <div className="flex items-center gap-3">
        <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-[#F59E0B]/15 text-[#B45309] dark:bg-[#F59E0B]/20 dark:text-[#FCD34D]">
          <Banknote size={22} strokeWidth={1.5} aria-hidden="true" />
        </span>
        <p className="text-base font-semibold text-[#92400E] dark:text-[#FCD34D]">{where}</p>
      </div>
      <div className="mt-5">
        <p className="text-[11px] font-medium text-[#B45309] dark:text-[#FCD34D]/80">{t('closingPaymentSheet.total')}</p>
        <p className="flex items-baseline gap-1.5 tabular-nums text-[#78350F] dark:text-[#FEF3C7]">
          <span className="text-xl font-semibold">R$</span>
          <span className="text-3xl font-light">{total.toFixed(2).replace('.', ',')}</span>
        </p>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-[#B45309] dark:text-[#FDE68A]/90">
        {t('cartPage.tenha_o_troco_combinado')}
      </p>
    </div>
  );
}
