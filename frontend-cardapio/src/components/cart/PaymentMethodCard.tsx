import { CardPreview } from './CardPreview';
import { CashInfoCard } from './CashInfoCard';
import { PixInfoCard } from './PixInfoCard';

export type PaymentMethod = 'dinheiro' | 'cartao' | 'pix';

interface PaymentMethodCardProps {
  method: PaymentMethod;
  /** `displayTotal` já calculado no carrinho — nada é recalculado aqui. */
  total: number;
  orderType: 'balcao' | 'entrega';
  primaryColor: string;
}

// Card correspondente ao método escolhido na etapa "Pagamento", com transição
// suave (a animação some com prefers-reduced-motion — ver `.cart-pay-in` no
// index.css). O `key` remonta o bloco a cada troca de método: isso dispara a
// transição E descarta o estado local do cartão ilustrativo (CardPreview), que
// também desmonta ao sair da etapa — nada do que foi digitado sobrevive.
export function PaymentMethodCard({ method, total, orderType, primaryColor }: PaymentMethodCardProps) {
  return (
    <div key={method} className="cart-pay-in">
      {method === 'cartao' && <CardPreview primaryColor={primaryColor} />}
      {method === 'pix' && <PixInfoCard total={total} />}
      {method === 'dinheiro' && <CashInfoCard total={total} orderType={orderType} />}
    </div>
  );
}
