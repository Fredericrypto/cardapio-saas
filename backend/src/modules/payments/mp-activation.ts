// Quando o pagamento ONLINE (Mercado Pago) está ativo para um restaurante.
// Função PURA, usada pelo backend (decidir como cobrar) e exposta como flags
// públicas (o cardápio mostra o texto certo de Pix/cartão).
//
// Regra: precisa do access token E do segredo do webhook. Sem o segredo, o
// webhook é rejeitado (assinatura não verificável) e a confirmação ficaria
// só no polling — não é seguro para dinheiro real, então o online não liga.
// Cartão ainda exige a chave pública (usada pelo SDK no navegador).

export interface MpConfigPresence {
  hasAccessToken: boolean;
  hasWebhookSecret: boolean;
  hasPublicKey: boolean;
}

export function isPixOnlineActive(c: MpConfigPresence): boolean {
  return c.hasAccessToken && c.hasWebhookSecret;
}

export function isCardOnlineActive(c: MpConfigPresence): boolean {
  return c.hasAccessToken && c.hasWebhookSecret && c.hasPublicKey;
}

/** Mensagem de erro se a configuração salva é inconsistente; null se está ok. */
export function mpConfigError(c: MpConfigPresence): string | null {
  if (c.hasAccessToken && !c.hasWebhookSecret) {
    return 'Informe também o segredo do webhook do Mercado Pago: sem ele os pagamentos online não são ativados.';
  }
  if (c.hasPublicKey && !c.hasAccessToken) {
    return 'Informe também o access token do Mercado Pago para usar a chave pública.';
  }
  return null;
}
