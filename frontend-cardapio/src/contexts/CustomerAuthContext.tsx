import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  registerCustomer,
  loginCustomer,
  fetchMyCustomerProfile,
  type CustomerProfile,
} from '../lib/customer-api';
import { useCart } from './CartContext';
import { useTenant } from './TenantContext';
import { isTransientError } from '../lib/api';
import {
  clearStoredTokenIfMatches,
  clearStoredTokens,
  persistToken,
  readStoredToken,
  type SessionOptions,
} from '../lib/customerSession';

// Cliente é POR RESTAURANTE (decisão de produto: cada restaurante é uma
// ilha isolada, sem conta cruzando vários estabelecimentos).
// Token que nenhum storage aceitou (modo privado restrito, cota cheia): vale so ate recarregar a pagina.
// Sem isso o resync leria `null` do storage e deslogaria o cliente logo apos o login.
type MemoryToken = { tenantId: string; token: string } | null;

// Token atual: storage (lib/customerSession) primeiro; memoria so como ultimo recurso.
function resolveToken(tenantId: string, memory: { current: MemoryToken }): string | null {
  const stored = readStoredToken(tenantId);
  if (stored) return stored;
  const m = memory.current;
  return m && m.tenantId === tenantId ? m.token : null;
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
  // true = a falha ao confirmar a sessão foi passageira (servidor dormindo/instável).
  authErrorTransient: boolean;
  login: (email: string, password: string, options?: SessionOptions) => Promise<void>;
  register: (
    data: { email: string; password: string; name: string; phone?: string },
    options?: SessionOptions,
  ) => Promise<void>;
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
  const { tenant, isLoading: isTenantLoading } = useTenant();
  const tenantId = tenant?.id;
  const { clearCart, setCartOwner } = useCart();
  const clearCartRef = useRef(clearCart);
  clearCartRef.current = clearCart;
  const memoryTokenRef = useRef<MemoryToken>(null);

  const [token, setToken] = useState<string | null>(() =>
    tenantId ? resolveToken(tenantId, memoryTokenRef) : null,
  );
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [authErrorTransient, setAuthErrorTransient] = useState(true);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    function resync() {
      setToken(tenantId ? resolveToken(tenantId, memoryTokenRef) : null);
    }
    resync();
    window.addEventListener(AUTH_CHANGED_EVENT, resync);
    window.addEventListener('storage', resync);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, resync);
      window.removeEventListener('storage', resync);
    };
  }, [tenantId]);

  // Único gatilho de "de quem é o carrinho agora" — dispara toda vez
  // que tenant OU cliente confirmado mudam (login, logout, troca de
  // conta, token confirmado depois de um reload). Nunca é o inverso
  // (CartContext nunca lê tenant/cliente sozinho) — ver comentário
  // grande em CartContext.setCartOwner pro motivo de ser só um sentido.
  useEffect(() => {
    setCartOwner(tenantId ?? null, customer?.id ?? null);
  }, [tenantId, customer?.id, setCartOwner]);

  useEffect(() => {
    // CAUSA RAIZ CORRIGIDA (essa era a de verdade, não só a do
    // useTableSession): `TenantProvider` nunca segura os filhos
    // esperando o tenant carregar — eles montam de cara com
    // `tenant = null`. Isso significa que, no primeiro instante,
    // `tenantId` aqui é `undefined`, e esse efeito caía direto no
    // `if (!tenantId || !token)` e marcava `isLoading = false`
    // IMEDIATAMENTE — mesmo quando o cliente estava logado de verdade
    // (só ainda não deu tempo de saber, porque sem tenantId nem dá pra
    // saber QUAL chave do localStorage checar). Um instante depois, o
    // tenant carregava, o token certo era lido, e `isLoading` voltava
    // pra `true` só então — só que qualquer código que tivesse decidido
    // algo com base naquele `isLoading = false` mentiroso (ex:
    // useTableSession criando a sessão da mesa como convidado) já tinha
    // agido tarde demais. Agora esse efeito não decide NADA enquanto o
    // tenant ainda não é conhecido — fica genuinamente "carregando" até
    // então.
    if (isTenantLoading) return;
    // Reload: o tenant acabou de chegar e o estado `token` ainda nao leu o localStorage
    // (o resync roda no mesmo commit, mas este efeito ve o token antigo = null). Se existe
    // token salvo, NAO declarar "deslogado": manter carregando ate o token ser lido, senao
    // o RequireCustomerAuth manda pro login por ~1s antes de confirmar a sessao.
    if (tenantId && !token && resolveToken(tenantId, memoryTokenRef)) {
      setIsLoading(true);
      return;
    }
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
          // Compare-and-delete: so apaga o token que o servidor rejeitou (nunca um mais novo de outra aba).
          clearStoredTokenIfMatches(tenantId, token);
          if (memoryTokenRef.current?.token === token) memoryTokenRef.current = null;
          setToken(resolveToken(tenantId, memoryTokenRef));
          setCustomer(null);
          broadcastAuthChanged(tenantId);
        } else {
          setAuthErrorTransient(isTransientError(err));
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
  }, [tenantId, token, retryTick, isTenantLoading]);

  // Guarda a sessao conforme "Lembrar de mim" (ver lib/customerSession). Padrao true = comportamento anterior.
  function storeSession(id: string, accessToken: string, remember: boolean) {
    const target = persistToken(id, accessToken, remember);
    memoryTokenRef.current = target === 'memory' ? { tenantId: id, token: accessToken } : null;
  }

  async function login(email: string, password: string, options?: SessionOptions) {
    if (!tenantId) return;
    const remember = options?.remember ?? true;
    const result = await loginCustomer(tenantId, { email, password });
    // NUNCA limpar o carrinho aqui — ver o comentário grande em
    // CartContext.setCartOwner. Um convidado que já tinha item no
    // carrinho e decide logar no meio da visita continua com o pedido
    // dele; só quem troca de identidade ativamente (logout) precisa
    // dessa limpeza, pra não vazar carrinho entre contas no mesmo
    // aparelho.
    storeSession(tenantId, result.accessToken, remember);
    setToken(result.accessToken);
    setCustomer(result.customer);
    broadcastAuthChanged(tenantId);
  }

  async function register(
    data: { email: string; password: string; name: string; phone?: string },
    options?: SessionOptions,
  ) {
    if (!tenantId) return;
    const remember = options?.remember ?? true;
    const result = await registerCustomer(tenantId, data);
    // Mesmo raciocínio de `login` acima — nunca limpar aqui.
    storeSession(tenantId, result.accessToken, remember);
    setToken(result.accessToken);
    setCustomer(result.customer);
    broadcastAuthChanged(tenantId);
  }

  function logout() {
    if (!tenantId) return;
    clearCart();
    clearStoredTokens(tenantId);
    memoryTokenRef.current = null;
    setToken(null);
    setCustomer(null);
    broadcastAuthChanged(tenantId);
  }

  function retry() {
    setRetryTick((t) => t + 1);
  }

  return (
    <CustomerAuthContext.Provider
      value={{ customer, token, isLoading, authError, authErrorTransient, login, register, logout, retry, setCustomer }}
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
