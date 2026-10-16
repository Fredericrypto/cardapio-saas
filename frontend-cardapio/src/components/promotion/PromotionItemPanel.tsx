import { useCallback, useId, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { Ban, Check, ChevronRight, Info, Maximize2, Tag, X } from 'lucide-react';
import { useCart } from '../../contexts/CartContext';
import { localizedField } from '../../i18n/contentText';
import { useI18n } from '../../i18n/I18nContext';
import { CartIcon } from '../MenuIcons';
import { AnimatedGradientButton } from '../AnimatedGradientButton';
import { ImageLightbox } from '../ImageLightbox';
import { ProductImageCarousel } from '../ProductImageCarousel';
import { ProductOptionGroupList } from '../ProductOptionGroupList';
import { ShareButton } from '../ShareButton';
import { PromotionQuantityStepper } from './PromotionQuantityStepper';
import { Tooltip } from '../Tooltip';
import { buildLineKey, findCartLine } from '../../lib/cartLines';
import { MENU_SURFACE, MENU_TEXT, MENU_TEXT_BODY, MENU_TEXT_MUTED } from '../../lib/menuTheme';
import { getProductImages } from '../../lib/productImages';
import {
  buildSelectedOptions,
  findUnmetOptionGroup,
  toggleOptionValue,
  visibleOptionGroups,
  type OptionSelections,
} from '../../lib/productOptions';
import { previewItemPromotion } from '../../lib/promotionEligibility';
import { formatBRL } from '../../lib/promotionPresentation';
import { PROMO_FOCUS, PROMO_SUCCESS_TEXT } from '../../lib/promotionTheme';
import type { Product, ProductOptionGroup, Promotion } from '../../types';

// Layout interno do CTA; a moldura e a borda animada vêm do AnimatedGradientButton.
const CTA_CONTENT = 'py-3.5 text-sm font-semibold flex justify-between items-center gap-3 px-5';
// Status "Adicionado ao carrinho": padding menor e texto que pode quebrar em 2 linhas (cabe ao lado do seletor).
const CTA_STATUS = 'py-2.5 px-4 text-sm font-semibold leading-tight flex justify-between items-center gap-3';
// "Adicionado ao carrinho": preenchimento verde, SEM borda animada e sem ação
// (é status, não convite: quem mexe na quantidade é o seletor ao lado).
const CTA_ADDED_FILL = 'text-[#FFFFFF] bg-green-600 dark:bg-green-500 dark:text-[#131314]';

export interface PromotionItemPanelProps {
  product: Product;
  promotion: Promotion;
  // Total atual do carrinho: só para o aviso informativo de pedido mínimo.
  cartTotal: number;
  primaryColor: string;
  storeClosed: boolean;
  shareUrl: string | null;
  // Página completa do item (avaliações, etc.), no fluxo certo (geral ou mesa).
  fullPageHref: string;
  onClose: () => void;
  // 'aside' = coluna lateral do desktop; 'sheet' = dentro do bottom-sheet.
  variant: 'aside' | 'sheet';
  // Id do título (o bottom-sheet o usa em aria-labelledby).
  titleId?: string;
}

// Painel de detalhe do item (master-detail). Não faz conta nenhuma: preço
// riscado e preço final vêm de previewItemPromotion (o MESMO motor do carrinho)
// com a quantidade e os adicionais escolhidos aqui. A tela pai remonta o painel
// (key = id do produto) a cada troca de item, então quantidade e escolhas
// começam limpas para cada item.
//
// Carrinho: o painel representa "este produto com ESTES adicionais" (a linha do
// carrinho, achada por buildLineKey). Fora do carrinho, o seletor ajusta a
// quantidade de um rascunho e o botão principal adiciona. Com a linha no
// carrinho, o seletor passa a ser o do próprio carrinho (tempo real, inclusive
// quando o card ou o carrinho mudam a quantidade) e o botão vira o status
// "Adicionado ao carrinho"; reduzir a 0 remove a linha e o botão volta a
// "Adicionar".
export function PromotionItemPanel({
  product,
  promotion,
  cartTotal,
  primaryColor,
  storeClosed,
  shareUrl,
  fullPageHref,
  onClose,
  variant,
  titleId,
}: PromotionItemPanelProps) {
  const { t } = useI18n();
  const { items, addItem, increaseItem, decreaseItem } = useCart();
  const fallbackId = useId();
  const headingId = titleId ?? fallbackId;

  // Quantidade do RASCUNHO (só vale enquanto a linha não está no carrinho).
  const [draftQuantity, setDraftQuantity] = useState(1);
  const [selections, setSelections] = useState<OptionSelections>({});
  const [validationError, setValidationError] = useState<string | null>(null);
  // Foto ampliada (ImageLightbox): abre na foto que o carrossel estava mostrando.
  const [zoomOpen, setZoomOpen] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const zoomButtonRef = useRef<HTMLButtonElement | null>(null);

  const groups = useMemo(() => visibleOptionGroups(product), [product]);
  const selectedOptions = useMemo(() => buildSelectedOptions(groups, selections), [groups, selections]);
  const lineKey = useMemo(() => buildLineKey(product.id, selectedOptions), [product.id, selectedOptions]);
  const cartLine = useMemo(() => findCartLine(items, lineKey), [items, lineKey]);
  const inCart = cartLine !== null;
  const quantity = cartLine ? cartLine.quantity : draftQuantity;
  const preview = useMemo(
    () => previewItemPromotion(promotion, product, { selectedOptions, quantity, cartTotal }),
    [promotion, product, selectedOptions, quantity, cartTotal],
  );

  const name = localizedField(product, 'name');
  const description = localizedField(product, 'description');
  const images = getProductImages(product);
  const isUnavailable = product.isAvailable === false;
  const showDeal = preview.isEligible && preview.unitDiscount > 0 && !isUnavailable;
  const outOfPromotion = !preview.covered;
  // Item com promoPrice próprio e fora da promoção: mantém o preço de tabela riscado.
  const showListStrike = !showDeal && product.promoPrice != null && preview.listUnitPrice > preview.unitPriceBeforePromo;

  const closeZoom = useCallback(() => {
    setZoomOpen(false);
    requestAnimationFrame(() => zoomButtonRef.current?.focus({ preventScroll: true }));
  }, []);

  const handleToggle = useCallback(
    (group: ProductOptionGroup, valueId: string) => {
      setValidationError(null);
      setSelections((prev) => {
        const result = toggleOptionValue(prev, group, valueId);
        if (result.error) {
          setValidationError(
            t('productDetailPage.maximo_de_maxselect_opcoes', {
              maxSelect: result.error.maxSelect,
              groupName: result.error.groupName,
            }),
          );
        }
        return result.selections;
      });
    },
    [t],
  );

  function handleAdd() {
    if (isUnavailable || storeClosed) return;
    const unmet = findUnmetOptionGroup(groups, selections);
    if (unmet) {
      setValidationError(
        unmet.minSelect === 1
          ? t('productDetailPage.escolha_uma_opcao_em', { name: unmet.name })
          : t('productDetailPage.escolha_pelo_menos_minselect', { minSelect: unmet.minSelect, name: unmet.name }),
      );
      return;
    }
    addItem(product, selectedOptions, draftQuantity);
    setValidationError(null);
    setDraftQuantity(1);
  }

  // Item indisponível/loja fechada: nunca aumenta, mas dá para REMOVER o que já
  // está no carrinho. Sem a linha no carrinho não há o que ajustar.
  const blocked = isUnavailable || storeClosed;

  function handleIncrease() {
    if (blocked) return;
    if (cartLine) increaseItem(cartLine.lineKey);
    else setDraftQuantity((q) => q + 1);
  }

  function handleDecrease() {
    if (cartLine) {
      setValidationError(null);
      decreaseItem(cartLine.lineKey); // em 1 remove a linha; o painel volta ao rascunho
    } else {
      setDraftQuantity((q) => Math.max(1, q - 1));
    }
  }

  const from = formatBRL(preview.unitPriceBeforePromo);
  const to = formatBRL(preview.unitPriceAfterPromo);
  const lineAfter = formatBRL(preview.lineTotalAfterPromo);

  const minOrderNote =
    showDeal && preview.minOrder
      ? t('promotionMode.minOrderMissing', {
          missing: formatBRL(preview.minOrder.missing),
          minimum: formatBRL(preview.minOrder.required),
        })
      : null;
  const limit = promotion.maxEligibleQuantity;
  const limitNote =
    showDeal && limit != null && limit > 0
      ? t(limit === 1 ? 'promotionMode.limitedOne' : 'promotionMode.limitedMany', { count: limit })
      : null;

  let cta: React.ReactNode;
  if (storeClosed && !isUnavailable) {
    cta = (
      <button
        type="button"
        disabled
        aria-disabled="true"
        className="w-full py-3.5 rounded-xl text-sm bg-red-50 text-red-600 border border-red-100 dark:bg-red-500/10 dark:text-red-300 dark:border-red-400/20 font-semibold flex justify-center items-center gap-2 px-5 cursor-not-allowed"
      >
        <Ban size={16} strokeWidth={1.5} aria-hidden="true" />
        {t('store.closedEstablishment')}
      </button>
    );
  } else if (isUnavailable) {
    cta = (
      <button
        type="button"
        disabled
        aria-disabled="true"
        className="w-full py-3.5 rounded-xl text-sm bg-[#E5E7EB] text-[#6B7280] dark:bg-white/10 dark:text-[#C4C7C5] font-semibold flex justify-center items-center gap-2 px-5 cursor-not-allowed"
      >
        <Ban size={16} strokeWidth={1.5} aria-hidden="true" />
        {t('productCard.indisponivel')}
      </button>
    );
  } else if (inCart) {
    cta = (
      <div className={`w-full rounded-xl promo-added-pop ${CTA_STATUS} ${CTA_ADDED_FILL}`}>
        <span className="flex min-w-0 items-center gap-2">
          <Check size={16} strokeWidth={2} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0">{t('promotionMode.added')}</span>
        </span>
        <span className="shrink-0 whitespace-nowrap tabular-nums">R$ {lineAfter}</span>
      </div>
    );
  } else {
    cta = (
      <AnimatedGradientButton onClick={handleAdd} contentClassName={CTA_CONTENT}>
        <span className="flex items-center gap-2 whitespace-nowrap">
          <CartIcon size={16} />
          {t('productDetailPage.adicionar')}
        </span>
        <span className="whitespace-nowrap tabular-nums">R$ {lineAfter}</span>
      </AnimatedGradientButton>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div
          className={`relative w-full overflow-hidden bg-[#F3F4F6] dark:bg-[#282A2C] ${
            variant === 'aside' ? 'aspect-[4/3]' : 'aspect-[16/10]'
          }`}
        >
          {images.length > 0 ? (
            // Clicar na foto amplia (só aqui, no painel — os cards da grade não). Setas
            // do carrossel e arrastar já interrompem o clique; o botão abaixo é o
            // caminho para teclado/leitor de tela.
            <div className="absolute inset-0 cursor-zoom-in" onClick={() => setZoomOpen(true)}>
              <ProductImageCarousel
                images={images}
                alt={name}
                size="detail"
                imgClassName={isUnavailable ? 'grayscale opacity-60' : ''}
                onIndexChange={setPhotoIndex}
              />
            </div>
          ) : (
            <div className={`flex h-full w-full items-center justify-center text-sm ${MENU_TEXT_MUTED}`}>
              {t('productCard.sem_foto')}
            </div>
          )}
          <Tooltip label={t('promotionMode.closePanel')} className="contents">
            <button
              type="button"
              onClick={onClose}
              aria-label={t('promotionMode.closePanel')}
              className={`absolute left-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-[#111827] shadow-md transition hover:scale-105 dark:bg-[#1E1E20]/90 dark:text-[#E3E2E6] ${PROMO_FOCUS}`}
            >
              <X size={18} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </Tooltip>
          {shareUrl && (
            <ShareButton
              className="absolute right-3 top-3"
              url={shareUrl}
              title={name}
              text={product.description ?? undefined}
            />
          )}
          {images.length > 0 && (
            <Tooltip label={t('promotionMode.zoomPhoto')} className="contents">
              <button
                ref={zoomButtonRef}
                type="button"
                onClick={() => setZoomOpen(true)}
                aria-label={t('promotionMode.zoomPhoto')}
                aria-haspopup="dialog"
                className={`absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-[#111827] shadow-md transition hover:scale-105 dark:bg-[#1E1E20]/90 dark:text-[#E3E2E6] ${PROMO_FOCUS}`}
              >
                <Maximize2 size={16} strokeWidth={1.5} aria-hidden="true" />
              </button>
            </Tooltip>
          )}
          {zoomOpen && (
            // `contents` + stopPropagation: eventos de um portal sobem pela árvore do
            // React; sem isso um clique no visualizador chegaria ao sheet por baixo.
            <div className="contents" onClick={(e: ReactMouseEvent) => e.stopPropagation()}>
              <ImageLightbox images={images} alt={name} initialIndex={photoIndex} onClose={closeZoom} />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 p-4 sm:p-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {showDeal && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-[11px] font-bold text-green-700 dark:bg-green-500/10 dark:text-green-300">
                  <Tag size={11} strokeWidth={1.75} aria-hidden="true" />
                  {t('promotionMode.unitSaving', { value: formatBRL(preview.unitDiscount) })}
                </span>
              )}
              {outOfPromotion && (
                <span className={`inline-flex rounded-full bg-black/[0.05] px-2.5 py-1 text-[11px] font-semibold dark:bg-white/10 ${MENU_TEXT_BODY}`}>
                  {t('promotionMode.notIncluded')}
                </span>
              )}
            </div>
            <h2 id={headingId} className={`mt-2 font-display text-xl font-extrabold leading-tight sm:text-2xl ${MENU_TEXT}`}>
              {name}
            </h2>

            <div className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span
                className={`text-2xl font-extrabold tabular-nums ${showDeal ? '' : MENU_TEXT}`}
                style={showDeal ? { color: 'var(--accent)' } : undefined}
                aria-label={showDeal ? t('promotionMode.priceFromTo', { from, to }) : undefined}
              >
                R$ {to}
              </span>
              {showDeal && <span className={`text-base tabular-nums line-through ${MENU_TEXT_MUTED}`}>R$ {from}</span>}
              {showListStrike && (
                <span className={`text-base tabular-nums line-through ${MENU_TEXT_MUTED}`}>
                  R$ {formatBRL(preview.listUnitPrice)}
                </span>
              )}
            </div>

            {description && <p className={`mt-3 text-sm leading-relaxed ${MENU_TEXT_BODY}`}>{description}</p>}
          </div>

          {(minOrderNote || limitNote) && (
            <div className={`flex flex-col gap-1.5 text-xs ${MENU_TEXT_BODY}`}>
              {minOrderNote && (
                <p className="flex items-start gap-1.5">
                  <Info size={14} strokeWidth={1.5} className="mt-px shrink-0" aria-hidden="true" />
                  <span>{minOrderNote}</span>
                </p>
              )}
              {limitNote && (
                <p className="flex items-start gap-1.5">
                  <Info size={14} strokeWidth={1.5} className="mt-px shrink-0" aria-hidden="true" />
                  <span>{limitNote}</span>
                </p>
              )}
            </div>
          )}

          {groups.length > 0 && (
            <ProductOptionGroupList
              groups={groups}
              selections={selections}
              onToggle={handleToggle}
              brand={primaryColor}
              density="panel"
            />
          )}

          {validationError && (
            <p role="alert" className="text-sm text-red-500 dark:text-red-400">
              {validationError}
            </p>
          )}

          {fullPageHref && (
            <Link
              to={fullPageHref}
              className={`inline-flex items-center gap-1 self-start text-[13px] font-semibold underline-offset-2 hover:underline ${MENU_TEXT_BODY} ${PROMO_FOCUS} rounded-md`}
            >
              {t('promotionMode.viewFullPage')}
              <ChevronRight size={14} strokeWidth={1.75} aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>

      <div className={`shrink-0 border-t border-[#E5E7EB] ${MENU_SURFACE} p-4 dark:border-white/10 sm:px-5`}>
        {showDeal && preview.lineDiscount > 0 && (
          <p className={`mb-2 text-xs font-semibold ${PROMO_SUCCESS_TEXT}`}>
            {t('promotionMode.lineSaving', { value: formatBRL(preview.lineDiscount) })}
          </p>
        )}
        <div className="flex items-center gap-3">
          <PromotionQuantityStepper
            size="regular"
            value={quantity}
            onDecrease={handleDecrease}
            onIncrease={handleIncrease}
            disableDecrease={inCart ? false : blocked || draftQuantity <= 1}
            disableIncrease={blocked}
            groupLabel={t('promotionMode.quantity')}
            increaseLabel={t('tooltip.increase')}
            decreaseLabel={t('tooltip.decrease')}
            removeLabel={inCart ? t('tooltip.remove') : undefined}
          />
          <div className="min-w-0 flex-1">{cta}</div>
        </div>
        <span className="sr-only" role="status" aria-live="polite">
          {inCart ? t('promotionMode.added') : ''}
        </span>
      </div>
    </div>
  );
}
