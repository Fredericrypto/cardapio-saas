import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { fetchReviewPromptInfo } from '../lib/customer-api';
import type { ReviewPromptInfo, MyReview } from '../lib/customer-api';
import { useTenant } from '../contexts/TenantContext';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { ReviewModal } from './ReviewModal';

// Uma entrada da fila de avaliação — a primeira (se existir) é sempre o
// restaurante, o resto são os itens do pedido, um de cada vez.
type QueueEntry =
  | { type: 'restaurant' }
  | { type: 'item'; productId: string; productName: string; productImageUrl: string | null };

// Notificação "como foi o seu pedido?" — modal por cima da tela.
// Montado uma vez, direto dentro do Router.
//
// SÓ dispara a partir do parâmetro `?avaliar=<orderId>` na URL — que SÓ
// a própria notificação de avaliação carrega (ver notifyReviewPrompt no
// backend). Nenhuma outra navegação, nenhum outro clique, nenhuma outra
// notificação abre esse modal.
//
// Fluxo SEQUENCIAL (pedido do Felipe): primeiro pergunta a nota do
// RESTAURANTE (se ainda elegível), e assim que esse passo termina
// (enviado OU pulado), pergunta a nota de CADA ITEM do pedido, um de
// cada vez, com "1/N, 2/N..." indicando o progresso — sem disparar
// nenhuma notificação nova pra isso, é tudo dentro do mesmo modal já
// aberto pela notificação original.
export function ReviewPromptProvider() {
  const location = useLocation();
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const { token: customerToken } = useCustomerAuth();
  const [queue, setQueue] = useState<QueueEntry[] | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const params = new URLSearchParams(location.search);
  const avaliarOrderId = params.get('avaliar');

  useEffect(() => {
    if (!avaliarOrderId || !tenant || !customerToken) {
      setQueue(null);
      return;
    }
    let cancelled = false;
    // Confere no servidor o que REALMENTE ainda está elegível pra esse
    // pedido (nada foi avaliado nesse meio-tempo, tudo é de verdade
    // desse cliente) antes de montar a fila — nunca confia cegamente no
    // parâmetro da URL, que pode vir de uma notificação antiga já
    // resolvida.
    fetchReviewPromptInfo(tenant.id, customerToken, avaliarOrderId)
      .then((info: ReviewPromptInfo) => {
        if (cancelled) return;
        const built: QueueEntry[] = [];
        if (info.canReviewRestaurant) built.push({ type: 'restaurant' });
        for (const item of info.items) {
          built.push({
            type: 'item',
            productId: item.productId,
            productName: item.productName,
            productImageUrl: item.productImageUrl,
          });
        }
        setQueue(built.length > 0 ? built : null);
        setCurrentIndex(0);
      })
      .catch(() => {
        if (!cancelled) setQueue(null);
      });
    return () => {
      cancelled = true;
    };
  }, [avaliarOrderId, tenant, customerToken]);

  if (!queue || !tenant || !customerToken || !avaliarOrderId) return null;
  const current = queue[currentIndex];
  if (!current) return null;

  // Tira o `?avaliar=` da URL ao terminar a fila inteira — sem isso, um
  // F5 na mesma página reabriria o modal de novo, e voltar por essa URL
  // no histórico do navegador também.
  function clearAvaliarParam() {
    const next = new URLSearchParams(location.search);
    next.delete('avaliar');
    const query = next.toString();
    navigate({ pathname: location.pathname, search: query ? `?${query}` : '' }, { replace: true });
  }

  // Avança automaticamente pro próximo da fila — tanto ao enviar quanto
  // ao pular (cancelar com confirmação, já tratado dentro do
  // ReviewModal). Só limpa o parâmetro da URL quando a fila inteira
  // termina.
  function advance() {
    if (currentIndex + 1 < (queue?.length ?? 0)) {
      setCurrentIndex((i) => i + 1);
    } else {
      setQueue(null);
      clearAvaliarParam();
    }
  }

  function handleSubmitted(_review: MyReview) {
    advance();
  }

  return (
    <ReviewModal
      tenantId={tenant.id}
      token={customerToken}
      orderId={avaliarOrderId}
      stepLabel={queue.length > 1 ? `${currentIndex + 1}/${queue.length}` : undefined}
      target={
        current.type === 'restaurant'
          ? { type: 'restaurant', orderLabel: 'Avaliação do restaurante' }
          : {
              type: 'item',
              productId: current.productId,
              productName: current.productName,
              productImageUrl: current.productImageUrl,
            }
      }
      onClose={advance}
      onSubmitted={handleSubmitted}
    />
  );
}
