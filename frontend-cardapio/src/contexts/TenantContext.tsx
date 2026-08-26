import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { fetchTenantBySlug } from '../lib/menu-api';
import type { Tenant } from '../types';

interface TenantContextValue {
  tenant: Tenant | null;
  isLoading: boolean;
  error: string | null;
  retry: () => void;
}

const TenantContext = createContext<TenantContextValue | null>(null);

// Busca o tenant (dados do restaurante) UMA VEZ por :slug e disponibiliza
// pra árvore inteira via Context.
//
// Bug real que isso corrige: antes, ~21 páginas/componentes diferentes
// buscavam o tenant cada um por conta própria (`useState` + `useEffect`
// duplicado em cada arquivo). Navegar entre 2-3 telas já disparava
// várias buscas idênticas do MESMO tenant ao mesmo tempo. Combinado com
// o mesmo padrão em `useCustomerAuth` (perfil do cliente buscado de
// forma independente em cada componente que precisava dele), isso
// esgotava o rate limit do backend em uso normal — sem precisar de
// nenhum loop de verdade — e QUALQUER falha nessa busca (ex: 429)
// disparava um redirecionamento de volta pro login em cada instância
// separadamente, o que parecia (e na prática se comportava como) um
// loop infinito.
export function TenantProvider({ children }: { children: ReactNode }) {
  const { slug } = useParams<{ slug: string }>();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetchTenantBySlug(slug)
      .then((data) => {
        if (!cancelled) setTenant(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err?.response?.data?.message || err?.message || 'Não foi possível carregar o restaurante.',
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, retryTick]);

  const retry = useCallback(() => setRetryTick((t) => t + 1), []);

  return (
    <TenantContext.Provider value={{ tenant, isLoading, error, retry }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant precisa estar dentro de um TenantProvider');
  return ctx;
}
