import { localizedField } from '../i18n/contentText';
import { activeDateLocale } from '../i18n/languages';
import { categoryLabel } from '../i18n/categoryLabel';
import { useI18n } from '../i18n/I18nContext';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, Ban, CheckCircle2, Clock, Coins, Compass, Package, Tag, Users } from 'lucide-react';
import { ShareButton } from '../components/ShareButton';
import { GlassBackButton } from '../components/GlassBackButton';
import { AnimatedGradientButton } from '../components/AnimatedGradientButton';
import { FoodBackdrop } from '../components/FoodBackdrop';
import { PromotionHero } from '../components/promotion/PromotionHero';
import { PromotionEditorial } from '../components/promotion/PromotionEditorial';
import { PromotionBadge } from '../components/promotion/PromotionBadge';
import { PromotionBenefitCard } from '../components/promotion/PromotionBenefitCard';
import { PromotionSkeleton, PromotionUnavailable } from '../components/promotion/PromotionStates';
import { buildShareUrl } from '../lib/shareLinks';
import { fetchActivePromotions, fetchCategories, fetchProducts } from '../lib/menu-api';
import { isTransientError } from '../lib/api';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useTenant } from '../contexts/TenantContext';
import { useCart } from '../contexts/CartContext';
import { useAccentColor } from '../hooks/useAccentColor';
import { useActiveMenuLocation } from '../hooks/useActiveMenuLocation';
import {
  computePromotionEligibility,
  previewItemPromotion,
  type ItemPromotionPreview,
} from '../lib/promotionEligibility';
import { buildPromotionModePaths } from '../lib/promotionMode';
import { getProductImages } from '../lib/productImages';
import { formatBRL, getPromotionBadgeKind, getPromotionHeroValue } from '../lib/promotionPresentation';
import {
  PROMO_EYEBROW,
  PROMO_FOCUS,
  PROMO_INK,
  PROMO_LINK_BTN,
  PROMO_MUTED,
  PROMO_SERIF,
} from '../lib/promotionTheme';
import { MENU_BORDER, MENU_PAGE_BG, MENU_SURFACE_SUBTLE, MENU_TEXT, MENU_TEXT_MUTED } from '../lib/menuTheme';
import type { Promotion, Category, Product } from '../types';

// Vidro padrão do cardápio (só nos cards de itens; o resto da página é editorial,
// sem caixas).
const GLASS = `border bg-transparent backdrop-blur-md ${MENU_BORDER}`;
const HAIRLINE = 'border-black/10 dark:border-white/10';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(activeDateLocale(), {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Tela de detalhe do cupom — foto grande, regras e um botão "Usar
// promoção", igual iFood: o cliente decide usar, nunca é forçado. Some
// mostra se dá pra usar AGORA com o carrinho atual (ou por que não).
export function PromotionDetailPage() {
  const { t } = useI18n();
  const { slug, promotionId, qrCodeToken } = useParams<{
    slug: string;
    promotionId: string;
    qrCodeToken?: string;
  }>();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const { items, totalPrice, selectedPromotionIds, togglePromotion } = useCart();
  const isTableFlow = Boolean(qrCodeToken);

  const { tenant } = useTenant();
  const accent = useAccentColor(tenant?.primaryColor ?? '#111827');
  const [promotion, setPromotion] = useState<Promotion | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const { token: customerToken } = useCustomerAuth();

  // Mesma resolução de loja do MenuPage (hook compartilhado): uma promoção pode ser
  // restrita a lojas específicas, então sem a locationId certa ela some da lista e
  // esta tela mostraria "não está mais disponível" mesmo existindo. `isLocationReady`
  // evita um primeiro fetch sem locationId (que piscaria "indisponível").
  const { location: activeLocation, isReady: isLocationReady } = useActiveMenuLocation(isTableFlow);
  const tenantId = tenant?.id;
  const locationId = activeLocation?.id;

  useEffect(() => {
    if (!slug || !promotionId || !tenantId || !isLocationReady) return;
    let stale = false;
    let retryTimer: number | undefined;
    Promise.all([
      fetchActivePromotions(tenantId, customerToken, locationId),
      fetchCategories(tenantId),
      fetchProducts(tenantId),
    ])
      .then(([promos, cats, prods]) => {
        if (stale) return;
        setPromotion(promos.find((p) => p.id === promotionId) ?? null);
        setCategories(cats);
        setProducts(prods);
        setLoadFailed(false);
        setIsLoading(false);
      })
      .catch((err) => {
        // Falha de rede não é "promoção indisponível". Servidor dormindo/instável: continua no
        // esqueleto e busca de novo sozinho; só um erro definitivo cai na tela com botão.
        if (stale) return;
        if (isTransientError(err)) {
          retryTimer = window.setTimeout(() => setReloadKey((k) => k + 1), 6000);
          return;
        }
        setLoadFailed(true);
        setIsLoading(false);
      });
    return () => {
      stale = true;
      window.clearTimeout(retryTimer);
    };
  }, [slug, promotionId, tenantId, customerToken, isLocationReady, locationId, reloadKey]);

  function handleRetry() {
    setIsLoading(true);
    setLoadFailed(false);
    setReloadKey((k) => k + 1);
  }

  // Produtos elegíveis (só quando a promoção é restrita a itens/categorias), com os
  // indisponíveis por último.
  const eligibleProducts = useMemo(() => {
    if (!promotion) return [] as Product[];
    const list =
      promotion.scope === 'product'
        ? products.filter((p) => promotion.productIds.includes(p.id))
        : promotion.scope === 'category'
          ? products.filter((p) => promotion.categoryIds.includes(p.categoryId))
          : [];
    return [...list].sort((a, b) => Number(a.isAvailable === false) - Number(b.isAvailable === false));
  }, [promotion, products]);

  // Preço de hoje x preço com a promoção: mesmo motor do Modo Promoção.
  const previews = useMemo(() => {
    const map = new Map<string, ItemPromotionPreview>();
    if (promotion) for (const p of eligibleProducts) map.set(p.id, previewItemPromotion(promotion, p));
    return map;
  }, [promotion, eligibleProducts]);

  const backHref = qrCodeToken ? `/${slug}/mesa/${qrCodeToken}` : `/${slug}`;
  const cartHref = qrCodeToken ? `/${slug}/mesa/${qrCodeToken}/carrinho` : `/${slug}/carrinho`;
  const productHref = (productId: string) =>
    qrCodeToken ? `/${slug}/mesa/${qrCodeToken}/produto/${productId}` : `/${slug}/produto/${productId}`;

  if (isLoading || !tenant) {
    return <PromotionSkeleton />;
  }

  if (loadFailed) {
    return (
      <PromotionUnavailable
        primaryColor={tenant.primaryColor}
        accent={accent}
        onBack={() => navigate(backHref)}
        failed
        onRetry={handleRetry}
      />
    );
  }

  if (!promotion) {
    return (
      <PromotionUnavailable primaryColor={tenant.primaryColor} accent={accent} onBack={() => navigate(backHref)} />
    );
  }

  const scopeNames =
    promotion.scope === 'category'
      ? categories.filter((c) => promotion.categoryIds.includes(c.id)).map((c) => categoryLabel(c, t))
      : promotion.scope === 'product'
        ? products.filter((p) => promotion.productIds.includes(p.id)).map((p) => localizedField(p, 'name'))
        : [];

  // Loja fechada: dá para ler a promoção, mas não resgatar/aplicar.
  const isStoreClosed = activeLocation?.isOpenNow === false;
  const eligibility = computePromotionEligibility(promotion, items, totalPrice);
  const isApplied = selectedPromotionIds.includes(promotion.id);

  function handleApply() {
    if (isStoreClosed) return;
    togglePromotion(promotion!.id);
    navigate(items.length > 0 ? cartHref : backHref);
  }

  function handleRemove() {
    togglePromotion(promotion!.id);
  }

  const discountLabel =
    promotion.discountType === 'percentage'
      ? t('promotionDetailPage.discountvalue_de_desconto', { discountValue: promotion.discountValue })
      : t('promotionDetailPage.r_v0_de_desconto', { v0: Number(promotion.discountValue).toFixed(2).replace('.', ',') });

  // Só apresentação: selo derivado de dados que a promoção já tem.
  const isUsedUp = Boolean(promotion.alreadyUsedUp);
  const badgeKind = getPromotionBadgeKind(promotion);
  const hero = getPromotionHeroValue(promotion);

  function handleSeeEligibleProducts() {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    document
      .getElementById('promo-eligible-products')
      ?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }

  // Botão principal: o AnimatedGradientButton ORIGINAL (os dois pontos de luz na
  // borda), sem nenhuma alteração de fundo.
  const cta = promotion.alreadyUsedUp ? (
    <button
      disabled
      className={`w-full rounded-xl border py-3.5 text-[15px] font-medium text-[#9CA3AF] cursor-not-allowed dark:text-[#77777A] ${HAIRLINE}`}
    >
      {t('promotionDetailPage.promocao_ja_utilizada')}
    </button>
  ) : isStoreClosed && !isApplied ? (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] text-red-500 dark:text-red-400 text-center">{t('store.closedHint')}</p>
      <button
        type="button"
        disabled
        aria-disabled="true"
        className="w-full py-3.5 rounded-xl text-[15px] bg-red-50 text-red-600 border border-red-100 dark:bg-red-500/10 dark:text-red-300 dark:border-red-400/20 font-semibold flex justify-center items-center gap-2 cursor-not-allowed"
      >
        <Ban size={16} strokeWidth={1.5} />
        {t('store.closedEstablishment')}
      </button>
    </div>
  ) : isApplied ? (
    <button
      onClick={handleRemove}
      className={`w-full rounded-xl border bg-transparent py-3.5 text-[15px] font-semibold transition hover:bg-black/[0.03] dark:hover:bg-white/[0.06] ${PROMO_FOCUS}`}
      style={{ borderColor: accent, color: accent }}
    >
      {t('promotionDetailPage.remover_promocao')}
    </button>
  ) : (
    <AnimatedGradientButton
      onClick={handleApply}
      contentClassName="py-3.5 text-[15px] font-semibold flex items-center justify-center gap-2"
    >
      {t('promotionDetailPage.usar_desconto_de_valor', { value: hero.text })}
      <ArrowRight size={18} strokeWidth={1.5} aria-hidden="true" />
    </AnimatedGradientButton>
  );

  const conditionRows: { key: string; icon: React.ReactNode; label: string }[] = [];
  conditionRows.push({
    key: 'scope',
    icon: <Tag size={17} strokeWidth={1.5} />,
    label:
      promotion.scope === 'all'
        ? t('promotionDetailPage.valida_para_todos_os')
        : scopeNames.length > 0
          ? t('promotionDetailPage.valida_so_para_v0', { v0: scopeNames.join(', ') })
          : t('promotionDetailPage.valida_para_itens_selecionados'),
  });
  if (promotion.minOrderValue > 0) {
    conditionRows.push({
      key: 'min',
      icon: <Tag size={17} strokeWidth={1.5} />,
      label: t('promotionDetailPage.pedido_minimo_de_r', { v0: Number(promotion.minOrderValue).toFixed(2).replace('.', ',') }),
    });
  }
  if (promotion.usageLimitPerCustomer != null) {
    conditionRows.push({
      key: 'usage',
      icon: <Users size={17} strokeWidth={1.5} />,
      label:
        promotion.usageLimitPerCustomer === 1
          ? t('promotionDetailPage.limite_de_1_uso')
          : t('promotionDetailPage.limite_de_usagelimitpercustomer_usos', { usageLimitPerCustomer: promotion.usageLimitPerCustomer }),
    });
  }
  if (promotion.endsAt) {
    conditionRows.push({
      key: 'ends',
      icon: <Clock size={17} strokeWidth={1.5} />,
      label: t('promotionDetailPage.valida_ate_v0', { v0: formatDateTime(promotion.endsAt) }),
    });
  }
  if (promotion.discountType === 'percentage' && promotion.maxDiscountAmount != null) {
    conditionRows.push({
      key: 'maxdiscount',
      icon: <Coins size={17} strokeWidth={1.5} />,
      label: t('promotionDetailPage.desconto_maximo_de_r', { v0: formatBRL(promotion.maxDiscountAmount) }),
    });
  }
  if (promotion.maxEligibleQuantity != null) {
    conditionRows.push({
      key: 'maxqty',
      icon: <Package size={17} strokeWidth={1.5} />,
      label: t('promotionDetailPage.desconto_em_ate_n_unidades', { n: promotion.maxEligibleQuantity }),
    });
  }

  return (
    <div
      className={`relative isolate min-h-screen ${MENU_PAGE_BG} pb-28 lg:pb-12`}
      style={{ '--brand': tenant.primaryColor, '--accent': accent } as React.CSSProperties}
    >
      <FoodBackdrop />
      <div className="relative mx-auto w-full max-w-[88rem] px-4 py-4 md:px-8 md:py-8 lg:px-12 lg:py-10">
        {/* Duas colunas (65/35). No celular a ordem natural é: imagem, detalhes, mensagem. */}
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,65fr)_minmax(0,35fr)] lg:gap-x-14 lg:gap-y-0">
          <div className="lg:col-start-1 lg:row-start-1">
            <PromotionHero
              promotion={promotion}
              ariaLabel={discountLabel}
              primaryColor={tenant.primaryColor}
              muted={isUsedUp}
              topBar={
                <>
                  <GlassBackButton
                    // Link compartilhado abre direto aqui (sem histórico): voltar leva ao cardápio.
                    onClick={() => (routerLocation.key === 'default' ? navigate(backHref, { replace: true }) : navigate(-1))}
                    label={t('common.back')}
                    tooltip={t('tooltip.back')}
                    className="loc-dist [--glow:var(--accent)]"
                  />
                  {slug && (
                    <ShareButton
                      variant="glass"
                      className="loc-dist [--glow:var(--accent)]"
                      url={buildShareUrl('promocao', slug, promotion.id)}
                      title={localizedField(promotion, 'title')}
                      text={localizedField(promotion, 'description') || t('promotionDetailPage.promocao_de_name', { name: tenant.name })}
                    />
                  )}
                </>
              }
            />
          </div>

          {/* Coluna direita: uma única composição, sem caixas. */}
          <div className="flex flex-col lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:pt-[3.25rem]">
            <div className="flex flex-col items-start gap-4">
              <PromotionBadge kind={badgeKind} muted={isUsedUp} />
              <h1
                className={`text-4xl font-medium leading-[1.05] md:text-5xl ${PROMO_INK}`}
                style={{ fontFamily: PROMO_SERIF }}
              >
                {localizedField(promotion, 'title')}
              </h1>
              {promotion.description && (
                <p className={`text-base leading-relaxed md:text-lg ${PROMO_MUTED}`}>
                  {localizedField(promotion, 'description')}
                </p>
              )}
            </div>

            <hr className={`my-6 border-0 border-t ${HAIRLINE}`} />

            {isUsedUp ? (
              <div className="flex flex-wrap items-center gap-3">
                <CheckCircle2 size={20} strokeWidth={1.5} className={`${PROMO_MUTED} shrink-0`} aria-hidden="true" />
                <p className={`min-w-0 flex-1 text-sm ${PROMO_MUTED}`}>{t('promotionDetailPage.voce_ja_usou_essa')}</p>
                <button type="button" onClick={() => navigate(backHref)} className={`${PROMO_LINK_BTN} ${PROMO_INK}`}>
                  {t('promotionDetailPage.voltar_pro_cardapio')}
                </button>
              </div>
            ) : (
              <PromotionBenefitCard
                promotion={promotion}
                eligibility={eligibility}
                isApplied={isApplied}
                hasEligibleProducts={eligibleProducts.length > 0}
                onSeeProducts={handleSeeEligibleProducts}
              />
            )}

            {/* Ação principal inline no desktop; no celular fica fixa no rodapé. */}
            <div className="mt-6 hidden lg:block">{cta}</div>

            {/* Entrada do Modo Promoção: navegar só pelos itens que a promoção cobre. */}
            {!isUsedUp && (
              <button
                type="button"
                onClick={() => navigate(buildPromotionModePaths(slug ?? '', promotion.id, qrCodeToken).explore)}
                className={`mt-6 flex w-full items-center justify-center gap-2 rounded-xl border bg-transparent py-3.5 text-sm font-medium transition hover:bg-black/[0.03] dark:hover:bg-white/[0.05] lg:mt-3 border-black/15 dark:border-white/15 ${PROMO_INK} ${PROMO_FOCUS}`}
              >
                <Compass size={16} strokeWidth={1.5} aria-hidden="true" />
                {t('promotionMode.exploreItems')}
              </button>
            )}

            {/* Condições: lista com filetes finos entre as linhas e ícones contornados. */}
            <section aria-labelledby="promo-conditions-title" className="mt-10">
              <h2
                id="promo-conditions-title"
                className={`mb-4 ${PROMO_EYEBROW} ${PROMO_MUTED}`}
                style={{ fontFamily: 'inherit' }}
              >
                {t('promotionDetailPage.detalhes_e_condicoes')}
              </h2>
              <ul className={`border-t ${HAIRLINE}`}>
                {conditionRows.map((row) => (
                  <li key={row.key} className={`flex items-center gap-4 border-b py-3.5 ${HAIRLINE}`}>
                    <span
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border border-black/15 dark:border-white/15 ${PROMO_INK}`}
                      aria-hidden="true"
                    >
                      {row.icon}
                    </span>
                    <span className={`min-w-0 break-words text-sm ${PROMO_INK}`}>{row.label}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <div className="lg:col-start-1 lg:row-start-2 lg:mt-14">
            <PromotionEditorial />
          </div>
        </div>

        {/* Produtos elegíveis */}
        {eligibleProducts.length > 0 && (
          <section
            id="promo-eligible-products"
            aria-labelledby="promo-eligible-title"
            className="mt-12 lg:mt-16 scroll-mt-6"
          >
            <h2
              id="promo-eligible-title"
              className={`mb-5 text-2xl font-medium md:text-3xl ${PROMO_INK}`}
              style={{ fontFamily: PROMO_SERIF }}
            >
              {t('promotionMode.eligibleItemsTitle')}
            </h2>
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
              {eligibleProducts.map((product) => {
                const preview = previews.get(product.id);
                const name = localizedField(product, 'name');
                const image = getProductImages(product)[0];
                const unavailable = product.isAvailable === false;
                const showDeal = Boolean(preview?.isEligible && preview.unitDiscount > 0 && !unavailable);
                const base = Number(product.promoPrice ?? product.price);
                const from = formatBRL(preview?.unitPriceBeforePromo ?? base);
                const to = formatBRL(preview?.unitPriceAfterPromo ?? base);
                const listStrike =
                  !showDeal && product.promoPrice != null
                    ? formatBRL(preview?.listUnitPrice ?? Number(product.price))
                    : null;
                return (
                  <li key={product.id} className="flex">
                    <div
                      className={`loc-card [--glow:var(--accent)] group relative flex w-full flex-col overflow-hidden rounded-2xl ${GLASS} transition-shadow`}
                    >
                      <button
                        type="button"
                        onClick={() => navigate(productHref(product.id))}
                        aria-label={showDeal ? `${name}. ${t('promotionMode.priceFromTo', { from, to })}` : name}
                        className={`flex flex-1 cursor-pointer flex-col text-left ${PROMO_FOCUS}`}
                      >
                        <div className={`relative flex aspect-[4/3] items-center justify-center overflow-hidden ${MENU_SURFACE_SUBTLE}`}>
                          {image ? (
                            <img
                              src={image}
                              alt=""
                              loading="lazy"
                              draggable={false}
                              className={`h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transform-none ${unavailable ? 'grayscale opacity-60' : ''}`}
                            />
                          ) : (
                            <Tag size={24} strokeWidth={1.5} className={MENU_TEXT_MUTED} aria-hidden="true" />
                          )}
                          {showDeal && preview && (
                            <span className="absolute left-2 top-2 rounded-lg bg-black/70 px-2 py-1 text-[11px] font-extrabold tracking-wide text-[#FFFFFF] shadow-sm backdrop-blur">
                              {t('promotionMode.unitSaving', { value: formatBRL(preview.unitDiscount) })}
                            </span>
                          )}
                          {unavailable && (
                            <span className="absolute left-2 top-2 rounded-full bg-gray-800/85 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                              {t('productCard.indisponivel')}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-1 flex-col p-3">
                          <p
                            className={`line-clamp-2 min-h-[2.5rem] text-sm font-semibold ${unavailable ? MENU_TEXT_MUTED : MENU_TEXT}`}
                          >
                            {name}
                          </p>
                          <div className="mt-auto flex items-baseline gap-2 pt-1.5">
                            {showDeal && (
                              <span className={`text-xs tabular-nums line-through ${MENU_TEXT_MUTED}`}>R$ {from}</span>
                            )}
                            {listStrike && (
                              <span className={`text-xs tabular-nums line-through ${MENU_TEXT_MUTED}`}>R$ {listStrike}</span>
                            )}
                            <span
                              className={`whitespace-nowrap text-sm font-bold tabular-nums ${showDeal ? '' : unavailable ? MENU_TEXT_MUTED : MENU_TEXT}`}
                              style={showDeal ? { color: 'var(--accent)' } : undefined}
                            >
                              R$ {to}
                            </span>
                          </div>
                        </div>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      {/* Barra fixa (celular/tablet): só o botão, sem fundo (decisão da sessão Z7). */}
      <div
        className={`lg:hidden fixed bottom-[var(--bottom-nav-h,0px)] left-0 right-0 z-20 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] pointer-events-none transform-gpu will-change-transform`}
      >
        <div className="max-w-xl mx-auto pointer-events-auto">{cta}</div>
      </div>
    </div>
  );
}
