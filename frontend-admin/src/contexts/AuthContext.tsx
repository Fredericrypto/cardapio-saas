import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { hasPermission as evaluate } from '../lib/permissions';
import type { Admin, Tenant } from '../types';

interface AuthContextValue {
  admin: Admin | null;
  tenant: Tenant | null;
  isAuthenticated: boolean;
  // false enquanto o primeiro GET /auth/me da sessão não respondeu (evita
  // piscar "acesso negado" com permissões de uma sessão antiga em cache).
  permissionsReady: boolean;
  permissions: readonly string[];
  isWildcard: boolean;
  // Várias permissões = TODAS. Só reflete a UI; o servidor é quem autoriza.
  hasPermission: (required: string | readonly string[]) => boolean;
  refreshAccess: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  updateTenant: (tenant: Tenant) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const EMPTY: readonly string[] = [];
const REFRESH_INTERVAL_MS = 60_000;

function loadFromStorage<T>(key: string): T | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<Admin | null>(() => loadFromStorage('admin_data'));
  const [tenant, setTenant] = useState<Tenant | null>(() => loadFromStorage('tenant_data'));
  const [permissionsReady, setPermissionsReady] = useState(false);
  const isAuthenticated = Boolean(admin);

  async function login(email: string, password: string) {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('admin_token', data.accessToken);
    localStorage.setItem('admin_data', JSON.stringify(data.admin));
    localStorage.setItem('tenant_data', JSON.stringify(data.tenant));
    setAdmin(data.admin);
    setTenant(data.tenant);
    setPermissionsReady(true); // o login já devolve o cargo e as permissões
  }

  function logout() {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_data');
    localStorage.removeItem('tenant_data');
    setAdmin(null);
    setTenant(null);
    setPermissionsReady(false);
  }

  // Chamado depois de salvar mudanças no backend (ex: SettingsPage), pra
  // manter o localStorage e o estado em memória sincronizados sem precisar
  // de reload de página nem de um novo login.
  function updateTenant(updatedTenant: Tenant) {
    localStorage.setItem('tenant_data', JSON.stringify(updatedTenant));
    setTenant(updatedTenant);
  }

  // Busca cargo/permissões ATUAIS no servidor. Cobre: sessões antigas (sem
  // permissões no localStorage) e mudança de cargo feita por outro admin.
  const refreshAccess = useCallback(async () => {
    try {
      const { data } = await api.get<Admin>('/auth/me');
      setAdmin((prev) => {
        if (prev && JSON.stringify(prev) === JSON.stringify(data)) return prev;
        localStorage.setItem('admin_data', JSON.stringify(data));
        return data;
      });
    } catch {
      // 401 → o interceptor do axios já leva ao login. Outros erros (rede):
      // mantém o último estado conhecido; o backend segue autorizando de verdade.
    } finally {
      setPermissionsReady(true);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    void refreshAccess();
    const interval = setInterval(() => void refreshAccess(), REFRESH_INTERVAL_MS);
    const onFocus = () => void refreshAccess();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [isAuthenticated, refreshAccess]);

  const permissions = admin?.permissions ?? EMPTY;
  const value = useMemo<AuthContextValue>(
    () => ({
      admin,
      tenant,
      isAuthenticated,
      permissionsReady,
      permissions,
      isWildcard: permissions.includes('*'),
      hasPermission: (required) => evaluate(permissions, required),
      refreshAccess,
      login,
      logout,
      updateTenant,
    }),
    // login/logout/updateTenant só usam setters estáveis.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [admin, tenant, isAuthenticated, permissionsReady, permissions, refreshAccess],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth precisa ser usado dentro de um AuthProvider');
  }
  return context;
}
