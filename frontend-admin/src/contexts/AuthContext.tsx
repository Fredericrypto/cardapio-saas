import { createContext, useContext, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import type { Admin, Tenant } from '../types';

interface AuthContextValue {
  admin: Admin | null;
  tenant: Tenant | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  updateTenant: (tenant: Tenant) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

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

  async function login(email: string, password: string) {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('admin_token', data.accessToken);
    localStorage.setItem('admin_data', JSON.stringify(data.admin));
    localStorage.setItem('tenant_data', JSON.stringify(data.tenant));
    setAdmin(data.admin);
    setTenant(data.tenant);
  }

  function logout() {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_data');
    localStorage.removeItem('tenant_data');
    setAdmin(null);
    setTenant(null);
  }

  // Chamado depois de salvar mudanças no backend (ex: SettingsPage), pra
  // manter o localStorage e o estado em memória sincronizados sem precisar
  // de reload de página nem de um novo login.
  function updateTenant(updatedTenant: Tenant) {
    localStorage.setItem('tenant_data', JSON.stringify(updatedTenant));
    setTenant(updatedTenant);
  }

  return (
    <AuthContext.Provider
      value={{ admin, tenant, isAuthenticated: Boolean(admin), login, logout, updateTenant }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth precisa ser usado dentro de um AuthProvider');
  }
  return context;
}
