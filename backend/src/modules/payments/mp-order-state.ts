// Regras de estado do pagamento de um pedido — funções PURAS (sem banco, sem
// rede), usadas pelo OrdersService e cobertas por teste. O serviço executa os
// efeitos; aqui só se decide O QUE fazer, sempre do mesmo jeito para o polling,
// o webhook e a tentativa de pagamento (nunca duas regras diferentes).

import type { PaymentOutcome } from './mp-status';

/** Quantas tentativas de cartão um pedido aceita (trava contra "card testing"). */
export const MAX_CARD_ATTEMPTS = 3;

/** Janela para pagar o cartão online, em ms (digitar + 3DS) — 15 minutos. */
export const CARD_PAYMENT_WINDOW_MS = 15 * 60 * 1000;

export interface OrderPaymentSnapshot {
  orderStatus: string; // aguardando_pagamento | pendente | ... | cancelado
  paymentMethod: string | null;
  paymentStatus: string; // pendente | processando | recusado | pago | falhou | estornado | ...
  mpPaymentId: string | null;
  expiresAt: Date | null;
  cardAttempts: number;
}

export type CardAttemptBlock =
  | 'not_card'
  | 'already_paid'
  | 'not_awaiting'
  | 'expired'
  | 'in_flight'
  | 'too_many_attempts';

export type CardAttemptDecision =
  | { action: 'proceed' }
  | { action: 'check_existing' } // há cobrança anterior em aberto: consultar o MP antes
  | { action: 'blocked'; reason: CardAttemptBlock };

/**
 * Pode iniciar uma tentativa de pagamento por cartão neste pedido agora?
 * Ordem das checagens importa: "já pago" vem antes de "não está aguardando".
 */
export function decideCardAttempt(s: OrderPaymentSnapshot, now: Date): CardAttemptDecision {
  if (s.paymentMethod !== 'cartao') return { action: 'blocked', reason: 'not_card' };
  if (s.paymentStatus === 'pago') return { action: 'blocked', reason: 'already_paid' };
  if (s.orderStatus !== 'aguardando_pagamento') return { action: 'blocked', reason: 'not_awaiting' };
  if (s.expiresAt && s.expiresAt.getTime() <= now.getTime()) return { action: 'blocked', reason: 'expired' };
  if (s.paymentStatus === 'processando') return { action: 'blocked', reason: 'in_flight' };
  if (s.cardAttempts >= MAX_CARD_ATTEMPTS) return { action: 'blocked', reason: 'too_many_attempts' };
  if (s.paymentStatus === 'pendente' && s.mpPaymentId) return { action: 'check_existing' };
  return { action: 'proceed' };
}

export type ExistingPaymentDecision = 'return_paid' | 'return_processing' | 'proceed' | 'blocked_reversed';

/** Depois de consultar o MP sobre a cobrança anterior: o que fazer com a nova tentativa. */
export function decideAfterExistingPayment(outcome: PaymentOutcome): ExistingPaymentDecision {
  switch (outcome) {
    case 'paid':
      return 'return_paid';
    case 'processing':
      return 'return_processing';
    case 'failed':
      return 'proceed';
    case 'reversed':
      return 'blocked_reversed';
  }
}

// ---------------------------------------------------------------------------
// Evento de pagamento (webhook ou polling) -> plano
// ---------------------------------------------------------------------------

export type PaymentEffect =
  | 'mark_paid' // pedido vira pago (o serviço faz a transição ATÔMICA e só então credita/notifica)
  | 'cancel_order' // pedido vira cancelado (Pix recusado)
  | 'refund_orphan' // pagamento aprovado de um pedido já cancelado: devolver o dinheiro
  | 'refund_duplicate'; // pagamento aprovado de uma tentativa que não é a do pedido: devolver

export interface PaymentEvent {
  paymentId: string | null;
  outcome: PaymentOutcome;
  /** Status cru do MP (só distingue refunded de charged_back). */
  mpStatus: string | null;
}

export interface PaymentPlan {
  effects: PaymentEffect[];
  /** Campos a gravar no pedido (além dos efeitos). */
  next: { status?: string; paymentStatus?: string };
}

const NOTHING: PaymentPlan = { effects: [], next: {} };

export function planPaymentEvent(
  order: Pick<OrderPaymentSnapshot, 'orderStatus' | 'paymentMethod' | 'paymentStatus' | 'mpPaymentId'>,
  event: PaymentEvent,
): PaymentPlan {
  // 1) Pagamento de OUTRA tentativa (cartão tentado de novo, ou id antigo).
  if (order.mpPaymentId && event.paymentId && order.mpPaymentId !== event.paymentId) {
    return event.outcome === 'paid' ? { effects: ['refund_duplicate'], next: {} } : NOTHING;
  }

  // 2) Pedido ainda aguardando pagamento.
  if (order.orderStatus === 'aguardando_pagamento') {
    if (event.outcome === 'paid') {
      return { effects: ['mark_paid'], next: { status: 'pendente', paymentStatus: 'pago' } };
    }
    if (event.outcome === 'failed') {
      if (order.paymentMethod === 'cartao') {
        // Cartão recusado NÃO cancela: o cliente pode tentar de novo na janela.
        return { effects: [], next: { paymentStatus: 'recusado' } };
      }
      return { effects: ['cancel_order'], next: { status: 'cancelado', paymentStatus: 'falhou' } };
    }
    return NOTHING;
  }

  // 3) Pedido já cancelado: dinheiro que chegou depois precisa voltar.
  if (order.orderStatus === 'cancelado') {
    if (event.outcome === 'paid' && order.paymentStatus !== 'estornado' && order.paymentStatus !== 'pago') {
      return { effects: ['refund_orphan'], next: {} };
    }
    return NOTHING;
  }

  // 4) Pedido em andamento/concluído.
  if (order.paymentStatus === 'pago' && event.outcome === 'reversed') {
    return { effects: [], next: { paymentStatus: event.mpStatus === 'charged_back' ? 'chargeback' : 'estornado' } };
  }
  return NOTHING;
}
