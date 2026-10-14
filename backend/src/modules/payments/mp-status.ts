// Interpretação dos status do Mercado Pago, em funções PURAS (sem banco, sem
// rede) — usadas pelo OrdersService e cobertas por teste.

export type PaymentOutcome = 'paid' | 'processing' | 'failed' | 'reversed';

/**
 * Status do Mercado Pago -> resultado no nosso vocabulário:
 *  - paid:       approved (e authorized, que é o mesmo que "aprovado a capturar")
 *  - processing: pending, in_process, in_mediation  (inclui desafio 3DS pendente)
 *  - failed:     rejected, cancelled
 *  - reversed:   refunded, charged_back
 * Status desconhecido é tratado como `processing` (nunca como pago): na dúvida
 * o pedido continua aguardando e o próximo poll/webhook decide.
 */
export function classifyMpStatus(status: string | null | undefined): PaymentOutcome {
  switch (status) {
    case 'approved':
    case 'authorized':
      return 'paid';
    case 'rejected':
    case 'cancelled':
      return 'failed';
    case 'refunded':
    case 'charged_back':
      return 'reversed';
    default:
      return 'processing';
  }
}

// Códigos estáveis de recusa — o frontend traduz cada um (i18n). A mensagem em
// português serve de reserva e para logs.
export type CardRejectionCode =
  | 'insufficient_funds'
  | 'bad_card_data'
  | 'call_issuer'
  | 'card_disabled'
  | 'max_attempts'
  | 'duplicated'
  | 'high_risk'
  | 'invalid_installments'
  | 'other';

const REJECTION_MESSAGES: Record<CardRejectionCode, string> = {
  insufficient_funds: 'Saldo ou limite insuficiente. Tente outro cartão.',
  bad_card_data: 'Confira os dados do cartão e tente novamente.',
  call_issuer: 'O banco precisa autorizar esta compra. Fale com o emissor do cartão ou use outro cartão.',
  card_disabled: 'Este cartão está desativado. Ative-o com o banco ou use outro cartão.',
  max_attempts: 'Muitas tentativas com este cartão. Use outro cartão ou tente mais tarde.',
  duplicated: 'Já existe um pagamento igual em andamento.',
  high_risk: 'Não foi possível aprovar este pagamento. Tente outro cartão ou outra forma de pagamento.',
  invalid_installments: 'Parcelamento indisponível para este cartão.',
  other: 'O pagamento não foi aprovado. Tente outro cartão ou outra forma de pagamento.',
};

/**
 * `status_detail` de um pagamento recusado -> código estável. Detalhes de
 * fraude/risco NÃO são expostos ao cliente (viram `high_risk`, mensagem
 * genérica) para não ajudar quem testa cartões a contornar o antifraude.
 */
export function classifyRejection(statusDetail: string | null | undefined): CardRejectionCode {
  const detail = statusDetail ?? '';
  if (detail === 'cc_rejected_insufficient_amount') return 'insufficient_funds';
  if (detail.startsWith('cc_rejected_bad_filled')) return 'bad_card_data';
  if (detail === 'cc_rejected_call_for_authorize') return 'call_issuer';
  if (detail === 'cc_rejected_card_disabled') return 'card_disabled';
  if (detail === 'cc_rejected_max_attempts') return 'max_attempts';
  if (detail === 'cc_rejected_duplicated_payment') return 'duplicated';
  if (detail === 'cc_rejected_invalid_installments') return 'invalid_installments';
  if (
    detail === 'cc_rejected_high_risk' ||
    detail === 'rejected_high_risk' ||
    detail === 'cc_rejected_blacklist' ||
    detail === 'rejected_by_regulations'
  ) {
    return 'high_risk';
  }
  return 'other';
}

export function rejectionMessage(code: CardRejectionCode): string {
  return REJECTION_MESSAGES[code];
}
