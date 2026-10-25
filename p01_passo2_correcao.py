#!/usr/bin/env python3
# P-01 PASSO 2 (CORRECAO): fiacao. Promocao nunca ativa sozinha.
#  - CartContext: ativas so em memoria; lembradas em disco (ate 10); selectedPromotionIds derivado
#  - hook useCartPromotionContext publicado em 6 telas (contexto = {scope mesa|geral, locationId})
#  - PromotionExplorePage: remove a auto-ativacao ao entrar
#  - PromotionDetailPage: ativar = selectPromotion (idempotente)
#  - CartPage: aviso "Promocao disponivel" + Reativar (unico lugar), poda so no sucesso da busca
#  - i18n (pt-BR, en, es), BUILD_VERSION, registro de P-19/P-20 na auditoria
# Exige o passo 1 aplicado. Aborta sem tocar em nada se qualquer ancora nao existir exatamente 1x.
import hashlib, os, re, sys

ROOT = os.path.expanduser(os.environ.get('ROOT') or '~/Projetos/cardapio-saas')
FE = os.path.join(ROOT, 'frontend-cardapio')

def norm(t):
    return t.replace('\r\n', '\n').rstrip()

def read(rel):
    p = os.path.join(FE, rel)
    try:
        with open(p, encoding='utf-8') as f:
            return f.read()
    except OSError as e:
        sys.exit(f'ABORTADO: nao consegui ler {p}: {e}')

def rep(text, old, new, label):
    n = text.count(old)
    if n != 1:
        sys.exit(f'ABORTADO: trecho "{label}" encontrado {n}x (esperado 1x). Nada foi alterado.')
    return text.replace(old, new)

def write_all(files):
    for rel, content in files.items():
        p = os.path.join(FE, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, 'w', encoding='utf-8', newline='\n') as f:
            f.write(content)

CART_HASH = "330312c5963a0c1e844dea25b17de0e13f62f4ebf0b2a8fc8d1eaf97863136e7"

CART_NEW = r"""import { createContext, useContext, useState, useMemo, useCallback, useRef, useEffect, type ReactNode } from 'react';
import type { CartItem, Product, SelectedCartOption } from '../types';
// A chave da linha (produto + adicionais) mora em lib/cartLines.ts: o Modo
// Promoção precisa calcular a MESMA chave para achar a linha no carrinho.
import { buildLineKey } from '../lib/cartLines';
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
  togglePromotion: (id: string) => void;
  // Idempotente (ao contrário do toggle): garante que a promoção está
  // selecionada. Usado pelo Modo Promoção, que não pode desligar sem querer
  // uma promoção já ativa só por reabrir a tela.
  selectPromotion: (id: string) => void;
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

    // Cliente estava pedindo como CONVIDADO (sem dono definido ainda) e
    // já tinha item no carrinho quando decidiu logar/criar conta no meio
    // da visita — bug real que isso corrige: sem essa checagem, o app
    // sempre substituía o carrinho atual pelo que já estava salvo pra
    // essa conta (geralmente nada, no primeiro login) e o cliente
    // perdia o pedido bem na hora que mais se engajou com o app. O
    // carrinho que ele já montou é dele — continua com ele, só passa a
    // ser salvo sob a identidade nova a partir de agora (o efeito de
    // persistência abaixo cuida disso sozinho).
    const wasGuestWithItems = ownerKeyRef.current === null && itemsRef.current.length > 0;

    ownerKeyRef.current = nextKey;

    if (!nextKey) {
      setItems([]);
      setPromo((s) => promoHydrate(s, null));
      return;
    }

    if (wasGuestWithItems) {
      return;
    }

    // P-01: o que estava salvo volta como INTENÇÃO (lembradas), nunca como
    // promoção ativa. `active` começa vazia depois de reload/login/reabertura.
    const persisted = loadPersistedCart(nextKey);
    setItems(persisted?.items ?? []);
    setPromo((s) => promoHydrate(s, persisted));
  }, []);

  // Salva a cada mudança, só enquanto existe um dono definido (tenant +
  // cliente logado, os dois). Sem dono — ex: enquanto o login ainda
  // está resolvendo — carrinho fica só em memória, nunca grava nada.
  useEffect(() => {
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
  const togglePromotion = useCallback((id: string) => {
    setPromo((s) => promoToggle(s, id));
  }, []);

  const selectPromotion = useCallback((id: string) => {
    setPromo((s) => promoActivate(s, id));
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
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart precisa estar dentro de um CartProvider');
  return ctx;
}
"""

HOOK = r"""import { useEffect } from 'react';
import { useCart } from '../contexts/CartContext';

// P-01: cada tela que conhece a unidade ativa publica o CONTEXTO das promoções:
// { scope: 'mesa' | 'geral', locationId }. O contexto vem só do fluxo (mesa ou
// geral) e da unidade; NUNCA do token do QR da mesa. Mesma loja: mesa != geral.
//
// Quando o contexto publicado muda (troca de unidade, mesa <-> geral), o
// CartContext descarta as promoções ativas da memória e mantém as lembradas
// (só sugestão no Carrinho). Mesmo contexto publicado de novo por outra tela:
// nada acontece. Sem unidade resolvida (carregando) não publica nada, para uma
// tela que ainda está montando nunca ser lida como "troca de contexto".
export function useCartPromotionContext(isTableFlow: boolean, locationId: string | null | undefined): void {
  const { setPromoContext } = useCart();
  useEffect(() => {
    if (!locationId) return;
    setPromoContext({ scope: isTableFlow ? 'mesa' : 'geral', locationId });
  }, [isTableFlow, locationId, setPromoContext]);
}
"""

if os.path.exists(os.path.join(FE, 'src/hooks/useCartPromotionContext.ts')):
    sys.exit('ABORTADO: passo 2 ja aplicado. Nada foi alterado.')
if not os.path.exists(os.path.join(FE, 'src/lib/cartPromotions.ts')):
    sys.exit('ABORTADO: aplique o passo 1 antes (src/lib/cartPromotions.ts ausente).')

files = {}

# ---- CartContext: substituicao inteira, mas SO se o arquivo atual for o que eu li
cart_cur = read('src/contexts/CartContext.tsx')
if hashlib.sha256(norm(cart_cur).encode()).hexdigest() != CART_HASH:
    sys.exit('ABORTADO: CartContext.tsx difere da versao que eu auditei (hash). Me envie o arquivo atual. Nada foi alterado.')
files['src/contexts/CartContext.tsx'] = CART_NEW
files['src/hooks/useCartPromotionContext.ts'] = HOOK

HOOK_IMPORT = "import { useCartPromotionContext } from '../hooks/useCartPromotionContext';\n"

def with_hook(rel, anchor, call):
    t = read(rel)
    t = rep(t, anchor, anchor + call, rel + ': ancora do hook')
    return HOOK_IMPORT + t

# ---- MenuPage
files['src/pages/MenuPage.tsx'] = with_hook(
    'src/pages/MenuPage.tsx',
    "  const activeLocation = isTableFlow ? tableLocation : selectedLocation;\n",
    "  useCartPromotionContext(isTableFlow, activeLocation?.id);\n",
)

# ---- ProductDetailPage
files['src/pages/ProductDetailPage.tsx'] = with_hook(
    'src/pages/ProductDetailPage.tsx',
    "  const activeLocation = useActiveLocation(tenant?.id, Boolean(qrCodeToken));\n",
    "  useCartPromotionContext(Boolean(qrCodeToken), activeLocation?.id);\n",
)

# ---- CategoryProductsPage
files['src/pages/CategoryProductsPage.tsx'] = with_hook(
    'src/pages/CategoryProductsPage.tsx',
    "  const { location, isReady } = useActiveMenuLocation(isTableFlow);\n",
    "  useCartPromotionContext(isTableFlow, location?.id);\n",
)

# ---- PromotionDetailPage: contexto + ativar idempotente
t = read('src/pages/PromotionDetailPage.tsx')
t = rep(
    t,
    "  const { location: activeLocation, isReady: isLocationReady } = useActiveMenuLocation(isTableFlow);\n",
    "  const { location: activeLocation, isReady: isLocationReady } = useActiveMenuLocation(isTableFlow);\n"
    "  useCartPromotionContext(isTableFlow, activeLocation?.id);\n",
    'PromotionDetailPage: hook',
)
t = rep(
    t,
    "  const { items, totalPrice, selectedPromotionIds, togglePromotion } = useCart();\n",
    "  const { items, totalPrice, selectedPromotionIds, togglePromotion, selectPromotion } = useCart();\n",
    'PromotionDetailPage: useCart',
)
t = rep(
    t,
    "    togglePromotion(promotion!.id);\n    navigate(items.length > 0 ? cartHref : backHref);\n",
    "    // Ativar e idempotente (P-01): nunca desliga uma promocao ja ativa por engano.\n"
    "    selectPromotion(promotion!.id);\n    navigate(items.length > 0 ? cartHref : backHref);\n",
    'PromotionDetailPage: handleApply',
)
files['src/pages/PromotionDetailPage.tsx'] = HOOK_IMPORT + t

# ---- PromotionExplorePage: remove auto-ativacao
t = read('src/pages/PromotionExplorePage.tsx')
t = rep(
    t,
    "  const { location, isReady } = useActiveMenuLocation(isTableFlow);\n",
    "  const { location, isReady } = useActiveMenuLocation(isTableFlow);\n"
    "  useCartPromotionContext(isTableFlow, location?.id);\n",
    'PromotionExplorePage: hook',
)
t = rep(
    t,
    "  // Entrar no modo ativa a promoção (idempotente, uma vez por promoção). Sair e\n"
    "  // voltar pelo histórico reativa; remover depois, no carrinho, continua valendo\n"
    "  // até a próxima entrada.\n"
    "  const autoSelectedFor = useRef<string | null>(null);\n"
    "  useEffect(() => {\n"
    "    if (!promotion || isUsedUp || isStoreClosed) return;\n"
    "    if (autoSelectedFor.current === promotion.id) return;\n"
    "    autoSelectedFor.current = promotion.id;\n"
    "    selectPromotion(promotion.id);\n"
    "  }, [promotion, isUsedUp, isStoreClosed, selectPromotion]);\n",
    "  // P-01: entrar no modo NUNCA ativa a promoção. Só o botão \"Ativar\" do banner\n"
    "  // (ação explícita do cliente) ativa.\n",
    'PromotionExplorePage: auto-ativacao',
)
t = rep(
    t,
    "// desativa nada: a promoção fica em `selectedPromotionIds` do CartContext\n"
    "// (persistido por tenant+cliente), então o cardápio e o carrinho seguem\n"
    "// aplicando o desconto.\n",
    "// desativa nada: a promoção que o CLIENTE ativou segue ativa nesta sessão, no\n"
    "// mesmo contexto (mesa/geral + unidade), então o cardápio e o carrinho seguem\n"
    "// aplicando o desconto. Entrar aqui NUNCA ativa nada (P-01).\n",
    'PromotionExplorePage: comentario',
)
files['src/pages/PromotionExplorePage.tsx'] = HOOK_IMPORT + t

# ---- CartPage
t = read('src/pages/CartPage.tsx')
t = rep(
    t,
    "    selectedPromotionIds,\n    togglePromotion,\n  } = useCart();\n",
    "    selectedPromotionIds,\n    togglePromotion,\n    selectPromotion,\n    rememberedPromotions,\n    promoContext,\n    prunePromotions,\n  } = useCart();\n",
    'CartPage: useCart',
)
t = rep(
    t,
    "  const activeLocation = isTableFlow ? tableLocation : selectedLocation;\n",
    "  const activeLocation = isTableFlow ? tableLocation : selectedLocation;\n"
    "  useCartPromotionContext(isTableFlow, activeLocation?.id);\n",
    'CartPage: hook',
)
t = rep(
    t,
    "      .then((result) => {\n        if (!isStale) setPromotions(result);\n      })\n",
    "      .then((result) => {\n"
    "        if (isStale) return;\n"
    "        setPromotions(result);\n"
    "        // P-01 (D4): poda lembradas invalidas SO com a lista carregada com sucesso e a\n"
    "        // unidade resolvida; falha de carregamento (catch abaixo) nunca poda.\n"
    "        if (activeLocation?.id) {\n"
    "          prunePromotions(\n"
    "            { scope: isTableFlow ? 'mesa' : 'geral', locationId: activeLocation.id },\n"
    "            result.map((p) => p.id),\n"
    "          );\n"
    "        }\n"
    "      })\n",
    'CartPage: poda no sucesso',
)
t = rep(
    t,
    "  const appliedDiscountAmount = multiEligibility.totalDiscountAmount;\n",
    "  const appliedDiscountAmount = multiEligibility.totalDiscountAmount;\n"
    "  // P-01 (D3): sugestao SO aqui no Carrinho. Lembradas do contexto atual que ainda\n"
    "  // existem, nao estao ativas e cabem no carrinho de agora. Nunca ativam sozinhas.\n"
    "  const promotionSuggestions = promoSuggestionIds({ ctx: promoContext, remembered: rememberedPromotions }, promotions)\n"
    "    .filter((id) => !selectedPromotionIds.includes(id))\n"
    "    .map((id) => promotions.find((p) => p.id === id))\n"
    "    .filter((p): p is Promotion => p != null && computePromotionEligibility(p, items, totalPrice).isEligible);\n",
    'CartPage: sugestoes',
)
t = rep(
    t,
    "              <div className={CART_CARD}>\n                {selectedPromotions.length > 0 && (\n",
    "              <div className={CART_CARD}>\n"
    "                {promotionSuggestions.length > 0 && (\n"
    "                  <div className=\"flex flex-col gap-1.5 mb-3\" role=\"status\">\n"
    "                    {promotionSuggestions.map((promo) => (\n"
    "                      <div\n"
    "                        key={promo.id}\n"
    "                        className={`flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 ${MENU_SURFACE_SUBTLE} ${MENU_BORDER}`}\n"
    "                      >\n"
    "                        <div className=\"flex items-center gap-2 min-w-0\">\n"
    "                          <Tag size={15} strokeWidth={1.5} style={{ color: accent }} className=\"shrink-0\" aria-hidden=\"true\" />\n"
    "                          <div className=\"min-w-0\">\n"
    "                            <p className={`text-xs ${CART_TEXT_MUTED}`}>{t('cartPage.promoAvailable')}</p>\n"
    "                            <p className={`text-sm font-semibold truncate ${CART_TEXT_SOFT}`}>{localizedField(promo, 'title')}</p>\n"
    "                          </div>\n"
    "                        </div>\n"
    "                        <button\n"
    "                          type=\"button\"\n"
    "                          onClick={() => selectPromotion(promo.id)}\n"
    "                          aria-label={t('cartPage.promoReactivateAria', { title: localizedField(promo, 'title') })}\n"
    "                          className=\"shrink-0 rounded-lg border bg-transparent px-3 py-1.5 text-xs font-semibold active:scale-95\"\n"
    "                          style={{ color: accent, borderColor: accent }}\n"
    "                        >\n"
    "                          {t('cartPage.promoReactivate')}\n"
    "                        </button>\n"
    "                      </div>\n"
    "                    ))}\n"
    "                  </div>\n"
    "                )}\n"
    "                {selectedPromotions.length > 0 && (\n",
    'CartPage: bloco de sugestao',
)
files['src/pages/CartPage.tsx'] = (
    HOOK_IMPORT + "import { promoSuggestionIds } from '../lib/cartPromotions';\n" + t
)

# ---- i18n: insere ANTES da chave ancora em cada dicionario
NEW_KEYS = {
    'pt-BR': ("Promoção disponível", "Reativar", "Reativar a promoção {title}"),
    'en': ("Promotion available", "Reactivate", "Reactivate the promotion {title}"),
    'es': ("Promoción disponible", "Reactivar", "Reactivar la promoción {title}"),
}
for lang, (a, b, c) in NEW_KEYS.items():
    rel = f'src/i18n/dictionaries/{lang}.ts'
    t = read(rel)
    m = list(re.finditer(r"^  'cartPage\.promoTotalSaving':", t, re.M))
    if len(m) != 1:
        sys.exit(f'ABORTADO: {rel}: chave ancora cartPage.promoTotalSaving encontrada {len(m)}x (esperado 1x). Nada foi alterado.')
    block = (
        f"  'cartPage.promoAvailable': '{a}',\n"
        f"  'cartPage.promoReactivate': '{b}',\n"
        f"  'cartPage.promoReactivateAria': '{c}',\n"
    )
    if "'cartPage.promoAvailable'" in t:
        sys.exit(f'ABORTADO: {rel} ja tem as chaves. Nada foi alterado.')
    i = m[0].start()
    files[rel] = t[:i] + block + t[i:]

write_all(files)

# ---- BUILD_VERSION (nao aborta se o formato for outro)
bi = os.path.join(FE, 'src/buildInfo.ts')
try:
    with open(bi, encoding='utf-8') as f:
        s = f.read()
    ms = list(re.finditer(r"(BUILD_VERSION\s*(?::\s*string\s*)?=\s*')([^']*)(')", s))
    if len(ms) == 1:
        prev = ms[0].group(2)
        mm = re.search(r'promocoes-(\d+)$', prev)
        nn = (int(mm.group(1)) + 1) if mm else 1
        new = f'2026-10-23-sessao-z7-promocoes-{nn:02d}'
        s = s[:ms[0].start(2)] + new + s[ms[0].end(2):]
        with open(bi, 'w', encoding='utf-8', newline='\n') as f:
            f.write(s)
        print(f'BUILD_VERSION: {prev} -> {new}')
    else:
        print(f'AVISO: BUILD_VERSION nao encontrado 1x em {bi} ({len(ms)}). Atualize manualmente.')
except OSError as e:
    print(f'AVISO: nao consegui ler {bi}: {e}. Atualize BUILD_VERSION manualmente.')

# ---- auditoria: registra P-19 / P-20 (nao aborta)
au = os.path.join(ROOT, 'docs', 'AUDITORIA-PROMOCOES-2026-10-20.md')
try:
    with open(au, encoding='utf-8') as f:
        a = f.read()
    if 'P-19' not in a:
        a += (
            "\n\n## Divida registrada durante o P-01\n\n"
            "| ID | Achado | Tratamento |\n|---|---|---|\n"
            "| P-19 | Itens do carrinho sao compartilhados entre Mesa e Geral (um unico CartProvider; o P-01 separa so as promocoes). | DIVIDA FUTURA. Decisao do Felipe: nao separar itens agora. |\n"
            "| P-20 | Convidado com itens que loga sobrescreve o carrinho salvo da conta (e agora tambem as lembradas). | Pre-existente, fora do P-01. |\n"
        )
        with open(au, 'w', encoding='utf-8', newline='\n') as f:
            f.write(a)
        print('docs: P-19 e P-20 registrados na auditoria')
except OSError:
    print('AVISO: auditoria nao encontrada em docs/; registre P-19/P-20 manualmente.')

print('OK: passo 2 aplicado. Rode: tsc, test:logic, vite build.')
