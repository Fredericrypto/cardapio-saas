import { localizedField } from '../i18n/contentText';
import { activeDateLocale } from '../i18n/languages';
import { categoryLabel } from '../i18n/categoryLabel';
import { useI18n } from '../i18n/I18nContext';
import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Ban, Clock, Coins, Compass, Users, Tag, Package, CheckCircle2 } from 'lucide-react';
import { ShareButton } from '../components/ShareButton';
import { Tooltip } from '../components/Tooltip';
import { AnimatedGradientButton } from '../components/AnimatedGradientButton';
import { PromotionMedia } from '../components/promotion/PromotionMedia';
import { PromotionBadge } from '../components/promotion/PromotionBadge';
import { PromotionHeroCard } from '../components/promotion/PromotionHeroCard';
import { PromotionBenefitCard } from '../components/promotion/PromotionBenefitCard';
import { PromotionSkeleton, PromotionUnavailable } from '../components/promotion/PromotionStates';
import { buildShareUrl } from '../lib/shareLinks';
import { fetchActivePromotions, fetchCategories, fetchProducts, fetchLocationById } from '../lib/menu-api';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useTenant } from '../contexts/TenantContext';
import { useCart } from '../contexts/CartContext';
import { useAccentColor } from '../hooks/useAccentColor';
import { useTableSessionContext } from '../contexts/TableSessionContext';
import { useSelectedLocation } from '../hooks/useSelectedLocation';
import { computePromotionEligibility } from '../lib/promotionEligibility';
import { buildPromotionModePaths } from '../lib/promotionMode';
import { formatBRL, getPromotionBadgeKind, getPromotionHeroValue } from '../lib/promotionPresentation';
import { PROMO_FOCUS, PROMO_LINK_BTN } from '../lib/promotionTheme';
import { PROFILE_CARD } from '../lib/profileTheme';
import {
  MENU_PAGE_BG,
  MENU_SURFACE,
  MENU_BORDER,
  MENU_TEXT,
  MENU_TEXT_SOFT,
  MENU_TEXT_MUTED,
} from '../lib/menuTheme';
import type { Promotion, Category, Product, Location } from '../types';

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
  const [notFound, setNotFound] = useState(false);

  const { token: customerToken } = useCustomerAuth();

  // Mesma resolução de loja do MenuPage: uma promoção pode ser restrita a
  // lojas específicas (ver PromotionsService.isValidAtLocation), então
  // sem mandar a locationId certa pro backend a promoção some da lista
  // e essa tela mostra "não está mais disponível" mesmo ela existindo.
  const tableSessionCtx = useTableSessionContext();
  const tableSession = tableSessionCtx?.session ?? null;
  const { location: selectedLocation, isLoading: isSelectedLocationLoading } = useSelectedLocation(
    !isTableFlow ? tenant?.id : undefined,
  );
  const [tableLocation, setTableLocation] = useState<Location | null>(null);
  useEffect(() => {
    if (!isTableFlow || !tenant || !tableSession?.table?.locationId) return;
    fetchLocationById(tenant.id, tableSession.table.locationId).then(setTableLocation);
  }, [isTableFlow, tenant, tableSession?.table?.locationId]);
  const activeLocation = isTableFlow ? tableLocation : selectedLocation;
  // Só busca as promoções depois que a loja estiver resolvida (ou já der
  // pra saber que não tem loja pra resolver) — senão o primeiro fetch sai
  // sem locationId, filtra promoções restritas a loja e pisca "não está
  // mais disponível" antes do segundo fetch (com a location certa) corrigir.
  // Compara pelo id (em vez de um flag de loading separado) pra não ter
  // uma renderização no meio do caminho em que o fetch da location já
  // devia ter começado mas o estado "loading" ainda não foi setado.
  const isLocationReady = isTableFlow
    ? !tableSession?.table?.locationId || tableLocation?.id === tableSession.table.locationId
    : Boolean(tenant) && !isSelectedLocationLoading;

  useEffect(() => {
    if (!slug || !promotionId || !tenant || !isLocationReady) return;
    async function load() {
      const [promos, cats, prods] = await Promise.all([
        fetchActivePromotions(tenant!.id, customerToken, activeLocation?.id),
        fetchCategories(tenant!.id),
        fetchProducts(tenant!.id),
      ]);
      const found = promos.find((p) => p.id === promotionId) ?? null;
      setPromotion(found);
      setNotFound(!found);
      setCategories(cats);
      setProducts(prods);
      setIsLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, promotionId, tenant, customerToken, isLocationReady, activeLocation?.id]);

  const backHref = qrCodeToken ? `/${slug}/mesa/${qrCodeToken}` : `/${slug}`;
  const cartHref = qrCodeToken ? `/${slug}/mesa/${qrCodeToken}/carrinho` : `/${slug}/carrinho`;
  const productHref = (productId: string) =>
    qrCodeToken ? `/${slug}/mesa/${qrCodeToken}/produto/${productId}` : `/${slug}/produto/${productId}`;

  if (isLoading || !tenant) {
    return <PromotionSkeleton />;
  }

  if (notFound || !promotion) {
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

  // Produtos elegíveis (só quando a promoção é restrita a itens/categorias).
  const eligibleProducts =
    promotion.scope === 'product'
      ? products.filter((p) => promotion.productIds.includes(p.id))
      : promotion.scope === 'category'
        ? products.filter((p) => promotion.categoryIds.includes(p.categoryId))
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

  const cta = promotion.alreadyUsedUp ? (
    <button
      disabled
      className="w-full py-3.5 md:py-4 rounded-xl text-[15px] font-semibold bg-[#E5E7EB] text-[#6B7280] dark:bg-white/10 dark:text-[#C4C7C5] cursor-not-allowed"
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
        className="w-full py-3.5 md:py-4 rounded-xl text-[15px] bg-red-50 text-red-600 border border-red-100 dark:bg-red-500/10 dark:text-red-300 dark:border-red-400/20 font-semibold flex justify-center items-center gap-2 cursor-not-allowed"
      >
        <Ban size={16} strokeWidth={1.5} />
        {t('store.closedEstablishment')}
      </button>
    </div>
  ) : isApplied ? (
    <button
      onClick={handleRemove}
      className={`w-full py-3.5 md:py-4 rounded-xl text-[15px] font-semibold border-2 transition hover:bg-black/[0.03] dark:hover:bg-white/[0.06] ${PROMO_FOCUS}`}
      style={{ borderColor: accent, color: accent }}
    >
      {t('promotionDetailPage.remover_promocao')}
    </button>
  ) : (
    <AnimatedGradientButton
      onClick={handleApply}
      contentClassName="py-4 text-base font-bold flex items-center justify-center gap-2"
    >
      {t('promotionDetailPage.usar_desconto_de_valor', { value: hero.text })}
      <ArrowRight size={18} strokeWidth={1.5} aria-hidden="true" />
    </AnimatedGradientButton>
  );

  const conditionRows: { key: string; icon: React.ReactNode; label: string }[] = [];
  conditionRows.push({
    key: 'scope',
    icon: <Tag size={16} strokeWidth={1.5} />,
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
      icon: <Tag size={15} strokeWidth={1.5} />,
      label: t('promotionDetailPage.pedido_minimo_de_r', { v0: Number(promotion.minOrderValue).toFixed(2).replace('.', ',') }),
    });
  }
  if (promotion.usageLimitPerCustomer != null) {
    conditionRows.push({
      key: 'usage',
      icon: <Users size={15} strokeWidth={1.5} />,
      label:
        promotion.usageLimitPerCustomer === 1
          ? t('promotionDetailPage.limite_de_1_uso')
          : t('promotionDetailPage.limite_de_usagelimitpercustomer_usos', { usageLimitPerCustomer: promotion.usageLimitPerCustomer }),
    });
  }
  if (promotion.endsAt) {
    conditionRows.push({
      key: 'ends',
      icon: <Clock size={15} strokeWidth={1.5} />,
      label: t('promotionDetailPage.valida_ate_v0', { v0: formatDateTime(promotion.endsAt) }),
    });
  }
  if (promotion.discountType === 'percentage' && promotion.maxDiscountAmount != null) {
    conditionRows.push({
      key: 'maxdiscount',
      icon: <Coins size={15} strokeWidth={1.5} />,
      label: t('promotionDetailPage.desconto_maximo_de_r', { v0: formatBRL(promotion.maxDiscountAmount) }),
    });
  }
  if (promotion.maxEligibleQuantity != null) {
    conditionRows.push({
      key: 'maxqty',
      icon: <Package size={15} strokeWidth={1.5} />,
      label: t('promotionDetailPage.desconto_em_ate_n_unidades', { n: promotion.maxEligibleQuantity }),
    });
  }

  return (
    <div
      className={`relative min-h-screen ${MENU_PAGE_BG} pb-28 lg:pb-12`}
      style={{ '--brand': tenant.primaryColor, '--accent': accent } as React.CSSProperties}
    >
      <div className="relative w-full max-w-[88rem] mx-auto px-4 md:px-8 py-4 md:py-8 lg:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-6 lg:gap-10 items-start">
          {/* Coluna esquerda: imagem INTEIRA que cabe na altura da tela, luz ambiente
              atrás de tudo e o painel do desconto (vidro) abaixo da imagem. */}
          <PromotionMedia
            imageUrl={promotion.imageUrl}
            alt={localizedField(promotion, 'title')}
            primaryColor={tenant.primaryColor}
            grayscale={isUsedUp}
            overlay={
              <>
                <Tooltip label={t('tooltip.back')} className="contents">
                  <button
                    // Link compartilhado abre direto aqui (sem histórico): voltar leva ao cardápio.
                    onClick={() => (routerLocation.key === 'default' ? navigate(backHref, { replace: true }) : navigate(-1))}
                    aria-label={t('common.back')}
                    className={`absolute top-4 left-4 w-10 h-10 rounded-full bg-white/90 dark:bg-[#1E1E20]/90 text-[#111827] dark:text-[#E3E2E6] flex items-center justify-center shadow-md hover:scale-105 transition motion-reduce:transform-none ${PROMO_FOCUS}`}
                  >
                    <ArrowLeft size={18} strokeWidth={1.5} />
                  </button>
                </Tooltip>
                {slug && (
                  <ShareButton
                    className="absolute top-4 right-4"
                    url={buildShareUrl('promocao', slug, promotion.id)}
                    title={localizedField(promotion, 'title')}
                    text={localizedField(promotion, 'description') || t('promotionDetailPage.promocao_de_name', { name: tenant.name })}
                  />
                )}
              </>
            }
            panel={<PromotionHeroCard promotion={promotion} ariaLabel={discountLabel} muted={isUsedUp} />}
          />

          {/* Coluna direita: selo, título, benefício, ação e (por último) condições */}
          <div className="flex flex-col gap-6">
            <div className="flex flex-col items-start gap-3">
              <PromotionBadge kind={badgeKind} muted={isUsedUp} />
              <h1 className={`font-display text-3xl md:text-4xl font-extrabold leading-tight ${MENU_TEXT}`}>
                {localizedField(promotion, 'title')}
              </h1>
              {promotion.description && (
                <p className={`text-base md:text-lg ${MENU_TEXT_SOFT} leading-relaxed`}>
                  {localizedField(promotion, 'description')}
                </p>
              )}
            </div>

            {isUsedUp ? (
              <div className="rounded-2xl border border-black/10 dark:border-white/15 bg-[#FFFFFF]/50 dark:bg-white/[0.06] backdrop-blur-xl p-5 flex flex-wrap items-center gap-3">
                <CheckCircle2 size={22} strokeWidth={1.5} className={`${MENU_TEXT_SOFT} shrink-0`} aria-hidden="true" />
                <p className={`text-sm ${MENU_TEXT_SOFT} flex-1 min-w-0`}>{t('promotionDetailPage.voce_ja_usou_essa')}</p>
                <button
                  type="button"
                  onClick={() => navigate(backHref)}
                  className={`${PROMO_LINK_BTN} ${MENU_TEXT}`}
                >
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
            <div className="hidden lg:block">{cta}</div>

            {/* Entrada do Modo Promoção: navegar só pelos itens que a promoção cobre. */}
            {!isUsedUp && (
              <AnimatedGradientButton
                onClick={() => navigate(buildPromotionModePaths(slug ?? '', promotion.id, qrCodeToken).explore)}
                fillClassName={`bg-[#FFFFFF] dark:bg-[#1E1E20] ${MENU_TEXT}`}
                contentClassName="flex items-center justify-center gap-2 py-3 text-sm font-semibold"
              >
                <Compass size={16} strokeWidth={1.5} aria-hidden="true" />
                {t('promotionMode.exploreItems')}
              </AnimatedGradientButton>
            )}

            {/* Condições: depois do botão e mais leves que o benefício. */}
            <section aria-labelledby="promo-conditions-title">
              <h2
                id="promo-conditions-title"
                className={`text-xs font-semibold uppercase tracking-wider ${MENU_TEXT_SOFT} mb-2`}
              >
                {t('promotionDetailPage.detalhes_e_condicoes')}
              </h2>
              <ul className="flex flex-col gap-2">
                {conditionRows.map((row) => (
                  <li
                    key={row.key}
                    className={`flex items-center gap-3 rounded-xl border border-black/10 dark:border-white/10 bg-[#FFFFFF]/40 dark:bg-white/[0.04] backdrop-blur-xl px-4 py-3 text-sm ${MENU_TEXT_SOFT}`}
                  >
                    <span className="shrink-0" aria-hidden="true">{row.icon}</span>
                    <span className="min-w-0 break-words">{row.label}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        {/* Produtos elegíveis */}
        {eligibleProducts.length > 0 && (
          <section id="promo-eligible-products" className="mt-10 lg:mt-14 scroll-mt-6">
            <h2 className={`font-display text-lg md:text-xl font-bold ${MENU_TEXT} mb-4`}>
              {t('promotionDetailPage.valida_para_itens_selecionados')}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
              {eligibleProducts.map((product) => {
                const unavailable = product.isAvailable === false;
                const hasPromoPrice = product.promoPrice != null;
                return (
                  <button
                    key={product.id}
                    onClick={() => navigate(productHref(product.id))}
                    className={`group text-left ${PROFILE_CARD} overflow-hidden cursor-pointer transition duration-200 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none ${PROMO_FOCUS}`}
                  >
                    <div className="relative aspect-[4/3] bg-[#F3F4F6] dark:bg-[#282A2C] overflow-hidden flex items-center justify-center">
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={localizedField(product, 'name')}
                          loading="lazy"
                          draggable={false}
                          className={`w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transform-none ${unavailable ? 'grayscale opacity-60' : ''}`}
                        />
                      ) : (
                        <Tag size={24} strokeWidth={1.5} className={MENU_TEXT_MUTED} />
                      )}
                      {hero.kind === 'percentage' && !isUsedUp && (
                        <span className="absolute top-2 left-2 rounded-lg bg-black/70 backdrop-blur px-2 py-1 text-[11px] font-extrabold tracking-wide text-[#FFFFFF] shadow-sm">
                          {hero.text} {t('promotionDetailPage.off')}
                        </span>
                      )}
                    </div>
                    <div className="p-3">
                      <p className={`text-sm font-semibold ${MENU_TEXT} line-clamp-2 min-h-[2.5rem]`}>
                        {localizedField(product, 'name')}
                      </p>
                      <div className="flex items-baseline gap-2 mt-1.5">
                        <span className={`text-sm font-bold tabular-nums ${MENU_TEXT}`}>
                          R$ {Number(product.promoPrice ?? product.price).toFixed(2).replace('.', ',')}
                        </span>
                        {hasPromoPrice && (
                          <span className={`text-xs line-through tabular-nums ${MENU_TEXT_MUTED}`}>
                            R$ {Number(product.price).toFixed(2).replace('.', ',')}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {/* Barra fixa (celular/tablet) */}
      <div
        className={`lg:hidden fixed bottom-[var(--bottom-nav-h,0px)] left-0 right-0 z-20 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] ${MENU_SURFACE} border-t ${MENU_BORDER}`}
      >
        <div className="max-w-xl mx-auto">{cta}</div>
      </div>
    </div>
  );
}
