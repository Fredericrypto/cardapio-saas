// Dono do carrinho e transição entre donos: lógica PURA (sem React, sem storage direto).
// O CartContext só executa o resultado; toda a decisão "o que acontece com os itens
// quando a identidade muda" mora aqui e é coberta por teste.
import type { CartItem } from '../types';
import { mergeCartItems, sanitizeCartItems } from './guestCart';

export type CartOwner =
  | { kind: 'none' }
  | { kind: 'guest'; tenantId: string }
  | { kind: 'account'; tenantId: string; customerId: string };

export function resolveCartOwner(tenantId: string | null, customerId: string | null): CartOwner {
  if (!tenantId) return { kind: 'none' };
  return customerId ? { kind: 'account', tenantId, customerId } : { kind: 'guest', tenantId };
}

export function sameCartOwner(a: CartOwner, b: CartOwner): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'none' || b.kind === 'none') return true;
  if (a.tenantId !== b.tenantId) return false;
  if (a.kind === 'account' && b.kind === 'account') return a.customerId === b.customerId;
  return true;
}

export interface OwnerTransitionDeps {
  /** Itens que estão na memória agora (do dono anterior). */
  memoryItems: readonly CartItem[];
  /** Carrinho salvo da conta que está assumindo (vazio se não há nada). */
  loadAccountItems: () => readonly CartItem[];
  /** Carrinho de convidado salvo na aba, por restaurante. */
  loadGuestItems: (tenantId: string) => readonly CartItem[];
}

export interface OwnerTransition {
  items: CartItem[];
  /** Restaurante cujo carrinho de convidado já foi absorvido pela conta e deve ser apagado. */
  discardGuestCartOf: string | null;
}

/**
 * Regras (as mesmas que o CartContext executa):
 *  - nenhum dono → carrinho vazio;
 *  - conta → conta: troca de identidade, o carrinho do dono anterior NUNCA passa adiante;
 *  - conta → convidado (logout): o que estava na memória era da conta e some; volta só o
 *    carrinho de convidado salvo na aba;
 *  - convidado/nada → conta (login ou cadastro): os itens montados como convidado (memória,
 *    ou o salvo na aba se a memória estiver vazia, ex.: reload no meio) são SOMADOS ao que a
 *    conta já tinha, e o carrinho de convidado é apagado;
 *  - convidado de outro restaurante → conta: não carrega nada dele;
 *  - nada → convidado: junta o salvo na aba com o que já estiver na memória.
 */
export function resolveOwnerTransition(prev: CartOwner, next: CartOwner, deps: OwnerTransitionDeps): OwnerTransition {
  if (next.kind === 'none') return { items: [], discardGuestCartOf: null };

  if (next.kind === 'guest') {
    const stored = sanitizeCartItems(deps.loadGuestItems(next.tenantId));
    if (prev.kind === 'none' && deps.memoryItems.length > 0) {
      return { items: mergeCartItems(stored, deps.memoryItems), discardGuestCartOf: null };
    }
    return { items: stored, discardGuestCartOf: null };
  }

  const account = deps.loadAccountItems();
  if (prev.kind === 'account') {
    return { items: sanitizeCartItems(account), discardGuestCartOf: null };
  }
  if (prev.kind === 'guest' && prev.tenantId !== next.tenantId) {
    return { items: sanitizeCartItems(account), discardGuestCartOf: null };
  }
  const guestSource = deps.memoryItems.length > 0 ? deps.memoryItems : deps.loadGuestItems(next.tenantId);
  return { items: mergeCartItems(account, guestSource), discardGuestCartOf: next.tenantId };
}
