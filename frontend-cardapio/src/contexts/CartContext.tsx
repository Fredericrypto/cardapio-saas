import { createContext, useContext, useState, useMemo, useCallback, useRef, useEffect, type ReactNode } from 'react';
import type { CartItem, Product, SelectedCartOption } from '../types';
// A chave da linha (produto + adicionais) mora em lib/cartLines.ts: o Modo
// Promoção precisa calcular a MESMA chave para achar a linha no carrinho.
import { buildLineKey } from '../lib/cartLines';
import { clearGuestCart, getGuestStorage, readGuestCart, writeGuestCart } from '../lib/guestCart';
import { resolveCartOwner, resolveOwnerTransition, sameCartOwner, type CartOwner } from '../lib/cartOwner';
import type { LoginPromptReason } from '../lib/loginPrompt';
import {
  EMPTY_PROMO_STATE,
  parsePersistedCart,
  promoActivate,
  promoApplyContext,
  promoClearActive,
  promoClearAll,
  promoHydrate,
  promoPrune,
  promoSelectedIds,
  promoToggle,
  serializeCart,
  type PromoContext,
  type PromoEntry,
  type PromoState,
} from '../lib/cartPromotions';

interface PersistedCart {
  items: CartItem[];
  remembered: PromoEntry[];
  legacy: string[];
}

// Chave do localStorage é SEMPRE tenant+cliente juntos, nunca um sozinho
// — é isso que impede o carrinho de vazar entre restaurantes diferentes
// OU entre contas diferentes no mesmo aparelho (irmãos usando o mesmo
// celular, por exemplo). Sem cliente logado (owner null), não existe
// chave — nada é persistido, carrinho fica só em memória, igual sempre
// foi.
function cartStorageKey(tenantId: string, customerId: string): string {
  return `cardapio_cart_${tenantId}_${customerId}`;
}

// Lê o carrinho salvo (formato v2 ou o antigo). Promoções NUNCA voltam como
// ativas daqui: só como `remembered`/`legacy` (intenção), ver lib/cartPromotions.
function loadPersistedCart(key: string): PersistedCart | null {
  try {
    const parsed = parsePersistedCart(localStorage.getItem(key));
    if (!parsed) return null;
    return { items: parsed.items as CartItem[], remembered: parsed.remembered, legacy: parsed.legacy };
  } catch {
    return null;
  }
}

// Por que a ação precisa de conta: o app confirma com a pessoa e a leva ao login, com retorno.
export type LoginIntentReason = LoginPromptReason;
export interface LoginIntent {
  reason: LoginIntentReason;
}

interface CartContextValue {
  items: CartItem[];
  addItem: (product: Product, selectedOptions?: SelectedCartOption[], quantity?: number) => void;
  increaseItem: (lineKey: string) => void;
  decreaseItem: (lineKey: string) => void;
  removeItem: (lineKey: string) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
  // Promoções que o CLIENTE escolheu usar (igual iFood: cupom é
  // aplicado por escolha, nunca sozinho) — DERIVADO das entradas ativas
  // (memória) que casam com o contexto atual {scope, locationId}; nunca
  // lido do disco (P-01). Pode ser MAIS DE UMA ao
  // mesmo tempo (ex: um cupom pro burger + outro pra coca-cola), desde
  // que não disputem os mesmos itens (ver lib/promotionEligibility.ts,
  // que reparte o carrinho entre elas na mesma ordem da seleção — igual
  // o backend faz de verdade em PromotionsService.validateSelectedPromotions).
  // Array vazio = nenhuma escolhida.
  selectedPromotionIds: string[];
  // Devolve false quando NÃO aplicou (convidado: abriu o pedido de login) — a tela não deve navegar.
  togglePromotion: (id: string) => boolean;
  // Idempotente (ao contrário do toggle): garante que a promoção está
  // selecionada. Usado pelo Modo Promoção, que não pode desligar sem querer
  // uma promoção já ativa só por reabrir a tela.
  // Também devolve false quando bloqueado por falta de conta (ver togglePromotion).
  selectPromotion: (id: string) => boolean;
  clearSelectedPromotions: () => void;
  // Só INTENÇÃO (disco, até 10): alimenta o aviso "Promoção disponível" do
  // Carrinho. Nunca ativa nada sozinha; reativar exige selectPromotion.
  rememberedPromotions: PromoEntry[];
  // Contexto atual publicado pelas telas ({scope: 'mesa'|'geral', locationId}).
  promoContext: PromoContext | null;
  // Cada tela que conhece a unidade ativa publica o contexto (hook
  // useCartPromotionContext). Contexto diferente do anterior => ativas
  // descartadas da memória, lembradas permanecem.
  setPromoContext: (ctx: PromoContext) => void;
  // Poda lembradas/ativas inválidas DO CONTEXTO da lista carregada. Passe null
  // quando a busca falhou: nunca poda.
  prunePromotions: (ctx: PromoContext, validPromotionIds: string[] | null) => void;
  // Chamado de dentro de CustomerAuthContext toda vez que tenant/cliente
  // logado mudam (login, logout, troca de conta, troca de restaurante).
  // NUNCA chamar isso de qualquer outro lugar — é o que garante que
  // persistência de carrinho nunca cruza fronteira de identidade. Ver
  // comentário grande logo abaixo, dentro do Provider.
  setCartOwner: (tenantId: string | null, customerId: string | null) => void;
  // Ação que exige conta (fazer o pedido, usar promoção) tentada por um CONVIDADO.
  // O modal de login (fase 3) lê isso, confirma e leva ao login com retorno.
  loginIntent: LoginIntent | null;
  requestLogin: (reason: LoginIntentReason) => void;
  dismissLoginIntent: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  // Espelha `items` em ref pra `setCartOwner` (useCallback([]), sem
  // `items` nas deps de propósito — ver comentário grande logo abaixo)
  // conseguir ler o carrinho ATUAL na hora de decidir se carrega o que
  // tinha salvo ou mantém o que já está em mãos.
  const itemsRef = useRef<CartItem[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  // Estado das promoções (ver lib/cartPromotions): ativas só em memória,
  // lembradas em disco. `selectedPromotionIds` é derivado, não é fonte da verdade.
  const [promo, setPromo] = useState<PromoState>(EMPTY_PROMO_STATE);
  const selectedPromotionIds = useMemo(() => promoSelectedIds(promo), [promo.ctx, promo.active]); // eslint-disable-line react-hooks/exhaustive-deps
  // Dono atual do carrinho (chave de storage já montada, ou null se
  // ninguém logado ainda) — em ref porque só é lido dentro de
  // callbacks/efeitos, nunca precisa disparar re-render sozinho.
  const ownerKeyRef = useRef<string | null>(null);
  // Dono atual de forma estruturada (nenhum / convidado de um restaurante / conta).
  // `ownerKeyRef` continua sendo a chave do localStorage da CONTA (null para convidado).
  const ownerRef = useRef<CartOwner>({ kind: 'none' });
  const [loginIntent, setLoginIntent] = useState<LoginIntent | null>(null);

  // IMPORTANTE: todas as funções aqui embaixo são `useCallback` com
  // array de dependências vazio de propósito — nunca tirar isso.
  //
  // Motivo (bug real, já mordeu): antes, essas eram funções normais
  // dentro do corpo do componente, recriadas a cada render do
  // CartProvider. Isso por si só é barato, MAS `clearCart` é passado
  // via `useCart()` pra fora e usado como dependência de efeito em
  // outros hooks (ex: `useCustomerAuth`, no efeito que busca o perfil
  // do cliente). Toda vez que `clearCart()` era chamado, o
  // `setItems([])` criava um array novo (mesmo o carrinho já estando
  // vazio) e forçava um re-render do CartProvider — o que gerava uma
  // nova referência de `clearCart` — o que disparava de novo o efeito
  // que a usa como dependência — que, no caminho de erro, chama
  // `clearCart()` de novo — fechando um loop infinito de re-render +
  // refetch. Foi exatamente a causa do "login pisca e fica em loading
  // infinito" relatado. Com `useCallback([])`, a identidade dessas
  // funções fica estável entre renders (os setters do `useState` já
  // são estáveis por garantia do React), e o loop não tem como
  // começar.
  const addItem = useCallback(
    (product: Product, selectedOptions: SelectedCartOption[] = [], quantity: number = 1) => {
      if (product.isAvailable === false) return; // item indisponível nunca entra no carrinho
      const lineKey = buildLineKey(product.id, selectedOptions);
      setItems((prev) => {
        const existing = prev.find((item) => item.lineKey === lineKey);
        if (existing) {
          return prev.map((item) =>
            item.lineKey === lineKey ? { ...item, quantity: item.quantity + quantity } : item,
          );
        }
        return [...prev, { lineKey, product, quantity, selectedOptions }];
      });
    },
    [],
  );

  const increaseItem = useCallback((lineKey: string) => {
    setItems((prev) =>
      prev.map((item) => (item.lineKey === lineKey ? { ...item, quantity: item.quantity + 1 } : item)),
    );
  }, []);

  const decreaseItem = useCallback((lineKey: string) => {
    setItems((prev) =>
      prev
        .map((item) => (item.lineKey === lineKey ? { ...item, quantity: item.quantity - 1 } : item))
        .filter((item) => item.quantity > 0),
    );
  }, []);

  const removeItem = useCallback((lineKey: string) => {
    setItems((prev) => prev.filter((item) => item.lineKey !== lineKey));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    setPromo((s) => promoClearAll(s));
    // Limpa também o que estava salvo pro dono ATUAL (antes de trocar
    // de identidade) — sem isso, deslogar e logar com OUTRA conta no
    // mesmo aparelho reidratraria o carrinho da conta anterior, que é
    // exatamente o vazamento entre contas que isso existe pra evitar.
    if (ownerKeyRef.current) {
      try {
        localStorage.removeItem(ownerKeyRef.current);
      } catch {
        // localStorage indisponível (modo privado etc) — sem
        // problema, não tinha nada persistido mesmo.
      }
    }
    // Convidado: apaga também o carrinho guardado na aba (sessionStorage).
    if (ownerRef.current.kind === 'guest') clearGuestCart(getGuestStorage(), ownerRef.current.tenantId);
  }, []);

  // Único ponto de entrada pra dizer "o carrinho agora pertence a ESSE
  // tenant+cliente" — chamado de dentro de CustomerAuthContext toda vez
  // que a identidade muda (login, logout, token confirmado depois de um
  // reload, troca de restaurante). Nunca lido/escrito em resposta a
  // nada além disso.
  //
  // Efeito de trocar de dono (toda a decisão mora em lib/cartOwner.resolveOwnerTransition,
  // coberta por teste):
  //  - conta → outra conta/convidado/nenhum: o carrinho em memória NUNCA passa adiante;
  //  - convidado → conta (login ou cadastro no meio da visita): os itens montados como
  //    convidado são SOMADOS ao que a conta já tinha salvo (P-20: nunca sobrescreve) e o
  //    carrinho de convidado da aba é apagado;
  //  - o que a conta tinha salvo volta como itens + INTENÇÃO de promoção (P-01), nunca
  //    como promoção ativa.
  const setCartOwner = useCallback((tenantId: string | null, customerId: string | null) => {
    const prev = ownerRef.current;
    const next = resolveCartOwner(tenantId, customerId);
    if (sameCartOwner(prev, next)) return;

    ownerRef.current = next;
    ownerKeyRef.current = next.kind === 'account' ? cartStorageKey(next.tenantId, next.customerId) : null;

    const storage = getGuestStorage();
    const persisted = ownerKeyRef.current ? loadPersistedCart(ownerKeyRef.current) : null;
    const transition = resolveOwnerTransition(prev, next, {
      memoryItems: itemsRef.current,
      loadAccountItems: () => persisted?.items ?? [],
      loadGuestItems: (guestTenantId) => readGuestCart(storage, guestTenantId),
    });
    if (transition.discardGuestCartOf) clearGuestCart(storage, transition.discardGuestCartOf);
    setItems(transition.items);
    // P-01: promoções voltam só como intenção (lembradas); convidado/nenhum zera.
    setPromo((s) => promoHydrate(s, persisted));
  }, []);

  // Salva a cada mudança. Conta: localStorage (itens + promoções lembradas, formato v2).
  // Convidado: sessionStorage, SÓ itens (promoção nunca é guardada para convidado).
  // Sem dono (ex.: ainda resolvendo o restaurante) nada é gravado.
  useEffect(() => {
    const owner = ownerRef.current;
    if (owner.kind === 'guest') {
      writeGuestCart(getGuestStorage(), owner.tenantId, items);
      return;
    }
    if (!ownerKeyRef.current) return;
    try {
      localStorage.setItem(ownerKeyRef.current, serializeCart(items, promo));
    } catch {
      // Sem espaço/localStorage bloqueado — carrinho continua
      // funcionando normalmente, só não sobrevive a um reload.
    }
  }, [items, promo.remembered, promo.legacy]); // eslint-disable-line react-hooks/exhaustive-deps

  // Liga/desliga uma promoção na seleção — várias podem estar ligadas
  // ao mesmo tempo. A validação de verdade (se elas realmente cabem sem
  // brigar pelos mesmos itens) acontece no backend na hora de criar o
  // pedido; aqui é só a escolha do cliente.
  // Promoção é só para conta (decisão B): o convidado vê a vitrine, mas ativar/alternar vira
  // pedido de login e o estado NÃO muda. Garante também o D3: nenhum preço com desconto que
  // a pessoa não conseguiria obter.
  const togglePromotion = useCallback((id: string) => {
    if (ownerRef.current.kind !== 'account') {
      setLoginIntent({ reason: 'promotion' });
      return false;
    }
    setPromo((s) => promoToggle(s, id));
    return true;
  }, []);

  const selectPromotion = useCallback((id: string) => {
    if (ownerRef.current.kind !== 'account') {
      setLoginIntent({ reason: 'promotion' });
      return false;
    }
    setPromo((s) => promoActivate(s, id));
    return true;
  }, []);

  const requestLogin = useCallback((reason: LoginIntentReason) => {
    setLoginIntent({ reason });
  }, []);

  const dismissLoginIntent = useCallback(() => {
    setLoginIntent(null);
  }, []);

  const clearSelectedPromotions = useCallback(() => {
    setPromo((s) => promoClearActive(s));
  }, []);

  const setPromoContext = useCallback((ctx: PromoContext) => {
    setPromo((s) => promoApplyContext(s, ctx));
  }, []);

  const prunePromotions = useCallback((ctx: PromoContext, validPromotionIds: string[] | null) => {
    setPromo((s) => promoPrune(s, ctx, validPromotionIds));
  }, []);

  const totalItems = useMemo(() => items.reduce((sum, item) => sum + item.quantity, 0), [items]);

  // Preço de cada linha = (preço base + soma dos adicionais escolhidos) × quantidade.
  const totalPrice = useMemo(
    () =>
      items.reduce((sum, item) => {
        const basePrice = item.product.promoPrice ?? item.product.price;
        const optionsDelta = item.selectedOptions.reduce((s, o) => s + o.priceDelta, 0);
        return sum + (basePrice + optionsDelta) * item.quantity;
      }, 0),
    [items],
  );

  // Mesmo com as funções estáveis acima, o objeto `value` em si seria
  // um literal novo a cada render — qualquer componente que só faz
  // `useContext(CartContext)` sem selecionar campos específicos
  // re-renderiza à toa. `useMemo` aqui fecha essa última fresta.
  const value = useMemo(
    () => ({
      items,
      addItem,
      increaseItem,
      decreaseItem,
      removeItem,
      clearCart,
      totalItems,
      totalPrice,
      selectedPromotionIds,
      togglePromotion,
      selectPromotion,
      clearSelectedPromotions,
      rememberedPromotions: promo.remembered,
      promoContext: promo.ctx,
      setPromoContext,
      prunePromotions,
      setCartOwner,
      loginIntent,
      requestLogin,
      dismissLoginIntent,
    }),
    [
      items,
      addItem,
      increaseItem,
      decreaseItem,
      removeItem,
      clearCart,
      totalItems,
      totalPrice,
      selectedPromotionIds,
      togglePromotion,
      selectPromotion,
      clearSelectedPromotions,
      promo.remembered,
      promo.ctx,
      setPromoContext,
      prunePromotions,
      setCartOwner,
      loginIntent,
      requestLogin,
      dismissLoginIntent,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart precisa estar dentro de um CartProvider');
  return ctx;
}
