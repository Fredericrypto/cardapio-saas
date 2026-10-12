// ISOLAMENTO ENTRE CONTAS (01/10, decisão final do Felipe): cada conta
// tem as SUAS seções de mesa, como Instagram/YouTube. Tudo que o app
// guarda no aparelho sobre mesa (assento, ponteiro da mesa ativa) é
// guardado POR IDENTIDADE: o id da conta logada, ou 'guest' pra quem não
// está logado. Trocar de conta no mesmo aparelho/aba nunca enxerga o que
// é da outra conta. (Só pra escolher a chave — quem decide acesso de
// verdade é o servidor, que também amarra o assento à conta.)
export const GUEST_IDENTITY = 'guest';

export function identityOf(customerToken?: string | null): string {
  if (!customerToken) return GUEST_IDENTITY;
  try {
    const part = customerToken.split('.')[1];
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const sub = JSON.parse(json)?.sub;
    return typeof sub === 'string' && sub ? sub : GUEST_IDENTITY;
  } catch {
    return GUEST_IDENTITY;
  }
}
