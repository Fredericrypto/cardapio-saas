// Camada 3 do SIOD: carimbos do ciclo de vida do pedido. Função pura, chamada
// em todo ponto onde o status muda. Só carimba na TRANSIÇÃO (re-salvar o mesmo
// status não mexe em nada).
//  - preparando / pronto: guarda a PRIMEIRA vez (idas e vindas do admin não
//    apagam o primeiro instante real);
//  - entregue: o instante da entrega vigente (se reabrir e entregar de novo, vale o último).
// Pular etapas (ex.: concluir direto da fila) deixa o carimbo nulo — o SIOD marca
// o registro como MISSING_DATA em vez de inventar o tempo.
export interface LifecycleStamps {
  status: string;
  preparingAt: Date | null;
  readyAt: Date | null;
  deliveredAt: Date | null;
}

export function stampOrderLifecycle(order: LifecycleStamps, nextStatus: string, now: Date = new Date()): void {
  if (order.status === nextStatus) return;
  if (nextStatus === 'preparando') {
    order.preparingAt = order.preparingAt ?? now;
  } else if (nextStatus === 'pronto') {
    order.readyAt = order.readyAt ?? now;
  } else if (nextStatus === 'entregue') {
    order.deliveredAt = now;
  }
}
