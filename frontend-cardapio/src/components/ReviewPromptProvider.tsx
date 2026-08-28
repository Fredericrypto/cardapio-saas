import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { fetchEligibleOrdersForReview } from '../lib/customer-api';
import type { EligibleOrderForReview, MyReview } from '../lib/customer-api';
import { useTenant } from '../contexts/TenantContext';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { ReviewModal } from './ReviewModal';

const ORDER_TYPE_LABEL: Record<EligibleOrderForReview['orderType'], string> = {
  balcao: 'Balcão',
  entrega: 'Entrega',
  mesa: 'Mesa',
};

// Notificação "como foi o seu pedido?" — modal por cima da tela.
// Montado uma vez, direto dentro do Router.
//
// SÓ dispara a partir do parâmetro `?avaliar=<orderId>` na URL — que
// SÓ a própria notificação de avaliação carrega (ver notifyReviewPrompt
// no backend). Nenhuma outra navegação, nenhum outro clique, nenhuma
// outra notificação abre esse modal.
//
// Bug real que isso corrige: antes, isso reconsultava e reabria o modal
// em QUALQUER navegação enquanto existisse algum pedido elegível não
// avaliado — clicar em QUALQUER notificação (pagamento confirmado,
// cashback, status do pedido) acabava mostrando o modal de avaliação de
// um pedido diferente, sem relação nenhuma com o que foi clicado. E
// como o modal cobria a tela de destino real da notificação, parecia
// que "a notificação não levava pra onde deveria".
export function ReviewPromptProvider() {
  const location = useLocation();
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const { token: customerToken } = useCustomerAuth();
  const [eligibleOrder, setEligibleOrder] = useState<EligibleOrderForReview | null>(null);

  const params = new URLSearchParams(location.search);
  const avaliarOrderId = params.get('avaliar');

  useEffect(() => {
    if (!avaliarOrderId || !tenant || !customerToken) {
      setEligibleOrder(null);
      return;
    }
    let cancelled = false;
    // Confere no servidor que esse pedido REALMENTE está elegível (não
    // foi avaliado nesse meio-tempo, é de verdade desse cliente) antes
    // de abrir o modal — nunca confia cegamente no parâmetro da URL,
    // que pode vir de uma notificação antiga já resolvida.
    fetchEligibleOrdersForReview(tenant.id, customerToken)
      .then((orders) => {
        if (cancelled) return;
        setEligibleOrder(orders.find((o) => o.id === avaliarOrderId) ?? null);
      })
      .catch(() => {
        if (!cancelled) setEligibleOrder(null);
      });
    return () => {
      cancelled = true;
    };
  }, [avaliarOrderId, tenant, customerToken]);

  if (!eligibleOrder || !tenant || !customerToken) return null;

  // Tira o `?avaliar=` da URL ao fechar/enviar — sem isso, um F5 na
  // mesma página reabriria o modal de novo, e voltar por essa URL no
  // histórico do navegador também.
  function clearAvaliarParam() {
    const next = new URLSearchParams(location.search);
    next.delete('avaliar');
    const query = next.toString();
    navigate({ pathname: location.pathname, search: query ? `?${query}` : '' }, { replace: true });
  }

  function handleClose() {
    setEligibleOrder(null);
    clearAvaliarParam();
  }

  function handleSubmitted(_review: MyReview) {
    setEligibleOrder(null);
    clearAvaliarParam();
  }

  return (
    <ReviewModal
      tenantId={tenant.id}
      token={customerToken}
      orderId={eligibleOrder.id}
      orderLabel={ORDER_TYPE_LABEL[eligibleOrder.orderType]}
      onClose={handleClose}
      onSubmitted={handleSubmitted}
    />
  );
}
