import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { categoryLabel } from '../i18n/categoryLabel';
import { useI18n } from '../i18n/I18nContext';
import { CartBar } from '../components/CartBar';
import { getCategoryIcon } from '../components/CategoryIcon';
import { FoodBackdrop } from '../components/FoodBackdrop';
import { GlassBackButton } from '../components/GlassBackButton';
import { ProductCard } from '../components/ProductCard';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useTenant } from '../contexts/TenantContext';
import { useAccentColor } from '../hooks/useAccentColor';
import { useActiveMenuLocation } from '../hooks/useActiveMenuLocation';
import { useItemPromotions } from '../hooks/useItemPromotions';
import { fetchActivePromotions, fetchCategories, fetchProducts } from '../lib/menu-api';
import { buildCategoryPath, buildMenuPath } from '../lib/categoryRoutes';
import { buildShareUrl } from '../lib/shareLinks';
import { MENU_BORDER, MENU_PAGE_BG, MENU_TEXT, MENU_TEXT_BODY, MENU_TEXT_MUTED } from '../lib/menuTheme';
import { PROMO_INK, PROMO_LINK_BTN, PROMO_PRIMARY_BTN, PROMO_SERIF } from '../lib/promotionTheme';
import type { Category, Product, Promotion } from '../types';

const PRODUCT_REFRESH_MS = 15000;
// Mesma grade do cardápio (2 colunas no celular até 5 em monitores largos).
const PRODUCT_GRID_CLASS = 'grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5';

function sameProducts(a: Product[], b: Product[]): boolean {
  return a.length === b.length && JSON.stringify(a) === JSON.stringify(b);
}

function StateCard({
  title,
  hint,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  alert = false,
}: {
  title: string;
  hint: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  alert?: boolean;
}) {
  return (
    <div
      role={alert ? 'alert' : undefined}
      className={`mx-auto mt-10 flex w-full max-w-md flex-col items-center gap-3 rounded-2xl border bg-transparent p-7 text-center backdrop-blur-md md:rounded-3xl ${MENU_BORDER}`}
    >
      <h1 className={`text-xl font-normal ${PROMO_INK}`} style={{ fontFamily: PROMO_SERIF }}>
        {title}
      </h1>
      <p className={`text-sm ${MENU_TEXT_BODY}`}>{hint}</p>
      <button type="button" onClick={onPrimary} className={`${PROMO_PRIMARY_BTN} mt-2`}>
        {primaryLabel}
      </button>
      {secondaryLabel && onSecondary ? (
        <button type="button" onClick={onSecondary} className={`${PROMO_LINK_BTN} ${MENU_TEXT}`}>
          {secondaryLabel}
        </button>
      ) : null}
    </div>
  );
}

// Subpágina "Ver todos" de UMA categoria. Serve as duas rotas
// (`/:slug/categoria/:categoryId` e `/:slug/mesa/:token/categoria/:categoryId`);
// o prefixo vem de buildCategoryPath/buildMenuPath, então mesa e sessão nunca se
// perdem. A categoria é resolvida pelo ID (nunca pelo nome traduzido) e só
// aparecem os produtos dela, com as mesmas regras do cardápio (categorias
// ativas, disponibilidade, loja). O preço promocional vem do MESMO hook do
// cardápio (useItemPromotions → motor de promoções), então o preço é idêntico
// em todas as telas e no carrinho.
export function CategoryProductsPage() {
  const { t } = useI18n();
  const { slug, categoryId, qrCodeToken } = useParams<{
    slug: string;
    categoryId: string;
    qrCodeToken?: string;
  }>();
  const navigate = useNavigate();
  const isTableFlow = Boolean(qrCodeToken);
  const { tenant } = useTenant();
  const { token: customerToken } = useCustomerAuth();
  const accent = useAccentColor(tenant?.primaryColor ?? '#111827');
  const { location, isReady } = useActiveMenuLocation(isTableFlow);

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const tenantId = tenant?.id;
  const locationId = location?.id;
  useEffect(() => {
    if (!tenantId || !isReady) return;
    let stale = false;
    Promise.all([
      fetchCategories(tenantId),
      fetchProducts(tenantId),
      // Falha só nas promoções não derruba a página: mostra o preço normal.
      fetchActivePromotions(tenantId, customerToken, locationId).catch(() => [] as Promotion[]),
    ])
      .then(([cats, prods, promos]) => {
        if (stale) return;
        setCategories(cats);
        setProducts(prods);
        setPromotions(promos);
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
  }, [tenantId, customerToken, isReady, locationId, reloadKey]);

  // Mesma atualização silenciosa do cardápio.
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

  const category = useMemo(() => categories.find((c) => c.id === categoryId) ?? null, [categories, categoryId]);
  const categoryProducts = useMemo(
    () => (category ? products.filter((p) => p.categoryId === category.id) : []),
    [products, category],
  );
  const itemPromotions = useItemPromotions(promotions, categoryProducts);

  const menuHref = buildMenuPath(slug ?? '', qrCodeToken);
  const goBack = useCallback(() => {
    const idx = (window.history.state as { idx?: unknown } | null)?.idx;
    if (typeof idx === 'number' && idx > 0) navigate(-1);
    else navigate(menuHref);
  }, [navigate, menuHref]);

  const productHref = (productId: string) =>
    isTableFlow ? `/${slug}/mesa/${qrCodeToken}/produto/${productId}` : `/${slug}/produto/${productId}`;
  const cartHref = isTableFlow ? `/${slug}/mesa/${qrCodeToken}/carrinho` : `/${slug}/carrinho`;

  const rootStyle = { '--brand': tenant?.primaryColor, '--accent': accent } as CSSProperties;
  const shellClass = `relative isolate min-h-screen ${MENU_PAGE_BG} pb-28 md:pb-32`;
  const containerClass = 'mx-auto w-full max-w-7xl px-4 pt-4 md:px-8 md:pt-6';

  if (isLoading || !tenant) {
    const bar = 'rounded-2xl bg-black/[0.05] dark:bg-white/[0.08] motion-safe:animate-pulse';
    return (
      <div className={shellClass} style={rootStyle} role="status" aria-busy="true">
        <FoodBackdrop />
        <div className={containerClass}>
          <div className={`${bar} mb-6 h-10 w-10 rounded-full`} />
          <div className={`${bar} mb-6 h-8 w-56`} />
          <div className={PRODUCT_GRID_CLASS}>
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i} className={`${bar} aspect-[4/5]`} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (loadFailed || !category) {
    return (
      <div className={shellClass} style={rootStyle}>
        <FoodBackdrop />
        <div className={containerClass}>
          <GlassBackButton onClick={goBack} label={t('categoryPage.back')} tooltip={t('categoryPage.back')} />
          {loadFailed ? (
            <StateCard
              alert
              title={t('categoryPage.loadErrorTitle')}
              hint={t('categoryPage.loadErrorHint')}
              primaryLabel={t('categoryPage.retry')}
              onPrimary={() => {
                setIsLoading(true);
                setReloadKey((k) => k + 1);
              }}
              secondaryLabel={t('categoryPage.backToMenu')}
              onSecondary={() => navigate(menuHref)}
            />
          ) : (
            <StateCard
              title={t('categoryPage.notFoundTitle')}
              hint={t('categoryPage.notFoundHint')}
              primaryLabel={t('categoryPage.backToMenu')}
              onPrimary={() => navigate(menuHref)}
            />
          )}
        </div>
      </div>
    );
  }

  const isOpenNow = location?.isOpenNow ?? true;
  const Icon = getCategoryIcon(category.key, category.name);
  const name = categoryLabel(category, t);
  const count = categoryProducts.length;

  return (
    <div className={shellClass} style={rootStyle}>
      <FoodBackdrop />
      <div className={containerClass}>
        <GlassBackButton onClick={goBack} label={t('categoryPage.back')} tooltip={t('categoryPage.back')} />

        <header className="mt-5 flex items-center gap-4 md:mt-6">
          <div className="flex min-w-0 items-center gap-3">
            {Icon ? (
              <span
                aria-hidden="true"
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl border bg-transparent backdrop-blur-md ${MENU_BORDER} ${MENU_TEXT}`}
              >
                <Icon size={20} />
              </span>
            ) : null}
            <div className="min-w-0">
              <h1
                className={`truncate text-[1.9rem] font-normal leading-tight md:text-[2.25rem] ${PROMO_INK}`}
                style={{ fontFamily: PROMO_SERIF }}
              >
                {name}
              </h1>
              <p className={`text-[13px] ${MENU_TEXT_MUTED}`}>
                {t(count === 1 ? 'categoryPage.itemCountOne' : 'categoryPage.itemCountMany', { count: String(count) })}
              </p>
            </div>
          </div>
          <span
            aria-hidden="true"
            className="h-px min-w-6 flex-1 bg-gradient-to-r from-black/15 via-black/[0.06] to-transparent dark:from-white/20 dark:via-white/[0.07]"
          />
        </header>

        {count === 0 ? (
          <p className={`py-16 text-center text-sm ${MENU_TEXT_MUTED}`}>{t('categoryPage.empty')}</p>
        ) : (
          <div className={`${PRODUCT_GRID_CLASS} mt-6`}>
            {categoryProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                primaryColor={tenant.primaryColor}
                storeClosed={!isOpenNow}
                shareUrl={buildShareUrl('produto', slug!, product.id)}
                itemPromotion={itemPromotions.get(product.id) ?? null}
                onClick={() => navigate(productHref(product.id))}
              />
            ))}
          </div>
        )}
      </div>

      {isOpenNow && <CartBar primaryColor={tenant.primaryColor} onClick={() => navigate(cartHref)} />}
    </div>
  );
}

// Reexporta o construtor de rota para quem só precisa do link (ex.: testes).
export { buildCategoryPath };
