import { useDashboardData } from '../contexts/DashboardDataContext';

export interface AttentionState {
  // Existe alguma coisa pedindo atenção agora (pedido pendente, chamado de
  // garçom, fechamento de conta solicitado)? Bruto, sem levar em conta se
  // o admin já viu ou não.
  hasAny: boolean;
  // Identifica EXATAMENTE quais itens estão pedindo atenção agora (ids
  // ordenados, concatenados). Se o admin já visitou o Painel com essa
  // mesma assinatura, não pisca de novo — só volta a piscar quando a
  // assinatura muda de verdade (chegou pedido novo, chamado novo, etc.),
  // não só porque ele saiu e voltou da aba.
  signature: string;
}

// Lê da mesma fonte de dados que a PainelPage usa (DashboardDataProvider,
// montado uma vez no AdminLayout) — nada de polling próprio aqui, pra não
// duplicar chamadas nem correr risco dos dois relógios saírem de sincronia
// entre si (ver comentário em DashboardDataContext.tsx).
export function useAttentionStatus(): AttentionState {
  const { orders, waiterCalls, activeTables } = useDashboardData();

  const pendingOrderIds = (orders ?? [])
    .filter((o) => o.status === 'pendente' || o.status === 'aguardando_pagamento')
    .map((o) => o.id)
    .sort()
    .join(',');
  const pendingCallIds = (waiterCalls ?? [])
    .map((c) => c.id)
    .sort()
    .join(',');
  const awaitingClosingIds = (activeTables ?? [])
    .filter((item) => item.session.status === 'fechamento_solicitado')
    .map((item) => item.session.id)
    .sort()
    .join(',');

  const signature = `${pendingOrderIds}|${pendingCallIds}|${awaitingClosingIds}`;
  const hasAny = Boolean(pendingOrderIds || pendingCallIds || awaitingClosingIds);

  return { hasAny, signature };
}
