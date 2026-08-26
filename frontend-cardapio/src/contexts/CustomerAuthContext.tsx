import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  registerCustomer,
  loginCustomer,
  fetchMyCustomerProfile,
  type CustomerProfile,
} from '../lib/customer-api';
import { useCart } from './CartContext';
import { useTenant } from './TenantContext';

// Cliente é POR RESTAURANTE (decisão de produto: cada restaurante é uma
// ilha isolada, sem conta cruzando vários estabelecimentos).
function storageKeyFor(tenantId: string): string {
  return `cardapio_customer_token_${tenantId}`;
}

// Evento pra sincronizar ENTRE ABAS (o `storage` event do browser não
// dispara na mesma aba que fez a mudança — por isso ainda existe esse
// evento próprio pra notificar a aba atual, embora agora só exista UMA
// instância desse estado por aba, então o cross-instance sync que esse
// evento resolvia antigamente já não é mais necessário dentro da mesma
// aba).
const AUTH_CHANGED_EVENT = 'cardapio:customer-auth-changed';

function broadcastAuthChanged(tenantId: string) {
  window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT, { detail: { tenantId } }));
}

interface CustomerAuthContextValue {
  customer: CustomerProfile | null;
  token: string | null;
  isLoading: boolean;
  // true quando existe um token mas a última tentativa de confirmar a
  // sessão falhou por motivo QUE NÃO é "sessão inválida" (429, 5xx,
  // rede) — sinal pra quem consome o hook: "não bounce pro login, isso
  // não significa deslogado, só não deu pra confirmar agora".
  authError: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; password: string; name: string; phone?: string }) => Promise<void>;
  logout: () => void;
  retry: () => void;
  setCustomer: (customer: CustomerProfile) => void;
}

const CustomerAuthContext = createContext<CustomerAuthContextValue | null>(null);

// Busca e mantém a sessão do cliente UMA VEZ por restaurante, pra árvore
// inteira — não mais uma cópia de estado (e uma requisição `/auth/me`)
// por componente que precisa saber se o cliente está logado.
//
// Bug real que isso corrige: `useCustomerAuth` era um hook comum, não
// ligado a Context — cada chamada (`RequireCustomerAuth`,
// `ReviewPromptProvider`, `BottomNav`, e a própria página, ~4+ lugares
// ao mesmo tempo numa única tela) criava sua PRÓPRIA cópia de estado e
// disparava sua PRÓPRIA requisição `/customers/:tenantId/auth/me`. Só
// de navegar entre 2-3 telas isso gerava dezenas de chamadas idênticas
// — o que esgotava o rate limit do backend em uso normal, sem precisar
// de nenhum loop de render de verdade. Combinado com qualquer falha
// dessas buscas mandando de volta pro login (em CADA instância,
// separadamente), o resultado observado era indistinguível de um loop
// infinito. Com Context, existe exatamente UM fetch de perfil por
// sessão de navegação.
export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const { tenant } = useTenant();
  const tenantId = tenant?.id;
  const { clearCart } = useCart();
  const clearCartRef = useRef(clearCart);
  clearCartRef.current = clearCart;

  const [token, setToken] = useState<string | null>(() =>
    tenantId ? localStorage.getItem(storageKeyFor(tenantId)) : null,
  );
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    function resync() {
      setToken(tenantId ? localStorage.getItem(storageKeyFor(tenantId)) : null);
    }
    resync();
    window.addEventListener(AUTH_CHANGED_EVENT, resync);
    window.addEventListener('storage', resync);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, resync);
      window.removeEventListener('storage', resync);
    };
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId || !token) {
      setCustomer(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setAuthError(false);
    fetchMyCustomerProfile(tenantId, token)
      .then((profile) => {
        if (!cancelled) setCustomer(profile);
      })
      .catch((err) => {
        if (cancelled) return;
        // CRÍTICO: só um 401 de verdade (token realmente
        // inválido/expirado) significa "desloga". Qualquer outro erro —
        // 429 (rate limit), 5xx, timeout, rede caindo um instante — NÃO
        // significa que a sessão é inválida, só que não deu pra
        // confirmar ela agora. Ver `RequireCustomerAuth` pra como isso é
        // usado (não navega pro login nesse caso).
        const status = err?.response?.status;
        if (status === 401) {
          clearCartRef.current();
          localStorage.removeItem(storageKeyFor(tenantId));
          setToken(null);
          setCustomer(null);
          broadcastAuthChanged(tenantId);
        } else {
          setAuthError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, token, retryTick]);

  async function login(email: string, password: string) {
    if (!tenantId) return;
    const result = await loginCustomer(tenantId, { email, password });
    clearCart();
    localStorage.setItem(storageKeyFor(tenantId), result.accessToken);
    setToken(result.accessToken);
    setCustomer(result.customer);
    broadcastAuthChanged(tenantId);
  }

  async function register(data: { email: string; password: string; name: string; phone?: string }) {
    if (!tenantId) return;
    const result = await registerCustomer(tenantId, data);
    clearCart();
    localStorage.setItem(storageKeyFor(tenantId), result.accessToken);
    setToken(result.accessToken);
    setCustomer(result.customer);
    broadcastAuthChanged(tenantId);
  }

  function logout() {
    if (!tenantId) return;
    clearCart();
    localStorage.removeItem(storageKeyFor(tenantId));
    setToken(null);
    setCustomer(null);
    broadcastAuthChanged(tenantId);
  }

  function retry() {
    setRetryTick((t) => t + 1);
  }

  return (
    <CustomerAuthContext.Provider
      value={{ customer, token, isLoading, authError, login, register, logout, retry, setCustomer }}
    >
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useCustomerAuth(): CustomerAuthContextValue {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) throw new Error('useCustomerAuth precisa estar dentro de um CustomerAuthProvider');
  return ctx;
}
