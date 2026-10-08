// Lógica PURA de avaliação de permissões (sem Nest, sem banco) — fica isolada
// para ser testada exaustivamente (test/rbac-audit.ts) e reutilizada pelo
// PermissionsGuard e pelas checagens anti-escalada de privilégios.
//
// Formato do slug:  "*"  |  "modulo:acao"  |  "modulo:*"
//   *          → acesso universal (wildcard total)
//   stock:*    → qualquer ação do módulo "stock" (sub-wildcard)
//   stock:view → permissão exata

export const WILDCARD = '*';

const SLUG_RE = /^(\*|[a-z][a-z0-9-]*:(\*|[a-z][a-z0-9-]*))$/;

export function isValidPermissionSlug(slug: unknown): slug is string {
  return typeof slug === 'string' && slug.length <= 80 && SLUG_RE.test(slug);
}

// "granted" (uma permissão que o usuário POSSUI) satisfaz "required" (a que a
// rota EXIGE)? Casamento estrito: nunca por substring/prefixo parcial.
export function permissionMatches(granted: string, required: string): boolean {
  if (granted === WILDCARD) return true;
  if (granted === required) return true;
  if (granted.endsWith(':*')) {
    const prefix = granted.slice(0, -1); // "stock:"
    // Exige ao menos um caractere depois do prefixo, e que a exigida seja do
    // mesmo módulo. "stock:*" NÃO cobre "stockroom:view" (prefixo inclui ':').
    return required.length > prefix.length && required.startsWith(prefix);
  }
  return false;
}

// A rota exige `required`: o conjunto do usuário concede?
export function hasPermission(granted: readonly string[], required: string): boolean {
  return granted.some((g) => permissionMatches(g, required));
}

// Várias permissões exigidas = TODAS (menor privilégio por padrão).
export function hasAllPermissions(granted: readonly string[], required: readonly string[]): boolean {
  return required.every((r) => hasPermission(granted, r));
}

// O usuário pode CONCEDER `target` a um cargo? Regra anti-escalada:
//  - só quem tem "*" concede "*";
//  - só quem tem "mod:*" (ou "*") concede "mod:*";
//  - permissão exata: basta que o conjunto dele a cubra.
export function canGrant(actorPermissions: readonly string[], target: string): boolean {
  if (actorPermissions.includes(WILDCARD)) return true;
  if (target === WILDCARD) return false;
  if (target.endsWith(':*')) return actorPermissions.includes(target);
  return hasPermission(actorPermissions, target);
}

export function canGrantAll(actorPermissions: readonly string[], targets: readonly string[]): boolean {
  return targets.every((t) => canGrant(actorPermissions, t));
}

export function isWildcardHolder(permissions: readonly string[]): boolean {
  return permissions.includes(WILDCARD);
}
