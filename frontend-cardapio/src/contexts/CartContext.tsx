import { createContext, useContext, useState, useMemo, useCallback, useRef, useEffect, type ReactNode } from 'react';
import type { CartItem, Product, SelectedCartOption } from '../types';

// Chave que identifica uma linha do carrinho de forma única — o mesmo
// produto com customizações DIFERENTES (ex: "sem cebola" vs "com bacon")
// são linhas separadas, nunca somadas na mesma quantidade. Ids de opção
// ordenados pra "bacon + queijo" e "queijo + bacon" caírem na mesma
// linha (mesma escolha, ordem diferente).
function buildLineKey(productId: string, selectedOptions: SelectedCartOption[]): string {
  const sortedIds = selectedOptions.map((o) => o.valueId).sort().join(',');
  return `${productId}::${sortedIds}`;
}

interface PersistedCart {
  items: CartItem[];
  selectedPromotionIds: string[];
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

function loadPersistedCart(key: string): PersistedCart | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedCart;
    if (!Array.isArray(parsed.items) || !Array.isArray(parsed.selectedPromotionIds)) return null;
    return parsed;
  } catch {
    return null;
  }
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
  // aplicado por escolha, nunca sozinho) — pode ser MAIS DE UMA ao
  // mesmo tempo (ex: um cupom pro burger + outro pra coca-cola), desde
  // que não disputem os mesmos itens (ver lib/promotionEligibility.ts,
  // que reparte o carrinho entre elas na mesma ordem da seleção — igual
  // o backend faz de verdade em PromotionsService.validateSelectedPromotions).
  // Array vazio = nenhuma escolhida.
  selectedPromotionIds: string[];
  togglePromotion: (id: string) => void;
  clearSelectedPromotions: () => void;
  // Chamado de dentro de CustomerAuthContext toda vez que tenant/cliente
  // logado mudam (login, logout, troca de conta, troca de restaurante).
  // NUNCA chamar isso de qualquer outro lugar — é o que garante que
  // persistência de carrinho nunca cruza fronteira de identidade. Ver
  // comentário grande logo abaixo, dentro do Provider.
  setCartOwner: (tenantId: string | null, customerId: string | null) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [selectedPromotionIds, setSelectedPromotionIds] = useState<string[]>([]);
  // Dono atual do carrinho (chave de storage já montada, ou null se
  // ninguém logado ainda) — em ref porque só é lido dentro de
  // callbacks/efeitos, nunca precisa disparar re-render sozinho.
  const ownerKeyRef = useRef<string | null>(null);

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
    setSelectedPromotionIds([]);
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
  }, []);

  // Único ponto de entrada pra dizer "o carrinho agora pertence a ESSE
  // tenant+cliente" — chamado de dentro de CustomerAuthContext toda vez
  // que a identidade muda (login, logout, token confirmado depois de um
  // reload, troca de restaurante). Nunca lido/escrito em resposta a
  // nada além disso.
  //
  // Efeito de trocar de dono: primeiro esquece o carrinho em memória
  // (nunca deixa o carrinho de UM dono aparecer, nem por um instante,
  // associado a outro), depois — só se o novo dono é uma identidade
  // completa (tenant E cliente, os dois) — carrega o que esse dono
  // específico tinha salvo antes (ex: o cliente recarregou a página com
  // conexão ruim, ou fechou e abriu o navegador de novo, mas continua
  // logado como ele mesmo).
  const setCartOwner = useCallback((tenantId: string | null, customerId: string | null) => {
    const nextKey = tenantId && customerId ? cartStorageKey(tenantId, customerId) : null;
    if (nextKey === ownerKeyRef.current) return;
    ownerKeyRef.current = nextKey;
    if (!nextKey) {
      setItems([]);
      setSelectedPromotionIds([]);
      return;
    }
    const persisted = loadPersistedCart(nextKey);
    setItems(persisted?.items ?? []);
    setSelectedPromotionIds(persisted?.selectedPromotionIds ?? []);
  }, []);

  // Salva a cada mudança, só enquanto existe um dono definido (tenant +
  // cliente logado, os dois). Sem dono — ex: enquanto o login ainda
  // está resolvendo — carrinho fica só em memória, nunca grava nada.
  useEffect(() => {
    if (!ownerKeyRef.current) return;
    try {
      localStorage.setItem(
        ownerKeyRef.current,
        JSON.stringify({ items, selectedPromotionIds } satisfies PersistedCart),
      );
    } catch {
      // Sem espaço/localStorage bloqueado — carrinho continua
      // funcionando normalmente, só não sobrevive a um reload.
    }
  }, [items, selectedPromotionIds]);

  // Liga/desliga uma promoção na seleção — várias podem estar ligadas
  // ao mesmo tempo. A validação de verdade (se elas realmente cabem sem
  // brigar pelos mesmos itens) acontece no backend na hora de criar o
  // pedido; aqui é só a escolha do cliente.
  const togglePromotion = useCallback((id: string) => {
    setSelectedPromotionIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }, []);

  const clearSelectedPromotions = useCallback(() => {
    setSelectedPromotionIds([]);
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
      clearSelectedPromotions,
      setCartOwner,
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
      clearSelectedPromotions,
      setCartOwner,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart precisa estar dentro de um CartProvider');
  return ctx;
}
