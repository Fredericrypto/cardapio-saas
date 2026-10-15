import { localizedField } from '../i18n/contentText';
import { useI18n } from '../i18n/I18nContext';
import { useStoreStatus } from '../hooks/useStoreStatus';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Ban, ChevronRight, Minus, Plus, Star, Tag } from 'lucide-react';
import { fetchActivePromotions, fetchProducts } from '../lib/menu-api';
import { fetchItemReviewsSummary } from '../lib/customer-api';
import type { ReviewSummary } from '../lib/customer-api';
import type { Product, ProductOptionGroup, Promotion } from '../types';
import { useCart } from '../contexts/CartContext';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useAccentColor } from '../hooks/useAccentColor';
import { useTenant } from '../contexts/TenantContext';
import { CartIcon } from '../components/MenuIcons';
import { AnimatedGradientButton } from '../components/AnimatedGradientButton';
import { useActiveLocation } from '../hooks/useActiveLocation';
import { ShareButton } from '../components/ShareButton';
import { Tooltip } from '../components/Tooltip';
import { ProductImageCarousel } from '../components/ProductImageCarousel';
import { getProductImages } from '../lib/productImages';
import { buildShareUrl } from '../lib/shareLinks';
import { ProductOptionGroupList } from '../components/ProductOptionGroupList';
import {
  buildSelectedOptions,
  findUnmetOptionGroup,
  toggleOptionValue,
  visibleOptionGroups,
  type OptionSelections,
} from '../lib/productOptions';
import { pickItemPromotion } from '../lib/promotionEligibility';
import { formatBRL as formatBRLPlain } from '../lib/promotionPresentation';
import { PROMO_SUCCESS_TEXT } from '../lib/promotionTheme';
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

function formatMoney(value: number): string {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

// Mesma forma que a nota do restaurante aparece no header do cardápio
// (ver MenuHeader.useReviewSummary) — pedido explícito do Felipe. A nota
// abre a página completa de avaliações do item (ItemReviewsPage); não há
// mais lista solta de avaliações no pé desta tela.
function useItemReviewSummary(tenantId: string, productId: string | undefined) {
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  useEffect(() => {
    if (!productId) return;
    fetchItemReviewsSummary(tenantId, productId)
      .then(setSummary)
      .catch(() => setSummary(null));
  }, [tenantId, productId]);
  return summary;
}

export function ProductDetailPage() {
  const { t } = useI18n();
  const { slug, productId, qrCodeToken } = useParams<{
    slug: string;
    productId: string;
    qrCodeToken?: string;
  }>();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const { addItem, selectedPromotionIds, totalPrice } = useCart();
  const { token: customerToken } = useCustomerAuth();

  const { tenant } = useTenant();
  const accent = useAccentColor(tenant?.primaryColor ?? '#111827');
  // Loja fechada: a tela abre normalmente para ler o item, mas não deixa adicionar.
  const activeLocation = useActiveLocation(tenant?.id, Boolean(qrCodeToken));
  const storeStatus = useStoreStatus(activeLocation);
  const isStoreClosed = !storeStatus.isOpen && Boolean(activeLocation);
  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  // groupId -> array de valueIds escolhidos nesse grupo
  const [selections, setSelections] = useState<OptionSelections>({});
  const [validationError, setValidationError] = useState<string | null>(null);
  const itemReviewSummary = useItemReviewSummary(tenant?.id ?? '', productId);

  useEffect(() => {
    if (!tenant || !productId) return;

    async function load() {
      const products = await fetchProducts(tenant!.id);
      const found = products.find((p) => p.id === productId) ?? null;
      setProduct(found);
      setIsLoading(false);
    }

    load();
  }, [tenant, productId]);

  // Mesma lógica do cardápio: atualiza sozinho a cada 15s, silenciosamente
  // — se o admin desmarcar um adicional como indisponível enquanto o
  // cliente está decidindo aqui, some da lista sem precisar de F5.
  useEffect(() => {
    if (!tenant?.id || !productId) return;
    const interval = setInterval(() => {
      fetchProducts(tenant.id)
        .then((products) => {
          const found = products.find((p) => p.id === productId);
          if (found) setProduct(found);
        })
        .catch(() => {
          // Falha pontual — tenta de novo no próximo ciclo.
        });
    }, 15000);
    return () => clearInterval(interval);
  }, [tenant?.id, productId]);

  // Promoções ativas da loja (mesma busca do cardápio) para mostrar, aqui também,
  // o preço riscado e o preço final de uma promoção que o cliente ativou.
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  useEffect(() => {
    if (!tenant?.id) return;
    let isStale = false;
    fetchActivePromotions(tenant.id, customerToken, activeLocation?.id)
      .then((result) => {
        if (!isStale) setPromotions(result);
      })
      .catch(() => {
        if (!isStale) setPromotions([]);
      });
    return () => {
      isStale = true;
    };
  }, [tenant?.id, customerToken, activeLocation?.id]);
  const selectedPromotions = useMemo(
    () =>
      selectedPromotionIds
        .map((id) => promotions.find((p) => p.id === id))
        .filter((p): p is Promotion => p != null),
    [selectedPromotionIds, promotions],
  );

  if (isLoading || !tenant) {
    return (
      <div className={`flex items-center justify-center h-screen ${MENU_PAGE_BG}`}>
        <div className="w-8 h-8 border-2 border-[#E5E7EB] dark:border-white/10 border-t-[#6B7280] dark:border-t-[#C4C7C5] rounded-full animate-spin" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className={`flex flex-col items-center justify-center h-screen px-6 text-center ${MENU_PAGE_BG}`}>
        <p className={MENU_TEXT_BODY}>{t('productDetailPage.produto_nao_encontrado')}</p>
      </div>
    );
  }

  const brand = tenant.primaryColor;
  const backHref = qrCodeToken ? `/${slug}/mesa/${qrCodeToken}` : `/${slug}`;

  // Grupo sem nenhuma opção cadastrada não aparece pro cliente — ficaria
  // um título "morto" sem nada clicável embaixo (bug visto em produção:
  // grupo criado no admin sem nenhuma opção preenchida).
  const optionGroups = visibleOptionGroups(product);

  function handleToggleOption(group: ProductOptionGroup, valueId: string) {
    setValidationError(null);
    const result = toggleOptionValue(selections, group, valueId);
    if (result.error) {
      setValidationError(
        t('productDetailPage.maximo_de_maxselect_opcoes', {
          maxSelect: result.error.maxSelect,
          groupName: result.error.groupName,
        }),
      );
    }
    setSelections(result.selections);
  }

  // Preço = base + soma dos adicionais escolhidos, em todos os grupos.
  const selectedOptionsList = buildSelectedOptions(optionGroups, selections);
  const optionsDelta = selectedOptionsList.reduce((sum, o) => sum + o.priceDelta, 0);
  const displayPrice = Number(product.promoPrice ?? product.price) + optionsDelta;
  // Promoção ATIVADA que cobre o item: mesma simulação do cardápio e do Modo
  // Promoção (motor único), então o preço daqui bate com o do carrinho.
  const headerDeal = pickItemPromotion(selectedPromotions, product);
  const lineDeal = pickItemPromotion(selectedPromotions, product, {
    selectedOptions: selectedOptionsList,
    quantity,
    cartTotal: totalPrice,
  });
  const subtotal = lineDeal ? lineDeal.preview.lineTotalAfterPromo : displayPrice * quantity;
  const headerPrice = headerDeal ? headerDeal.preview.unitPriceAfterPromo : Number(product.promoPrice ?? product.price);
  const headerStrike = headerDeal
    ? headerDeal.preview.unitPriceBeforePromo
    : product.promoPrice != null
      ? Number(product.price)
      : null;
  const minOrderMissing = lineDeal?.preview.minOrder ?? null;

  function handleAddToCart() {
    if (!product || product.isAvailable === false || isStoreClosed) return;

    // Confere grupos obrigatórios antes de deixar adicionar — mesma
    // regra que o backend também confere (defesa em profundidade: aqui
    // é só pra dar feedback rápido, quem garante de verdade é o server).
    const unmet = findUnmetOptionGroup(optionGroups, selections);
    if (unmet) {
      setValidationError(
        unmet.minSelect === 1
          ? t('productDetailPage.escolha_uma_opcao_em', { name: unmet.name })
          : t('productDetailPage.escolha_pelo_menos_minselect', { minSelect: unmet.minSelect, name: unmet.name }),
      );
      return;
    }

    addItem(product, selectedOptionsList, quantity);
    navigate(backHref);
  }

  const ratingStars =
    itemReviewSummary && itemReviewSummary.count > 0 ? Math.round(itemReviewSummary.average) : 0;

  const qtyBtn =
    'w-9 h-9 rounded-full bg-[#FFFFFF] dark:bg-[#3A3C3E] text-[#374151] dark:text-[#E3E2E6] ' +
    'flex items-center justify-center shadow-sm border border-[#E5E7EB] dark:border-white/10 ' +
    'hover:bg-[#F9FAFB] dark:hover:bg-[#46484A] disabled:opacity-40 disabled:cursor-not-allowed transition';

  const quantityControl = (
    <div className="inline-flex items-center gap-2 rounded-full bg-[#F3F4F6] dark:bg-[#1E1E20] border border-[#E5E7EB] dark:border-white/10 p-1">
      <Tooltip label={t('tooltip.decrease')}>
        <button
          type="button"
          onClick={() => setQuantity((q) => Math.max(1, q - 1))}
          disabled={quantity <= 1}
          aria-label={t('tooltip.decrease')}
          className={qtyBtn}
        >
          <Minus size={16} strokeWidth={1.5} />
        </button>
      </Tooltip>
      <span className={`w-8 text-center font-semibold tabular-nums ${MENU_TEXT}`} aria-live="polite">
        {quantity}
      </span>
      <Tooltip label={t('tooltip.increase')}>
        <button
          type="button"
          onClick={() => setQuantity((q) => q + 1)}
          aria-label={t('tooltip.increase')}
          className={qtyBtn}
        >
          <Plus size={16} strokeWidth={1.5} />
        </button>
      </Tooltip>
    </div>
  );

  const cta =
    isStoreClosed && product.isAvailable !== false ? (
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] text-red-500 dark:text-red-400 text-center">{t('store.closedHint')}</p>
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="w-full py-3.5 rounded-xl text-sm bg-red-50 text-red-600 border border-red-100 dark:bg-red-500/10 dark:text-red-300 dark:border-red-400/20 font-semibold flex justify-center items-center gap-2 px-5 cursor-not-allowed"
        >
          <Ban size={16} strokeWidth={1.5} />
          {t('store.closedEstablishment')}
        </button>
      </div>
    ) : product.isAvailable === false ? (
      <button
        type="button"
        disabled
        aria-disabled="true"
        className="w-full py-3.5 rounded-xl text-sm bg-[#E5E7EB] text-[#6B7280] dark:bg-white/10 dark:text-[#C4C7C5] font-semibold flex justify-center items-center gap-2 px-5 cursor-not-allowed"
      >
        <Ban size={16} strokeWidth={1.5} />
        {t('productCard.indisponivel')}
      </button>
    ) : (
      // Botão principal: cor da marca no claro; no escuro vira sólido claro com
      // texto escuro (nunca a cor da marca apagada sobre o fundo escuro). A borda
      // animada usa a cor primária e a secundária do restaurante.
      <AnimatedGradientButton
        onClick={handleAddToCart}
        contentClassName="py-3.5 text-sm font-semibold flex justify-between items-center px-5"
      >
        <span className="flex items-center gap-2">
          <CartIcon size={16} />
          {t('productDetailPage.adicionar')}
        </span>
        <span className="flex items-baseline gap-2 tabular-nums">
          {lineDeal && lineDeal.preview.lineDiscount > 0 && (
            <span className="text-xs font-normal line-through opacity-70">
              {formatMoney(lineDeal.preview.lineTotalBeforePromo)}
            </span>
          )}
          <span>{formatMoney(subtotal)}</span>
        </span>
      </AnimatedGradientButton>
    );

  return (
    <div className={`min-h-screen ${MENU_PAGE_BG} pb-28 lg:pb-12`}>
      <div className="w-full max-w-6xl mx-auto md:px-8 md:py-8 lg:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-10 items-start">
          {/* Coluna esquerda: imagem em destaque */}
          <div className="relative aspect-[4/3] md:aspect-[16/9] lg:aspect-square md:rounded-2xl overflow-hidden bg-[#F3F4F6] dark:bg-[#282A2C] lg:sticky lg:top-8 md:shadow-sm">
            {getProductImages(product).length > 0 ? (
              <ProductImageCarousel
                images={getProductImages(product)}
                alt={localizedField(product, 'name')}
                size="detail"
                imgClassName={product.isAvailable === false ? 'grayscale opacity-60' : ''}
              />
            ) : (
              <div className={`w-full h-full flex items-center justify-center ${MENU_TEXT_MUTED}`}>
                {t('productCard.sem_foto')}
              </div>
            )}
            <Tooltip label={t('tooltip.back')} className="contents">
              <button
                type="button"
                // Link compartilhado abre direto aqui (sem histórico para voltar):
                // nesse caso "voltar" leva ao cardápio em vez de sair do app.
                onClick={() =>
                  routerLocation.key === 'default' ? navigate(backHref, { replace: true }) : navigate(-1)
                }
                aria-label={t('common.back')}
                className="absolute top-4 left-4 w-10 h-10 rounded-full bg-white/90 dark:bg-[#1E1E20]/90 text-[#111827] dark:text-[#E3E2E6] flex items-center justify-center shadow-md hover:scale-105 transition"
              >
                <ArrowLeft size={18} strokeWidth={1.5} />
              </button>
            </Tooltip>
            {slug && (
              <ShareButton
                className="absolute top-4 right-4"
                url={buildShareUrl('produto', slug, product.id)}
                title={localizedField(product, 'name')}
                text={product.description ?? t('productDetailPage.olha_esse_item_de', { name: tenant.name })}
              />
            )}
          </div>

          {/* Coluna direita: título, nota, preço, descrição, opções e ação */}
          <div className="p-4 md:p-0 pt-5 lg:pt-1 flex flex-col gap-5">
            <div>
              <h1 className={`font-display text-2xl md:text-3xl font-extrabold leading-tight ${MENU_TEXT}`}>
                {localizedField(product, 'name')}
              </h1>

              {itemReviewSummary && (
                <button
                  type="button"
                  onClick={() => navigate(`/${slug}/produto/${productId}/avaliacoes`)}
                  aria-label={t('productDetailPage.ver_avaliacoes_desse_item')}
                  className="flex items-center gap-1.5 mt-2.5 rounded-md hover:opacity-80 transition"
                >
                  <span className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        size={15}
                        strokeWidth={1.5}
                        fill={n <= ratingStars ? '#F59E0B' : 'transparent'}
                        className={n <= ratingStars ? 'text-amber-500' : 'text-[#D1D5DB] dark:text-white/25'}
                      />
                    ))}
                  </span>
                  {itemReviewSummary.count > 0 && (
                    <span className={`text-sm font-semibold tabular-nums ${MENU_TEXT_SOFT}`}>
                      {itemReviewSummary.average.toFixed(1)}
                    </span>
                  )}
                  <span className={`text-sm ${MENU_TEXT_MUTED}`}>
                    ({itemReviewSummary.count}{' '}
                    {itemReviewSummary.count === 1 ? t('reviewsShared.avaliacao') : t('reviewsShared.avaliacoes_2')})
                  </span>
                  {itemReviewSummary.count > 0 && (
                    <ChevronRight size={14} strokeWidth={1.5} className={MENU_TEXT_MUTED} />
                  )}
                </button>
              )}

              <div className="flex items-baseline gap-2.5 mt-4">
                <span className="text-3xl font-extrabold tabular-nums" style={{ color: accent }}>
                  {formatMoney(headerPrice)}
                </span>
                {headerStrike != null && (
                  <span className={`text-base line-through tabular-nums ${MENU_TEXT_MUTED}`}>
                    {formatMoney(headerStrike)}
                  </span>
                )}
              </div>

              {headerDeal && (
                <div className="mt-3 flex flex-col gap-1">
                  <p className="inline-flex items-center gap-1.5 self-start rounded-full bg-green-50 px-2.5 py-1 text-xs font-bold text-green-700 dark:bg-green-500/10 dark:text-green-300">
                    <Tag size={12} strokeWidth={1.75} aria-hidden="true" />
                    {t('promotionMode.appliedTag', { title: localizedField(headerDeal.promotion, 'title') })}
                    {' · '}
                    {t('promotionMode.unitSaving', { value: formatBRLPlain(headerDeal.preview.unitDiscount) })}
                  </p>
                  {minOrderMissing && (
                    <p className={`text-xs ${MENU_TEXT_BODY}`}>
                      {t('promotionMode.minOrderMissing', {
                        missing: formatBRLPlain(minOrderMissing.missing),
                        minimum: formatBRLPlain(minOrderMissing.required),
                      })}
                    </p>
                  )}
                  {lineDeal && lineDeal.preview.lineDiscount > 0 && (
                    <p className={`text-xs font-semibold ${PROMO_SUCCESS_TEXT}`}>
                      {t('promotionMode.lineSaving', { value: formatBRLPlain(lineDeal.preview.lineDiscount) })}
                    </p>
                  )}
                </div>
              )}

              {product.description && (
                <p className={`text-sm md:text-base ${MENU_TEXT_BODY} leading-relaxed mt-4`}>
                  {localizedField(product, 'description')}
                </p>
              )}
            </div>

            {/* Quantidade (celular/tablet). No desktop fica junto da ação. */}
            <div className="lg:hidden">{quantityControl}</div>

            {optionGroups.length > 0 && (
              <ProductOptionGroupList
                groups={optionGroups}
                selections={selections}
                onToggle={handleToggleOption}
                brand={brand}
              />
            )}

            {validationError && (
              <p role="alert" className="text-sm text-red-500 dark:text-red-400">
                {validationError}
              </p>
            )}

            {/* Ação principal inline no desktop; no celular fica fixa no rodapé. */}
            <div className={`hidden lg:flex flex-col gap-4 ${PROFILE_CARD} p-5`}>
              <div>{quantityControl}</div>
              {cta}
            </div>
          </div>
        </div>
      </div>

      {/* Barra fixa (celular/tablet).
          BUG CORRIGIDO (mantido): em alguns navegadores/WebViews Android, uma
          barra fixa cujo conteúdo muda de cor via `style` dinâmico às vezes só
          é pintada depois de QUALQUER interação na tela. `translateZ(0)` força
          esse bloco para a própria camada de composição. */}
      <div
        className={`lg:hidden fixed bottom-0 left-0 right-0 p-4 ${MENU_SURFACE} border-t ${MENU_BORDER}`}
        style={{ transform: 'translateZ(0)' }}
      >
        <div className="max-w-xl mx-auto">{cta}</div>
      </div>
    </div>
  );
}
