import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { categoryLabel } from '../i18n/categoryLabel';
import { useI18n } from '../i18n/I18nContext';
import { CartBar } from '../components/CartBar';
import { PromotionModeBanner } from '../components/promotion/PromotionModeBanner';
import { PromotionExploreProductCard } from '../components/promotion/PromotionExploreProductCard';
import { PromotionSkeleton, PromotionUnavailable } from '../components/promotion/PromotionStates';
import { useCart } from '../contexts/CartContext';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useTenant } from '../contexts/TenantContext';
import { useAccentColor } from '../hooks/useAccentColor';
import { useActiveMenuLocation } from '../hooks/useActiveMenuLocation';
import { fetchActivePromotions, fetchCategories, fetchProducts } from '../lib/menu-api';
import {
  computeMinOrderProgress,
  computeSelectedPromotionsEligibility,
  previewItemPromotion,
} from '../lib/promotionEligibility';
import { buildPromotionModeCatalog, buildPromotionModePaths } from '../lib/promotionMode';
import { MENU_PAGE_BG, MENU_TEXT, MENU_TEXT_BODY, MENU_TEXT_SOFT } from '../lib/menuTheme';
import type { Category, Product, Promotion } from '../types';

const PRODUCT_REFRESH_MS = 15000;

// Modo Promoção: tela imersiva de UMA promoção, só com os produtos que ela
// cobre. Serve as duas rotas (`/:slug/promocao/:id/explorar` e
// `/:slug/mesa/:token/promocao/:id/explorar`); o prefixo vem de
// buildPromotionModePaths, então mesa/sessão nunca se perdem na navegação.
//
// Estado do modo = a própria URL. Sair NÃO desativa nada: a promoção fica em
// `selectedPromotionIds` do CartContext (persistido por tenant+cliente), então o
// cardápio e o carrinho seguem aplicando o desconto.
export function PromotionExplorePage() {
  const { t } = useI18n();
  const { slug, promotionId, qrCodeToken } = useParams<{
    slug: string;
    promotionId: string;
    qrCodeToken?: string;
  }>();
  const navigate = useNavigate();
  const isTableFlow = Boolean(qrCodeToken);
  const { tenant } = useTenant();
  const { token: customerToken } = useCustomerAuth();
  const { items, totalPrice, addItem, selectedPromotionIds, selectPromotion } = useCart();
  const accent = useAccentColor(tenant?.primaryColor ?? '#111827');
  const { location, isReady } = useActiveMenuLocation(isTableFlow);

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
        .then(setProducts)
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
    () => (promotion ? buildPromotionModeCatalog(promotion, products, categories) : { groups: [], count: 0 }),
    [promotion, products, categories],
  );

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

  return (
    <div
      className={`relative min-h-screen ${MENU_PAGE_BG} pb-28 lg:pb-12`}
      style={{ '--brand': tenant.primaryColor, '--accent': accent } as React.CSSProperties}
    >
      <div className="mx-auto w-full max-w-[88rem] lg:grid lg:grid-cols-[19rem_minmax(0,1fr)] lg:items-start lg:gap-8 lg:px-8 lg:py-8">
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

        <main className="px-4 pb-6 pt-4 lg:p-0">
          {isUsedUp && <p className={`mb-4 text-sm ${MENU_TEXT_BODY}`}>{t('promotionDetailPage.voce_ja_usou_essa')}</p>}
          {isStoreClosed && !isUsedUp && (
            <p className={`mb-4 text-sm ${MENU_TEXT_BODY}`}>{t('promotionMode.closedNotice')}</p>
          )}

          {catalog.count === 0 ? (
            <p className={`py-12 text-center text-sm ${MENU_TEXT_SOFT}`}>{t('promotionMode.empty')}</p>
          ) : (
            catalog.groups.map(({ category, products: groupProducts }) => (
              <section key={category.id} className="mb-8 last:mb-0" aria-labelledby={`promo-cat-${category.id}`}>
                <h2 id={`promo-cat-${category.id}`} className={`mb-3 font-display text-lg font-bold ${MENU_TEXT}`}>
                  {categoryLabel(category, t)}
                </h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 xl:grid-cols-4">
                  {groupProducts.map((product) => (
                    <PromotionExploreProductCard
                      key={product.id}
                      product={product}
                      preview={previewItemPromotion(promotion, product, { cartTotal: totalPrice })}
                      primaryColor={tenant.primaryColor}
                      storeClosed={isStoreClosed}
                      onOpen={() => navigate(paths.product(product.id))}
                      onAdd={() => addItem(product)}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </main>
      </div>

      {!isStoreClosed && <CartBar primaryColor={tenant.primaryColor} onClick={() => navigate(paths.cart)} />}
    </div>
  );
}
