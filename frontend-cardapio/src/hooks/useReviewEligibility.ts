import { useCallback, useEffect, useState } from 'react';
import { fetchMyOrderHistory, fetchMyReviews, fetchReviewPromptInfo } from '../lib/customer-api';
import type { CustomerOrderHistoryItem } from '../lib/customer-api';

export type ReviewEligibility =
  | { status: 'loading' }
  | { status: 'guest' } // não autenticado
  | { status: 'none' } // logado, sem pedido concluído elegível
  | { status: 'can_review'; orderId: string } // CENÁRIO A
  | { status: 'reviewed' }; // CENÁRIO C

const MAX_ORDERS_TO_CHECK = 5;

// Mesma regra do servidor (ReviewsService.isOrderCompleted): cancelado nunca conta; mesa só
// vale com a sessão fechada; balcão/entrega só quando entregue.
function isCompleted(o: CustomerOrderHistoryItem): boolean {
  if (o.status === 'cancelado') return false;
  if (o.tableSessionId) return o.tableSession?.status === 'fechada';
  return o.status === 'entregue';
}

// Decide qual cenário mostrar na coluna esquerda usando SÓ a API existente:
//   fetchMyReviews (já avaliou?) → fetchMyOrderHistory (comprou?) → fetchReviewPromptInfo
//   (esse pedido ainda pode avaliar o restaurante?). Qualquer falha cai em 'none' (só a
//   mensagem principal) — nunca bloqueia a página.
export function useReviewEligibility(tenantId: string | undefined, token: string | null) {
  const [state, setState] = useState<ReviewEligibility>({ status: 'loading' });

  useEffect(() => {
    if (!tenantId) return;
    if (!token) {
      setState({ status: 'guest' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    (async () => {
      try {
        const mine = await fetchMyReviews(tenantId, token);
        if (cancelled) return;
        if (mine.restaurant) {
          setState({ status: 'reviewed' });
          return;
        }
        const history = await fetchMyOrderHistory(tenantId, token);
        if (cancelled) return;
        const candidates = history
          .filter(isCompleted)
          .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
          .slice(0, MAX_ORDERS_TO_CHECK);
        for (const order of candidates) {
          const info = await fetchReviewPromptInfo(tenantId, token, order.id);
          if (cancelled) return;
          if (info.canReviewRestaurant) {
            setState({ status: 'can_review', orderId: order.id });
            return;
          }
        }
        setState({ status: 'none' });
      } catch {
        if (!cancelled) setState({ status: 'none' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId, token]);

  const markReviewed = useCallback(() => setState({ status: 'reviewed' }), []);
  return { eligibility: state, markReviewed };
}
