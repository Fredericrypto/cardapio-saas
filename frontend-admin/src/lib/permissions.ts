// Espelho (somente para a UI) da avaliação de permissões do backend
// (backend/src/common/permissions/permission-matcher.ts). Esconder um botão
// aqui NÃO é segurança — o servidor revalida toda requisição.

export const WILDCARD = '*';

export function permissionMatches(granted: string, required: string): boolean {
  if (granted === WILDCARD) return true;
  if (granted === required) return true;
  if (granted.endsWith(':*')) {
    const prefix = granted.slice(0, -1);
    return required.length > prefix.length && required.startsWith(prefix);
  }
  return false;
}

// Várias exigidas = TODAS.
export function hasPermission(granted: readonly string[], required: string | readonly string[]): boolean {
  const list = typeof required === 'string' ? [required] : required;
  return list.every((r) => granted.some((g) => permissionMatches(g, r)));
}

export function canGrant(actor: readonly string[], target: string): boolean {
  if (actor.includes(WILDCARD)) return true;
  if (target === WILDCARD) return false;
  if (target.endsWith(':*')) return actor.includes(target);
  return hasPermission(actor, target);
}
