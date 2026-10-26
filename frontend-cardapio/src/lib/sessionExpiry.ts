// Sessão rejeitada pelo servidor no meio de uma ação (ex.: criar pedido com token vencido).
// Decide o que fazer com o estado de autenticação SEM nunca derrubar um token mais novo:
//  - `rejectedToken` é o token que foi ENVIADO na requisição que o servidor recusou;
//  - `currentToken` é o que está valendo agora (storage/memória), já depois da remoção
//    compare-and-delete do rejeitado.
// Se agora existe um token DIFERENTE do rejeitado, outra aba/login já trouxe um mais novo:
// adota-o (o efeito de perfil revalida) e não desloga ninguém. Senão, encerra a sessão local.
export type SessionExpiryPlan = { kind: 'adopt'; token: string } | { kind: 'clear' };

export function planSessionExpiry(rejectedToken: string, currentToken: string | null): SessionExpiryPlan {
  if (currentToken && currentToken !== rejectedToken) return { kind: 'adopt', token: currentToken };
  return { kind: 'clear' };
}
