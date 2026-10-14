import { CardInfoCard } from './CardInfoCard';
import { CashInfoCard } from './CashInfoCard';
import { PixInfoCard } from './PixInfoCard';
import type { PixInfoVariant } from './PixInfoCard';

export type PaymentMethod = 'dinheiro' | 'cartao' | 'pix';

interface PaymentMethodCardProps {
  method: PaymentMethod;
  /** `displayTotal` já calculado no carrinho — nada é recalculado aqui. */
  total: number;
  orderType: 'balcao' | 'entrega';
  /** Cartão online (Mercado Pago) ativo neste restaurante. */
  cardOnline: boolean;
  /** Como o Pix funciona neste restaurante (ver PixInfoVariant). */
  pixVariant: PixInfoVariant;
}

// Card correspondente ao método escolhido na etapa "Pagamento", com transição
// suave (a animação some com prefers-reduced-motion — ver `.cart-pay-in` no
// index.css). O `key` remonta o bloco a cada troca de método e dispara a
// transição. Nenhum dado de pagamento é coletado aqui.
export function PaymentMethodCard({ method, total, orderType, cardOnline, pixVariant }: PaymentMethodCardProps) {
  return (
    <div key={method} className="cart-pay-in">
      {method === 'cartao' && <CardInfoCard online={cardOnline} />}
      {method === 'pix' && <PixInfoCard total={total} variant={pixVariant} />}
      {method === 'dinheiro' && <CashInfoCard total={total} orderType={orderType} />}
    </div>
  );
}
