import { useMemo } from 'react';
import { useDashboardData } from '../contexts/DashboardDataContext';
import type { AttentionIds } from '../types/vitrine';

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
  // Os MESMOS ids, separados por categoria (ordenados). O Modo Vitrine compara
  // conjuntos para acordar só quando surge um id NOVO — a assinatura sozinha também
  // muda quando um item é atendido e some, e isso nunca deve acordar a vitrine.
  ids: AttentionIds;
}

// Lê da mesma fonte de dados que a PainelPage usa (DashboardDataProvider,
// montado uma vez no AdminLayout) — nada de polling próprio aqui, pra não
// duplicar chamadas nem correr risco dos dois relógios saírem de sincronia
// entre si (ver comentário em DashboardDataContext.tsx).
export function useAttentionStatus(): AttentionState {
  const { orders, waiterCalls, activeTables } = useDashboardData();

  const ids = useMemo<AttentionIds>(
    () => ({
      orders: (orders ?? [])
        .filter((o) => o.status === 'pendente' || o.status === 'aguardando_pagamento')
        .map((o) => o.id)
        .sort(),
      calls: (waiterCalls ?? []).map((c) => c.id).sort(),
      closings: (activeTables ?? [])
        .filter((item) => item.session.status === 'fechamento_solicitado')
        .map((item) => item.session.id)
        .sort(),
    }),
    [orders, waiterCalls, activeTables],
  );

  const signature = `${ids.orders.join(',')}|${ids.calls.join(',')}|${ids.closings.join(',')}`;
  const hasAny = ids.orders.length > 0 || ids.calls.length > 0 || ids.closings.length > 0;

  return { hasAny, signature, ids };
}
