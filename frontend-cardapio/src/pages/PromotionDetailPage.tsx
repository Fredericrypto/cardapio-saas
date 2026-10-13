import { localizedField } from '../i18n/contentText';
import { promotionReasonLabel } from '../i18n/labels';
import { activeDateLocale } from '../i18n/languages';
import { categoryLabel } from '../i18n/categoryLabel';
import { useI18n } from '../i18n/I18nContext';
import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Ban, Percent, Clock, Users, Tag, CheckCircle2 } from 'lucide-react';
import { ShareButton } from '../components/ShareButton';
import { Tooltip } from '../components/Tooltip';
import { buildShareUrl } from '../lib/shareLinks';
import { fetchActivePromotions, fetchCategories, fetchProducts, fetchLocationById } from '../lib/menu-api';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useTenant } from '../contexts/TenantContext';
import { useCart } from '../contexts/CartContext';
import { useAccentColor } from '../hooks/useAccentColor';
import { useTableSessionContext } from '../contexts/TableSessionContext';
import { useSelectedLocation } from '../hooks/useSelectedLocation';
import { computePromotionEligibility } from '../lib/promotionEligibility';
import { PROFILE_CARD } from '../lib/profileTheme';
import {
  MENU_PAGE_BG,
  MENU_SURFACE,
  MENU_BORDER,
  MENU_TEXT,
  MENU_TEXT_SOFT,
  MENU_TEXT_BODY,
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
    return (
      <div className={`flex items-center justify-center h-screen ${MENU_PAGE_BG}`}>
        <div className="w-8 h-8 border-2 border-[#E5E7EB] dark:border-white/10 border-t-[#6B7280] dark:border-t-[#C4C7C5] rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !promotion) {
    return (
      <div className={`flex flex-col items-center justify-center h-screen px-6 text-center gap-3 ${MENU_PAGE_BG}`}>
        <p className={MENU_TEXT_BODY}>{t('promotionDetailPage.essa_promocao_nao_esta')}</p>
        <button
          onClick={() => navigate(backHref)}
          className="text-sm font-semibold"
          style={{ color: accent }}
        >
          {t('promotionDetailPage.voltar_pro_cardapio')}
        </button>
      </div>
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

  // Botão principal: cor da marca no claro; no escuro vira sólido claro com
  // texto escuro (nunca a cor da marca apagada sobre o fundo escuro).
  const primaryBtn =
    'w-full py-3.5 rounded-xl text-sm font-semibold text-[#FFFFFF] bg-[var(--brand)] ring-1 ring-black/5 ' +
    'dark:bg-[#E3E2E6] dark:text-[#131314] dark:ring-white/20 shadow-sm hover:brightness-110 dark:hover:brightness-95 ' +
    'active:brightness-95 transition';

  const cta = promotion.alreadyUsedUp ? (
    <button
      disabled
      className="w-full py-3.5 rounded-xl text-sm font-semibold bg-[#E5E7EB] text-[#6B7280] dark:bg-white/10 dark:text-[#C4C7C5] cursor-not-allowed"
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
        className="w-full py-3.5 rounded-xl text-sm bg-red-50 text-red-600 border border-red-100 dark:bg-red-500/10 dark:text-red-300 dark:border-red-400/20 font-semibold flex justify-center items-center gap-2 cursor-not-allowed"
      >
        <Ban size={16} strokeWidth={1.5} />
        {t('store.closedEstablishment')}
      </button>
    </div>
  ) : isApplied ? (
    <button
      onClick={handleRemove}
      className="w-full py-3.5 rounded-xl text-sm font-semibold border-2 transition hover:bg-black/[0.03] dark:hover:bg-white/[0.06]"
      style={{ borderColor: accent, color: accent }}
    >
      {t('promotionDetailPage.remover_promocao')}
    </button>
  ) : (
    <button
      onClick={handleApply}
      className={primaryBtn}
      style={{ '--brand': tenant.primaryColor } as React.CSSProperties}
    >
      {t('promotionDetailPage.usar_promocao')}
    </button>
  );

  return (
    <div className={`min-h-screen ${MENU_PAGE_BG} pb-28 lg:pb-12`}>
      <div className="w-full max-w-6xl mx-auto md:px-8 md:py-8 lg:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-10 items-start">
          {/* Coluna esquerda: banner em destaque */}
          <div className="relative aspect-[16/10] lg:aspect-[4/3] md:rounded-2xl overflow-hidden bg-[#F3F4F6] dark:bg-[#282A2C] lg:sticky lg:top-8 md:shadow-sm">
            {promotion.imageUrl ? (
              <img
                src={promotion.imageUrl}
                alt={localizedField(promotion, 'title')}
                draggable={false}
                className="w-full h-full object-cover"
              />
            ) : (
              <div
                className="w-full h-full"
                style={{
                  background: `linear-gradient(135deg, ${tenant.primaryColor}, ${tenant.primaryColor}99)`,
                }}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/20" aria-hidden="true" />
            <Tooltip label={t('tooltip.back')} className="contents">
              <button
                // Link compartilhado abre direto aqui (sem histórico): voltar leva ao cardápio.
                onClick={() => (routerLocation.key === 'default' ? navigate(backHref, { replace: true }) : navigate(-1))}
                aria-label={t('common.back')}
                className="absolute top-4 left-4 w-10 h-10 rounded-full bg-white/90 dark:bg-[#1E1E20]/90 text-[#111827] dark:text-[#E3E2E6] flex items-center justify-center shadow-md hover:scale-105 transition"
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
            <div className="absolute bottom-4 left-4 inline-flex items-center gap-1.5 rounded-full bg-white/95 dark:bg-[#1E1E20]/95 text-[#111827] dark:text-[#E3E2E6] px-3.5 py-2 text-sm font-bold shadow-md">
              <Percent size={15} strokeWidth={1.5} />
              {discountLabel}
            </div>
          </div>

          {/* Coluna direita: título, regras e ação */}
          <div className="p-4 md:p-0 pt-5 lg:pt-1 flex flex-col gap-5">
            <div>
              <h1 className={`font-display text-2xl md:text-3xl font-extrabold leading-tight ${MENU_TEXT}`}>
                {localizedField(promotion, 'title')}
              </h1>
              {promotion.description && (
                <p className={`text-sm md:text-base ${MENU_TEXT_BODY} leading-relaxed mt-2.5`}>
                  {localizedField(promotion, 'description')}
                </p>
              )}
            </div>

            <div className={`${PROFILE_CARD} p-4 md:p-5`}>
              <p className={`text-xs font-semibold uppercase tracking-wider ${MENU_TEXT_MUTED} mb-3`}>
                {t('promotionDetailPage.detalhes_e_condicoes')}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <DetailRow icon={<Percent size={16} strokeWidth={1.5} />} label={discountLabel} />
                {promotion.minOrderValue > 0 && (
                  <DetailRow
                    icon={<Tag size={16} strokeWidth={1.5} />}
                    label={t('promotionDetailPage.pedido_minimo_de_r', { v0: Number(promotion.minOrderValue).toFixed(2).replace('.', ',') })}
                  />
                )}
                {promotion.usageLimitPerCustomer != null && (
                  <DetailRow
                    icon={<Users size={16} strokeWidth={1.5} />}
                    label={
                      promotion.usageLimitPerCustomer === 1
                        ? t('promotionDetailPage.limite_de_1_uso')
                        : t('promotionDetailPage.limite_de_usagelimitpercustomer_usos', { usageLimitPerCustomer: promotion.usageLimitPerCustomer })
                    }
                  />
                )}
                {promotion.endsAt && (
                  <DetailRow
                    icon={<Clock size={16} strokeWidth={1.5} />}
                    label={t('promotionDetailPage.valida_ate_v0', { v0: formatDateTime(promotion.endsAt) })}
                  />
                )}
                <DetailRow
                  className="sm:col-span-2"
                  icon={<Tag size={16} strokeWidth={1.5} />}
                  label={
                    promotion.scope === 'all'
                      ? t('promotionDetailPage.valida_para_todos_os')
                      : scopeNames.length > 0
                        ? t('promotionDetailPage.valida_so_para_v0', { v0: scopeNames.join(', ') })
                        : t('promotionDetailPage.valida_para_itens_selecionados')
                  }
                />
              </div>
            </div>

            {promotion.alreadyUsedUp ? (
              <div className="bg-[#F9FAFB] dark:bg-[#282A2C] border border-[#E5E7EB] dark:border-white/10 rounded-xl p-3.5 text-sm text-[#6B7280] dark:text-[#C4C7C5] text-center">
                {t('promotionDetailPage.voce_ja_usou_essa')}
              </div>
            ) : eligibility.isEligible ? (
              <div className="bg-green-50 dark:bg-green-500/10 border border-green-100 dark:border-green-400/20 rounded-xl p-3.5 flex items-center gap-2.5">
                <CheckCircle2 size={18} strokeWidth={1.5} className="text-green-600 dark:text-green-400 shrink-0" />
                <p className="text-sm text-green-700 dark:text-green-300">
                  {t('promotionDetailPage.voce_economiza')} <strong>R$ {eligibility.discountAmount.toFixed(2).replace('.', ',')}</strong> {t('promotionDetailPage.com_o_carrinho_atual')}
                </p>
              </div>
            ) : (
              eligibility.reason && (
                <div className="bg-orange-50 dark:bg-orange-500/10 border border-orange-100 dark:border-orange-400/20 rounded-xl p-3.5 text-sm text-orange-700 dark:text-orange-300">
                  {promotionReasonLabel(eligibility, t)}
                </div>
              )
            )}

            {/* Ação principal inline no desktop; no celular fica fixa no rodapé. */}
            <div className="hidden lg:block">{cta}</div>
          </div>
        </div>

        {/* Produtos elegíveis */}
        {eligibleProducts.length > 0 && (
          <section className="px-4 md:px-0 mt-8 lg:mt-12">
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
                    className={`group text-left ${PROFILE_CARD} overflow-hidden cursor-pointer transition duration-200 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none`}
                  >
                    <div className="aspect-[4/3] bg-[#F3F4F6] dark:bg-[#282A2C] overflow-hidden flex items-center justify-center">
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
      <div className={`lg:hidden fixed bottom-0 left-0 right-0 p-4 ${MENU_SURFACE} border-t ${MENU_BORDER}`}>
        <div className="max-w-xl mx-auto">{cta}</div>
      </div>
    </div>
  );
}

function DetailRow({ icon, label, className = '' }: { icon: React.ReactNode; label: string; className?: string }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl bg-[#F9FAFB] dark:bg-[#282A2C] border border-[#F3F4F6] dark:border-white/10 px-3.5 py-3 text-sm ${MENU_TEXT_SOFT} ${className}`}
    >
      <span className={`${MENU_TEXT_BODY} shrink-0`}>{icon}</span>
      <span className="min-w-0 break-words">{label}</span>
    </div>
  );
}
