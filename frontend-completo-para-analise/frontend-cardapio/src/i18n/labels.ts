import type { TranslationKey } from './dictionaries/pt-BR';

// Rótulos de dados que o backend devolve como código (status, forma de pagamento,
// tipo de chave Pix, gênero) e regras de seleção de adicionais — todos no idioma
// do app. Código desconhecido aparece como veio.
type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

const ORDER_STATUS: Record<string, TranslationKey> = {
  aguardando_pagamento: 'status.awaitingPix',
  pendente: 'status.pending',
  confirmado: 'status.confirmed',
  preparando: 'status.preparing',
  pronto: 'status.ready',
  entregue: 'status.delivered',
  cancelado: 'status.cancelled',
};
const SESSION_STATUS: Record<string, TranslationKey> = {
  aberta: 'status.open',
  fechamento_solicitado: 'status.closing',
  fechada: 'status.closed',
};
const PAYMENT: Record<string, TranslationKey> = { pix: 'payment.pix', cartao: 'payment.card', dinheiro: 'payment.cash' };
const PIX_KEY: Record<string, TranslationKey> = {
  email: 'pixKey.email',
  telefone: 'pixKey.phone',
  cpf: 'pixKey.cpf',
  aleatoria: 'pixKey.random',
};
const GENDER: Record<string, TranslationKey> = {
  masculino: 'gender.male',
  feminino: 'gender.female',
  outro: 'gender.other',
  prefiro_nao_dizer: 'gender.unspecified',
};

const pick = (map: Record<string, TranslationKey>, code: string | null | undefined, t: Translate): string => {
  if (!code) return '';
  const key = map[code];
  return key ? t(key) : code;
};

export const orderStatusLabel = (status: string | null | undefined, t: Translate) => pick(ORDER_STATUS, status, t);
export const sessionStatusLabel = (status: string | null | undefined, t: Translate) => pick(SESSION_STATUS, status, t);
export const paymentMethodLabel = (method: string | null | undefined, t: Translate) => pick(PAYMENT, method, t);
export const pixKeyTypeLabel = (type: string | null | undefined, t: Translate) => pick(PIX_KEY, type, t);
export const genderLabel = (value: string | null | undefined, t: Translate) => pick(GENDER, value, t);

// Regra do grupo de adicionais: nada quando é livre (0 a 1), "Escolha até N" quando
// opcional com teto, "Escolha N" quando obrigatório fixo, ou a faixa.
export function addonGroupHint(minSelect: number, maxSelect: number, t: Translate): string | null {
  if (minSelect === 0 && maxSelect <= 1) return null;
  if (minSelect === 0) return t('addons.chooseUpTo', { max: maxSelect });
  if (minSelect === maxSelect) return minSelect === 1 ? t('addons.chooseOne') : t('addons.chooseN', { min: minSelect });
  return t('addons.chooseRange', { min: minSelect, max: maxSelect });
}

// Motivo de inelegibilidade de promoção (lib/promotionEligibility.ts devolve o
// código + valores; o texto sai aqui, no idioma do app).
export type PromoReasonCode = 'already_used' | 'min_order' | 'no_eligible_items' | 'no_items_left' | 'no_discount';
export interface PromoReasonSource {
  reason: string | null;
  reasonCode?: PromoReasonCode;
  reasonParams?: { missing: string; minimum: string };
}
export function promotionReasonLabel(source: PromoReasonSource | null | undefined, t: Translate): string | null {
  if (!source) return null;
  switch (source.reasonCode) {
    case 'already_used': return t('promotions.reason.alreadyUsed');
    case 'min_order':
      return source.reasonParams ? t('promotions.min_amount_remaining', source.reasonParams) : source.reason;
    case 'no_eligible_items': return t('promotions.reason.noEligibleItems');
    case 'no_items_left': return t('promotions.reason.noItemsLeft');
    case 'no_discount': return t('promotions.reason.noDiscount');
    default: return source.reason;
  }
}
