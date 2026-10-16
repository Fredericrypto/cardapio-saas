import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { categoryLabel } from '../i18n/categoryLabel';
import { useI18n } from '../i18n/I18nContext';
import { CartBar } from '../components/CartBar';
import { getCategoryIcon, PromocoesIcon } from '../components/CategoryIcon';
import { TodosIcon } from '../components/MenuIcons';
import { PromotionModeBanner } from '../components/promotion/PromotionModeBanner';
import { PromotionExploreProductCard } from '../components/promotion/PromotionExploreProductCard';
import { PromotionItemPanel } from '../components/promotion/PromotionItemPanel';
import { PromotionItemSheet } from '../components/promotion/PromotionItemSheet';
import { PromotionSkeleton, PromotionUnavailable } from '../components/promotion/PromotionStates';
import { Tooltip } from '../components/Tooltip';
import { useCart } from '../contexts/CartContext';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useTenant } from '../contexts/TenantContext';
import { useAccentColor } from '../hooks/useAccentColor';
import { useActiveMenuLocation } from '../hooks/useActiveMenuLocation';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { buildProductQuantityMap, findProductCartLine } from '../lib/cartLines';
import { fetchActivePromotions, fetchCategories, fetchProducts } from '../lib/menu-api';
import {
  computeMinOrderProgress,
  computeSelectedPromotionsEligibility,
  previewItemPromotion,
  type ItemPromotionPreview,
} from '../lib/promotionEligibility';
import {
  buildPromotionModeCatalog,
  buildPromotionModePaths,
  findCatalogProduct,
  promotionCardDomId,
  PROMOTION_ITEM_PARAM,
  resolveBackStep,
  toggleSelectedProductId,
  type EligibleProductGroup,
} from '../lib/promotionMode';
import { buildShareUrl } from '../lib/shareLinks';
import { MENU_BORDER, MENU_PAGE_BG, MENU_SURFACE, MENU_TEXT, MENU_TEXT_BODY, MENU_TEXT_SOFT } from '../lib/menuTheme';
import { PROMO_FOCUS } from '../lib/promotionTheme';
import type { Category, Product, Promotion } from '../types';

const PRODUCT_REFRESH_MS = 15000;

// Divisão master-detail (lista à esquerda, painel à direita) só quando cabe:
// o banner já ocupa uma coluna lateral, então abaixo disso o painel vira o
// bottom-sheet (também usado no celular).
const SPLIT_QUERY = '(min-width: 1280px)';
const PANEL_ID = 'promo-item-panel';
const PANEL_TITLE_ID = 'promo-item-panel-title';
const ANCHOR_TTL_MS = 1000;

const GRID_FULL = 'grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 xl:grid-cols-4';
const GRID_WITH_PANEL = 'grid grid-cols-2 gap-3 md:gap-4';

// A lista é recarregada a cada 15s; se nada mudou, mantém a MESMA referência
// para os cards memoizados não re-renderizarem à toa.
function sameProducts(a: Product[], b: Product[]): boolean {
  return a.length === b.length && JSON.stringify(a) === JSON.stringify(b);
}

interface PanelHistoryState {
  // true = ESTA tela empurrou a entrada do painel no histórico; então fechar
  // faz "voltar" (o botão Voltar do aparelho fecha o painel, como esperado).
  promoPanel?: boolean;
}

// Modo Promoção: tela imersiva de UMA promoção, com os produtos que ela cobre
// no topo e o restante do cardápio logo abaixo (atenuado, mas comprável). Serve
// as duas rotas (`/:slug/promocao/:id/explorar` e
// `/:slug/mesa/:token/promocao/:id/explorar`); o prefixo vem de
// buildPromotionModePaths, então mesa/sessão nunca se perdem na navegação.
//
// Estado do modo = a própria URL, inclusive o item aberto no painel
// (`?item=<produto>`): recarregar ou compartilhar a aba mantém tudo. Sair NÃO
// desativa nada: a promoção fica em `selectedPromotionIds` do CartContext
// (persistido por tenant+cliente), então o cardápio e o carrinho seguem
// aplicando o desconto.
export function PromotionExplorePage() {
  const { t } = useI18n();
  const { slug, promotionId, qrCodeToken } = useParams<{
    slug: string;
    promotionId: string;
    qrCodeToken?: string;
  }>();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const [searchParams] = useSearchParams();
  const isTableFlow = Boolean(qrCodeToken);
  const { tenant } = useTenant();
  const { token: customerToken } = useCustomerAuth();
  const { items, totalPrice, addItem, increaseItem, decreaseItem, selectedPromotionIds, selectPromotion } = useCart();
  const accent = useAccentColor(tenant?.primaryColor ?? '#111827');
  const { location, isReady } = useActiveMenuLocation(isTableFlow);
  const isSplit = useMediaQuery(SPLIT_QUERY);

  const [activePromotions, setActivePromotions] = useState<Promotion[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const paths = useMemo(
    () => buildPromotionModePaths(slug ?? '', promotionId ?? '', qrCodeToken),
    [slug, promotionId, qrCodeToken],
  );

  const tenantId = tenant?.id;
  const locationId = location?.id;
  useEffect(() => {
    if (!tenantId || !promotionId || !isReady) return;
    let stale = false;
    Promise.all([
      fetchActivePromotions(tenantId, customerToken, locationId),
      fetchCategories(tenantId),
      fetchProducts(tenantId),
    ])
      .then(([promos, cats, prods]) => {
        if (stale) return;
        setActivePromotions(promos);
        setCategories(cats);
        setProducts(prods);
        setLoadFailed(false);
        setIsLoading(false);
      })
      .catch(() => {
        if (stale) return;
        setLoadFailed(true);
        setIsLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [tenantId, promotionId, customerToken, isReady, locationId]);

  // Mesma atualização silenciosa do cardápio: item que ficar indisponível sai
  // da lista (e da contagem) sem F5.
  useEffect(() => {
    if (!tenantId) return;
    const interval = setInterval(() => {
      fetchProducts(tenantId)
        .then((next) => setProducts((prev) => (sameProducts(prev, next) ? prev : next)))
        .catch(() => {
          // falha pontual de rede: tenta de novo no próximo ciclo.
        });
    }, PRODUCT_REFRESH_MS);
    return () => clearInterval(interval);
  }, [tenantId]);

  const promotion = useMemo(
    () => activePromotions.find((p) => p.id === promotionId) ?? null,
    [activePromotions, promotionId],
  );
  const isStoreClosed = location?.isOpenNow === false;
  const isUsedUp = Boolean(promotion?.alreadyUsedUp);
  const isActive = promotion != null && selectedPromotionIds.includes(promotion.id);

  // Entrar no modo ativa a promoção (idempotente, uma vez por promoção). Sair e
  // voltar pelo histórico reativa; remover depois, no carrinho, continua valendo
  // até a próxima entrada.
  const autoSelectedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!promotion || isUsedUp || isStoreClosed) return;
    if (autoSelectedFor.current === promotion.id) return;
    autoSelectedFor.current = promotion.id;
    selectPromotion(promotion.id);
  }, [promotion, isUsedUp, isStoreClosed, selectPromotion]);

  const catalog = useMemo(
    () =>
      promotion
        ? buildPromotionModeCatalog(promotion, products, categories)
        : { groups: [], count: 0, otherGroups: [], otherCount: 0 },
    [promotion, products, categories],
  );

  // Simulação por item SEM o total do carrinho: assim os cards não dependem do
  // carrinho e só re-renderizam quando a promoção ou a lista muda. O aviso de
  // pedido mínimo (que usa o carrinho) vive no banner e no painel.
  const previews = useMemo(() => {
    const map = new Map<string, ItemPromotionPreview>();
    if (!promotion) return map;
    for (const group of [...catalog.groups, ...catalog.otherGroups]) {
      for (const product of group.products) map.set(product.id, previewItemPromotion(promotion, product));
    }
    return map;
  }, [promotion, catalog]);

  const minOrder = useMemo(
    () => (promotion ? computeMinOrderProgress(promotion, totalPrice) : null),
    [promotion, totalPrice],
  );

  // Desconto real do carrinho: roda o motor com TODAS as promoções ativas, na
  // ordem da seleção (como o backend reparte os itens), e lê a parte desta.
  const savingAmount = useMemo(() => {
    if (!promotion || !isActive) return 0;
    const selected = selectedPromotionIds
      .map((id) => activePromotions.find((p) => p.id === id))
      .filter((p): p is Promotion => p != null);
    const result = computeSelectedPromotionsEligibility(selected, items, totalPrice).perPromo.get(promotion.id);
    return result?.isEligible ? result.discountAmount : 0;
  }, [promotion, isActive, selectedPromotionIds, activePromotions, items, totalPrice]);

  // ---- Master-detail: item aberto = ?item= na URL -----------------------------
  const selectedId = searchParams.get(PROMOTION_ITEM_PARAM);
  const panelPushed = (routerLocation.state as PanelHistoryState | null)?.promoPanel === true;
  const selectedEntry = useMemo(() => findCatalogProduct(catalog, selectedId), [catalog, selectedId]);
  const selectedProduct = selectedEntry?.product ?? null;
  const hasSplitPanel = isSplit && selectedProduct != null;

  // Os callbacks abaixo precisam ser estáveis (cards memoizados); leem o estado
  // atual da URL por ref.
  const urlRef = useRef({ selectedId, panelPushed, search: routerLocation.search });
  useEffect(() => {
    urlRef.current = { selectedId, panelPushed, search: routerLocation.search };
  }, [selectedId, panelPushed, routerLocation.search]);

  // Âncora de rolagem: abrir/fechar o painel muda as colunas da lista e o card
  // clicado "pularia" na tela. Guarda a posição dele antes e, depois do layout,
  // compensa a rolagem na mesma medida — o card fica onde o dedo/mouse estava.
  const anchorRef = useRef<{ id: string; top: number; at: number } | null>(null);
  const recordAnchor = useCallback((productId: string) => {
    const el = document.getElementById(promotionCardDomId(productId));
    anchorRef.current = el ? { id: productId, top: el.getBoundingClientRect().top, at: performance.now() } : null;
  }, []);
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    anchorRef.current = null;
    if (!anchor || performance.now() - anchor.at > ANCHOR_TTL_MS) return;
    const el = document.getElementById(promotionCardDomId(anchor.id));
    if (!el) return;
    const delta = el.getBoundingClientRect().top - anchor.top;
    if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: 'instant' });
  }, [hasSplitPanel]);

  const openItem = useCallback(
    (productId: string) => {
      const { selectedId: current, panelPushed: pushed, search } = urlRef.current;
      const params = new URLSearchParams(search);
      params.set(PROMOTION_ITEM_PARAM, productId);
      // Primeira abertura empurra uma entrada (Voltar fecha o painel); trocar de
      // item só substitui a entrada atual.
      navigate(
        { search: `?${params.toString()}` },
        { replace: current !== null, state: { promoPanel: current !== null ? pushed : true } satisfies PanelHistoryState },
      );
    },
    [navigate],
  );

  const closeItem = useCallback(() => {
    const { selectedId: current, panelPushed: pushed, search } = urlRef.current;
    if (current === null) return;
    recordAnchor(current);
    if (pushed) {
      navigate(-1);
      return;
    }
    const params = new URLSearchParams(search);
    params.delete(PROMOTION_ITEM_PARAM);
    const next = params.toString();
    navigate({ search: next ? `?${next}` : '' }, { replace: true });
  }, [navigate, recordAnchor]);

  const toggleItem = useCallback(
    (productId: string) => {
      recordAnchor(productId);
      if (toggleSelectedProductId(urlRef.current.selectedId, productId) === null) closeItem();
      else openItem(productId);
    },
    [closeItem, openItem, recordAnchor],
  );

  const selectItem = useCallback(
    (productId: string) => {
      if (urlRef.current.selectedId !== productId) {
        recordAnchor(productId);
        openItem(productId);
      }
    },
    [openItem, recordAnchor],
  );

  const quickAdd = useCallback((product: Product) => addItem(product), [addItem]);

  // Seletor dos cards: age sobre a linha do carrinho que o card controla. Lê o
  // carrinho por ref para os callbacks continuarem estáveis (cards memoizados);
  // as quantidades exibidas vêm de `quantityByProduct`, que reage a `items`.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const quickIncrease = useCallback(
    (product: Product) => {
      const line = findProductCartLine(itemsRef.current, product.id);
      if (line) increaseItem(line.lineKey);
      else addItem(product);
    },
    [addItem, increaseItem],
  );

  // "−" em 1 unidade remove a linha (decreaseItem descarta quantidade 0).
  const quickDecrease = useCallback(
    (product: Product) => {
      const line = findProductCartLine(itemsRef.current, product.id);
      if (line) decreaseItem(line.lineKey);
    },
    [decreaseItem],
  );

  const quantityByProduct = useMemo(() => buildProductQuantityMap(items), [items]);

  // Voltar: sai DESTA tela para a anterior do histórico (detalhe da promoção,
  // cardápio...). Com o painel aberto há uma entrada extra no histórico, que
  // resolveBackStep já considera. Sem tela anterior no app (link compartilhado,
  // aba nova) vai ao cardápio, igual à página de detalhe da promoção.
  const goBack = useCallback(() => {
    const idx = (window.history.state as { idx?: unknown } | null)?.idx;
    const step = resolveBackStep({
      historyIdx: typeof idx === 'number' ? idx : null,
      routerKey: routerLocation.key,
      panelPushed: urlRef.current.panelPushed,
    });
    if (step !== null) navigate(step);
    else navigate(paths.menu, { replace: true });
  }, [navigate, paths.menu, routerLocation.key]);

  // Fechar pelo painel/teclado devolve o foco ao card de origem.
  const closeItemAndRefocus = useCallback(() => {
    const current = urlRef.current.selectedId;
    closeItem();
    if (current) {
      requestAnimationFrame(() =>
        document.getElementById(promotionCardDomId(current))?.querySelector('button')?.focus({ preventScroll: true }),
      );
    }
  }, [closeItem]);

  // Esc recolhe o painel lateral (o bottom-sheet cuida do próprio Esc).
  useEffect(() => {
    if (!hasSplitPanel) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeItemAndRefocus();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hasSplitPanel, closeItemAndRefocus]);

  // ?item= de um produto que não existe mais (ou link antigo): limpa em silêncio.
  const catalogReady = !isLoading && promotion != null;
  useEffect(() => {
    if (!catalogReady || !selectedId || selectedProduct) return;
    const params = new URLSearchParams(urlRef.current.search);
    params.delete(PROMOTION_ITEM_PARAM);
    const next = params.toString();
    navigate({ search: next ? `?${next}` : '' }, { replace: true });
  }, [catalogReady, selectedId, selectedProduct, navigate]);

  if (isLoading || !tenant) return <PromotionSkeleton />;

  if (loadFailed || !promotion) {
    return (
      <PromotionUnavailable
        primaryColor={tenant.primaryColor}
        accent={accent}
        onBack={() => navigate(paths.menu)}
      />
    );
  }

  const exitMode = () => navigate(paths.menu);
  const gridClass = hasSplitPanel ? GRID_WITH_PANEL : GRID_FULL;

  const renderGroups = (groups: EligibleProductGroup[], scope: 'eligible' | 'other') =>
    groups.map(({ category, products: groupProducts }) => {
      const headingId = `promo-${scope}-cat-${category.id}`;
      // Mesmo ícone da seção da categoria no cardápio (MenuPage).
      const CategoryGlyph = getCategoryIcon(category.key, category.name);
      return (
        <section key={category.id} className="mb-8 last:mb-0" aria-labelledby={headingId}>
          <h3 id={headingId} className={`mb-3 flex items-center gap-2 font-display text-lg font-bold ${MENU_TEXT}`}>
            {CategoryGlyph && <CategoryGlyph size={18} />}
            {categoryLabel(category, t)}
          </h3>
          <div className={gridClass}>
            {groupProducts.map((product) => (
              <PromotionExploreProductCard
                key={product.id}
                product={product}
                preview={previews.get(product.id) as ItemPromotionPreview}
                primaryColor={tenant.primaryColor}
                storeClosed={isStoreClosed}
                isSelected={product.id === selectedId}
                panelId={PANEL_ID}
                onToggle={toggleItem}
                onSelect={selectItem}
                onQuickAdd={quickAdd}
                quantity={quantityByProduct.get(product.id) ?? 0}
                onIncrease={quickIncrease}
                onDecrease={quickDecrease}
              />
            ))}
          </div>
        </section>
      );
    });

  const panel = selectedProduct ? (
    <PromotionItemPanel
      key={selectedProduct.id}
      product={selectedProduct}
      promotion={promotion}
      cartTotal={totalPrice}
      primaryColor={tenant.primaryColor}
      storeClosed={isStoreClosed}
      shareUrl={slug ? buildShareUrl('produto', slug, selectedProduct.id) : null}
      fullPageHref={paths.product(selectedProduct.id)}
      onClose={isSplit ? closeItemAndRefocus : closeItem}
      variant={isSplit ? 'aside' : 'sheet'}
      titleId={PANEL_TITLE_ID}
    />
  ) : null;

  return (
    <div
      className={`relative min-h-screen ${MENU_PAGE_BG} pb-28 lg:pb-12`}
      style={{ '--brand': tenant.primaryColor, '--accent': accent } as CSSProperties}
    >
      <div className="mx-auto w-full max-w-[88rem]">
        {/* Mesmo botão das subpáginas do cardápio (ProfileSubpageShell). */}
        <div className="flex items-center px-4 pb-3 pt-4 md:px-8 lg:pb-0 lg:pt-8">
          <Tooltip label={t('tooltip.back')}>
            <button
              type="button"
              onClick={goBack}
              aria-label={t('common.back')}
              className={`flex h-10 w-10 items-center justify-center rounded-full border ${MENU_SURFACE} ${MENU_BORDER} ${MENU_TEXT} transition-colors hover:bg-black/[0.03] dark:hover:bg-white/5 ${PROMO_FOCUS}`}
            >
              <ArrowLeft size={20} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </Tooltip>
        </div>

        <div className="lg:grid lg:grid-cols-[19rem_minmax(0,1fr)] lg:items-start lg:gap-8 lg:px-8 lg:pb-8 lg:pt-6">
          <PromotionModeBanner
            promotion={promotion}
            eligibleCount={catalog.count}
            minOrder={minOrder}
            savingAmount={savingAmount}
            isActive={isActive}
            canActivate={!isUsedUp && !isStoreClosed}
            onActivate={() => selectPromotion(promotion.id)}
            onExit={exitMode}
          />

          <main
            className={`px-4 pb-6 pt-4 lg:p-0 ${
              hasSplitPanel ? 'xl:grid xl:grid-cols-[minmax(0,1fr)_26rem] xl:items-start xl:gap-6' : ''
            }`}
          >
            <div className="min-w-0">
              {isUsedUp && <p className={`mb-4 text-sm ${MENU_TEXT_BODY}`}>{t('promotionDetailPage.voce_ja_usou_essa')}</p>}
              {isStoreClosed && !isUsedUp && (
                <p className={`mb-4 text-sm ${MENU_TEXT_BODY}`}>{t('promotionMode.closedNotice')}</p>
              )}

              <section aria-labelledby="promo-eligible-title">
                <h2 id="promo-eligible-title" className={`mb-4 flex items-center gap-2 font-display text-xl font-extrabold ${MENU_TEXT}`}>
                  <PromocoesIcon size={20} />
                  {t('promotionMode.eligibleItemsTitle')}
                </h2>
                {catalog.count === 0 ? (
                  <p className={`py-8 text-center text-sm ${MENU_TEXT_BODY}`}>{t('promotionMode.empty')}</p>
                ) : (
                  renderGroups(catalog.groups, 'eligible')
                )}
              </section>

              {catalog.otherCount > 0 && (
                <section aria-labelledby="promo-other-title" className={`mt-10 border-t pt-8 ${MENU_BORDER}`}>
                  <h2 id="promo-other-title" className={`flex items-center gap-2 font-display text-xl font-extrabold ${MENU_TEXT_SOFT}`}>
                    <TodosIcon size={20} />
                    {t('promotionMode.otherItemsTitle')}
                  </h2>
                  <p className={`mb-4 mt-1 text-sm ${MENU_TEXT_BODY}`}>{t('promotionMode.otherItemsHint')}</p>
                  {renderGroups(catalog.otherGroups, 'other')}
                </section>
              )}
            </div>

            {hasSplitPanel && (
              <aside
                key={selectedProduct?.id}
                id={PANEL_ID}
                aria-label={t('promotionMode.panelLabel')}
                className={`promo-panel-in sticky top-24 flex max-h-[calc(100dvh-14rem)] flex-col overflow-hidden rounded-2xl border shadow-md ${MENU_SURFACE} ${MENU_BORDER}`}
              >
                {panel}
              </aside>
            )}
          </main>
        </div>
      </div>

      {!isSplit && panel && (
        <PromotionItemSheet labelledBy={PANEL_TITLE_ID} onClose={closeItem}>
          {panel}
        </PromotionItemSheet>
      )}

      {!isStoreClosed && <CartBar primaryColor={tenant.primaryColor} onClick={() => navigate(paths.cart)} />}
    </div>
  );
}
