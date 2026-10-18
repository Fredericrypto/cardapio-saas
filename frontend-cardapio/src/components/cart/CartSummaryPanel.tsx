import type { ReactNode } from 'react';
import { CART_PANEL, CART_TEXT_ERROR } from '../../lib/cartTheme';
import { PROMO_SERIF, PROMO_INK } from '../../lib/promotionTheme';

interface CartSummaryPanelProps {
  title: string;
  /** Card do método de pagamento (só na etapa "Pagamento"). */
  paymentSlot?: ReactNode;
  summary: ReactNode;
  errorMessage: string | null;
  primaryButton: ReactNode;
}

// Painel da direita (desktop, a partir de lg): tinta diferente do fundo e dos
// cartões, cantos bem arredondados, fixo (sticky) abaixo da navbar. Título,
// card do método (que no desktop pode passar um pouco da borda direita),
// resumo, erro e o botão principal no fim. No celular/tablet ele não existe:
// o botão vive na BottomNav / barra fixa e o resumo, no fim da revisão.
export function CartSummaryPanel({ title, paymentSlot, summary, errorMessage, primaryButton }: CartSummaryPanelProps) {
  return (
    <aside aria-label={title} className={`hidden lg:flex lg:flex-col lg:gap-5 lg:sticky lg:top-24 ${CART_PANEL}`}>
      <h2 className={`text-2xl font-light ${PROMO_INK}`} style={{ fontFamily: PROMO_SERIF }}>{title}</h2>
      {paymentSlot}
      {summary}
      {errorMessage && (
        <p role="alert" className={`text-xs ${CART_TEXT_ERROR}`}>
          {errorMessage}
        </p>
      )}
      {primaryButton}
    </aside>
  );
}
