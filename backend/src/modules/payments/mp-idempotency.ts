import { createHash } from 'crypto';

// Chaves de idempotência do Mercado Pago (header X-Idempotency-Key).
// O MP devolve a MESMA resposta para a mesma chave (por até 24h), então a
// regra é: mesma TENTATIVA = mesma chave; tentativa NOVA = chave nova.

/** Pix de pedido: um por pedido — o pedido só gera uma cobrança Pix. */
export function pixOrderIdempotencyKey(orderId: string): string {
  return `pix:${orderId}`;
}

/**
 * Cartão: derivada do PEDIDO + do card token. Reenviar o mesmo token (timeout
 * seguido de retry, duplo clique) reaproveita a chave -> o MP não cobra duas
 * vezes. Um cartão novo gera token novo -> chave nova -> nova tentativa
 * legítima. O token em si nunca é gravado nem logado: só o hash entra na chave.
 */
export function cardIdempotencyKey(orderId: string, cardToken: string): string {
  const digest = createHash('sha256').update(cardToken).digest('hex').slice(0, 32);
  return `card:${orderId}:${digest}`;
}

/** Estorno total: um por pagamento. */
export function refundIdempotencyKey(paymentId: string): string {
  return `refund:${paymentId}`;
}
