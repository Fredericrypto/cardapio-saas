import { useAuth } from '../contexts/AuthContext';

// true se o usuário logado tem a(s) permissão(ões) — várias = TODAS.
export function usePermission(required: string | readonly string[]): boolean {
  const { hasPermission, permissionsReady } = useAuth();
  return permissionsReady && hasPermission(required);
}

export function usePermissions() {
  const { permissions, isWildcard, hasPermission, permissionsReady } = useAuth();
  return { permissions, isWildcard, can: hasPermission, ready: permissionsReady };
}
