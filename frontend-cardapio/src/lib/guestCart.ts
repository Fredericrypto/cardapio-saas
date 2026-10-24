// Carrinho do CONVIDADO: lógica PURA (sem React) de merge, validação e armazenamento.
//
// Decisão B (24/10/2026): convidado navega, entra na mesa e monta carrinho, mas só
// pede logado. O carrinho dele precisa sobreviver ao login/cadastro (e a um reload no
// meio do caminho) SEM sobrescrever o que a conta já tinha salvo (P-20).
//
//  - Convidado: `sessionStorage` (vale só na aba; some ao fechar). Nunca `localStorage`:
//    é carrinho anônimo, não deve vazar para a próxima pessoa no aparelho.
//  - Promoções NUNCA são guardadas aqui (só itens): promoção é só para conta (D1/D3).
//  - Conta: continua em `localStorage` (cardapio_cart_<tenant>_<cliente>), no CartContext.
import type { CartItem } from '../types';

export const GUEST_CART_VERSION = 1;
/** Teto de segurança por linha. Protege contra lixo no storage e soma que estoura. */
export const MAX_LINE_QUANTITY = 999;
/** Teto de linhas lidas do storage (carrinho real tem poucas dezenas). */
export const MAX_GUEST_LINES = 200;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Chave por restaurante: o carrinho de convidado nunca cruza de um restaurante para outro. */
export function guestCartKey(tenantId: string): string {
  return `cardapio_guestcart_${tenantId}`;
}

/** sessionStorage, ou null se o navegador bloqueia (modo restrito, iframe, SSR). */
export function getGuestStorage(): StorageLike | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Linha válida de carrinho: chave, produto com id, quantidade inteira 1..MAX e opções em array. */
export function isValidCartLine(v: unknown): v is CartItem {
  if (!isRecord(v)) return false;
  if (typeof v.lineKey !== 'string' || v.lineKey === '') return false;
  if (!isRecord(v.product) || typeof v.product.id !== 'string' || v.product.id === '') return false;
  if (typeof v.quantity !== 'number' || !Number.isInteger(v.quantity) || v.quantity < 1 || v.quantity > MAX_LINE_QUANTITY) {
    return false;
  }
  return Array.isArray(v.selectedOptions);
}

/** Descarta linhas inválidas. Não muta a entrada. */
export function sanitizeCartItems(items: readonly unknown[]): CartItem[] {
  const out: CartItem[] = [];
  for (const item of items) if (isValidCartLine(item)) out.push(item);
  return out;
}

/**
 * Junta `incoming` (o que a pessoa montou como convidada) em `base` (o que a conta já
 * tinha salvo). Nunca sobrescreve:
 *  - linha nova → entra no fim, na ordem em que veio;
 *  - mesma linha (mesmo produto + mesmas opções) → soma as quantidades (limitada a
 *    MAX_LINE_QUANTITY), mantendo a posição da base e usando o produto/preços do
 *    `incoming`, que é o dado mais recente;
 *  - linha inválida (nos dois lados) é descartada;
 *  - não muta as entradas.
 */
export function mergeCartItems(base: readonly unknown[], incoming: readonly unknown[]): CartItem[] {
  const result: CartItem[] = [];
  const indexByKey = new Map<string, number>();
  for (const line of sanitizeCartItems(base)) {
    const at = indexByKey.get(line.lineKey);
    if (at === undefined) {
      indexByKey.set(line.lineKey, result.length);
      result.push({ ...line });
    } else {
      result[at] = { ...result[at], quantity: Math.min(result[at].quantity + line.quantity, MAX_LINE_QUANTITY) };
    }
  }
  for (const line of sanitizeCartItems(incoming)) {
    const at = indexByKey.get(line.lineKey);
    if (at === undefined) {
      indexByKey.set(line.lineKey, result.length);
      result.push({ ...line });
    } else {
      result[at] = {
        ...result[at],
        product: line.product,
        selectedOptions: line.selectedOptions,
        quantity: Math.min(result[at].quantity + line.quantity, MAX_LINE_QUANTITY),
      };
    }
  }
  return result;
}

export function serializeGuestCart(items: readonly CartItem[]): string {
  return JSON.stringify({ v: GUEST_CART_VERSION, items });
}

/** Lê o JSON salvo. Qualquer problema (nulo, quebrado, versão errada) vira carrinho vazio. */
export function parseGuestCart(raw: string | null | undefined): CartItem[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!isRecord(data) || data.v !== GUEST_CART_VERSION || !Array.isArray(data.items)) return [];
  return mergeCartItems([], data.items.slice(0, MAX_GUEST_LINES));
}

export function readGuestCart(storage: StorageLike | null, tenantId: string): CartItem[] {
  if (!storage) return [];
  try {
    return parseGuestCart(storage.getItem(guestCartKey(tenantId)));
  } catch {
    return [];
  }
}

/** Grava o carrinho do convidado; carrinho vazio remove a chave. Nunca lança. */
export function writeGuestCart(storage: StorageLike | null, tenantId: string, items: readonly CartItem[]): void {
  if (!storage) return;
  try {
    if (items.length === 0) storage.removeItem(guestCartKey(tenantId));
    else storage.setItem(guestCartKey(tenantId), serializeGuestCart(items));
  } catch {
    // Sem espaço/storage bloqueado: o carrinho continua em memória, só não sobrevive a reload.
  }
}

export function clearGuestCart(storage: StorageLike | null, tenantId: string): void {
  if (!storage) return;
  try {
    storage.removeItem(guestCartKey(tenantId));
  } catch {
    // Nada a limpar se o storage não responde.
  }
}
