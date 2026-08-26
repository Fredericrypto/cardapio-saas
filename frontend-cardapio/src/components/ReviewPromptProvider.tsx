import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { fetchEligibleOrdersForReview } from '../lib/customer-api';
import type { EligibleOrderForReview, MyReview } from '../lib/customer-api';
import { useTenant } from '../contexts/TenantContext';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { ReviewModal } from './ReviewModal';

// "Dispensei, não pergunta mais esse aqui" — de propósito em
// localStorage, não sessionStorage. Antes era por sessão (fechou a
// aba/deslogou, esquecia a dispensa e voltava a perguntar); isso é
// mais fiel ao padrão do iFood (repergunta em toda abertura do app até
// avaliar), mas na prática incomodava demais durante teste — qualquer
// logout/login novo reabria o mesmo pedido de teste em TODA página.
// Com localStorage, "Agora não" vale de verdade até o pedido ser
// avaliado (ou o navegador limpar os dados do site). O cliente ainda
// consegue achar e avaliar depois por conta própria em "Meus Pedidos".
const DISMISSED_KEY = 'reviewPrompt.dismissedOrderIds';

function getDismissedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function addDismissedId(id: string) {
  const ids = getDismissedIds();
  ids.add(id);
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
}

const ORDER_TYPE_LABEL: Record<EligibleOrderForReview['orderType'], string> = {
  balcao: 'Balcão',
  entrega: 'Entrega',
  mesa: 'Mesa',
};

// Notificação "como foi o seu pedido?" — aparece como um modal por cima
// de qualquer tela do app assim que existe um pedido concluído ainda
// não avaliado (nem apagado depois de avaliado uma vez). Fica montado
// uma vez só, direto dentro do Router (usa `useLocation` pra descobrir
// em qual restaurante — :slug — o cliente está navegando, sem precisar
// que toda rota passe isso explicitamente).
//
// "Lembrar o cliente" funciona assim: se ele fechar com "Agora não",
// esse pedido específico fica marcado como dispensado só PRA ESSA ABA/
// SESSÃO do navegador (sessionStorage) — abrindo de novo depois (nova
// aba, ou depois de fechar o navegador), a notificação volta, até ele
// avaliar de verdade ou o pedido sair da lista de elegíveis por algum
// outro motivo.
export function ReviewPromptProvider() {
  const location = useLocation();
  // Nunca mostra nada por cima da tela de entrar/criar conta — evita
  // qualquer confusão de "por que vejo um modal de outra sessão
  // enquanto tento logar", que foi exatamente o bug relatado.
  const isOnAuthPage = location.pathname.includes('/conta-cliente/entrar');

  const { tenant } = useTenant();
  const { token: customerToken } = useCustomerAuth();
  const [eligibleOrder, setEligibleOrder] = useState<EligibleOrderForReview | null>(null);

  useEffect(() => {
    if (isOnAuthPage || !tenant || !customerToken) {
      setEligibleOrder(null);
      return;
    }
    let cancelled = false;
    fetchEligibleOrdersForReview(tenant.id, customerToken)
      .then((orders) => {
        if (cancelled) return;
        const dismissed = getDismissedIds();
        setEligibleOrder(orders.find((o) => !dismissed.has(o.id)) ?? null);
      })
      .catch(() => {
        if (!cancelled) setEligibleOrder(null);
      });
    return () => {
      cancelled = true;
    };
    // Reconsulta a cada navegação — é o "polling" mais barato possível
    // (sem setInterval rodando pra sempre em segundo plano): qualquer
    // troca de tela já é uma chance natural de reavaliar se apareceu
    // pedido novo elegível.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant, customerToken, location.pathname, isOnAuthPage]);

  if (isOnAuthPage || !eligibleOrder || !tenant || !customerToken) return null;

  function handleClose() {
    addDismissedId(eligibleOrder!.id);
    setEligibleOrder(null);
  }

  function handleSubmitted(_review: MyReview) {
    setEligibleOrder(null);
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
