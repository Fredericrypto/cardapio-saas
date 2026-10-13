import { QrCode } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { formatBRL } from '../../lib/cartFormat';

interface PixInfoCardProps {
  /** `displayTotal` já calculado no carrinho (centavos, cupom, cashback, taxa e gorjeta). */
  total: number;
}

// Pix: só informa. NÃO existe chave, QR Code nem copia-e-cola aqui — o Pix de
// verdade é gerado depois pelo PixWaitingPanel e a decisão de ser Pix real é
// do backend (tenant.pixEnabled). Verde discreto, legível nos dois temas.
export function PixInfoCard({ total }: PixInfoCardProps) {
  const { t } = useI18n();
  return (
    <div className="rounded-2xl border p-5 bg-[#ECFDF5] border-[#A7F3D0] dark:bg-[#10251f] dark:border-[#1c4a3f]">
      <div className="flex items-center gap-3">
        <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-[#32BCAD]/15 text-[#0F766E] dark:bg-[#32BCAD]/20 dark:text-[#5EEAD4]">
          <QrCode size={22} strokeWidth={1.5} aria-hidden="true" />
        </span>
        <p className="text-base font-semibold text-[#065F46] dark:text-[#6EE7B7]">{t('payment.pix')}</p>
      </div>
      <div className="mt-5">
        <p className="text-[11px] font-medium text-[#047857] dark:text-[#6EE7B7]/80">{t('closingPaymentSheet.total')}</p>
        <p className="text-3xl font-light tabular-nums text-[#064E3B] dark:text-[#D1FAE5]">{formatBRL(total)}</p>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-[#047857] dark:text-[#A7F3D0]/90">{t('cartPage.o_qr_code_do')}</p>
    </div>
  );
}
