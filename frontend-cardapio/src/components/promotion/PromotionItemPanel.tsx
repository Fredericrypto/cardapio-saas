import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, Check, ChevronRight, Info, Minus, Plus, Tag, X } from 'lucide-react';
import { useCart } from '../../contexts/CartContext';
import { localizedField } from '../../i18n/contentText';
import { useI18n } from '../../i18n/I18nContext';
import { CartIcon } from '../MenuIcons';
import { ProductImageCarousel } from '../ProductImageCarousel';
import { ProductOptionGroupList } from '../ProductOptionGroupList';
import { ShareButton } from '../ShareButton';
import { Tooltip } from '../Tooltip';
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

const ADDED_FEEDBACK_MS = 1800;

const QTY_BUTTON =
  'w-9 h-9 rounded-full bg-[#FFFFFF] dark:bg-[#3A3C3E] text-[#374151] dark:text-[#E3E2E6] ' +
  'flex items-center justify-center shadow-sm border border-[#E5E7EB] dark:border-white/10 ' +
  'hover:bg-[#F9FAFB] dark:hover:bg-[#46484A] disabled:opacity-40 disabled:cursor-not-allowed transition';

const CTA_BASE = 'w-full py-3.5 rounded-xl text-sm font-semibold flex justify-between items-center gap-3 px-5 transition ';
const CTA_BRAND =
  CTA_BASE +
  'text-[#FFFFFF] bg-[var(--brand)] ring-1 ring-black/5 dark:bg-[#E3E2E6] dark:text-[#131314] dark:ring-white/20 ' +
  'shadow-sm hover:brightness-110 dark:hover:brightness-95 active:brightness-95';
const CTA_ADDED = CTA_BASE + 'text-[#FFFFFF] bg-green-600 ring-1 ring-black/5 dark:bg-green-500 dark:text-[#131314] promo-added-pop';

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
  const { addItem } = useCart();
  const fallbackId = useId();
  const headingId = titleId ?? fallbackId;

  const [quantity, setQuantity] = useState(1);
  const [selections, setSelections] = useState<OptionSelections>({});
  const [validationError, setValidationError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState(false);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (addedTimer.current) clearTimeout(addedTimer.current);
    },
    [],
  );

  const groups = useMemo(() => visibleOptionGroups(product), [product]);
  const selectedOptions = useMemo(() => buildSelectedOptions(groups, selections), [groups, selections]);
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
    addItem(product, selectedOptions, quantity);
    setValidationError(null);
    setQuantity(1);
    setJustAdded(true);
    if (addedTimer.current) clearTimeout(addedTimer.current);
    addedTimer.current = setTimeout(() => setJustAdded(false), ADDED_FEEDBACK_MS);
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
  } else {
    cta = (
      <button
        type="button"
        onClick={handleAdd}
        className={`${justAdded ? CTA_ADDED : CTA_BRAND} ${PROMO_FOCUS}`}
      >
        <span className="flex items-center gap-2 whitespace-nowrap">
          {justAdded ? <Check size={16} strokeWidth={2} aria-hidden="true" /> : <CartIcon size={16} />}
          {justAdded ? t('promotionMode.added') : t('productDetailPage.adicionar')}
        </span>
        <span className="whitespace-nowrap tabular-nums">R$ {lineAfter}</span>
      </button>
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
            <ProductImageCarousel
              images={images}
              alt={name}
              size="detail"
              imgClassName={isUnavailable ? 'grayscale opacity-60' : ''}
            />
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
          <div
            role="group"
            aria-label={t('promotionMode.quantity')}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#E5E7EB] bg-[#F3F4F6] p-1 dark:border-white/10 dark:bg-[#1E1E20]"
          >
            <Tooltip label={t('tooltip.decrease')}>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                aria-label={t('tooltip.decrease')}
                className={QTY_BUTTON}
              >
                <Minus size={16} strokeWidth={1.5} aria-hidden="true" />
              </button>
            </Tooltip>
            <span className={`w-7 text-center font-semibold tabular-nums ${MENU_TEXT}`} aria-live="polite">
              {quantity}
            </span>
            <Tooltip label={t('tooltip.increase')}>
              <button
                type="button"
                onClick={() => setQuantity((q) => q + 1)}
                aria-label={t('tooltip.increase')}
                className={QTY_BUTTON}
              >
                <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
              </button>
            </Tooltip>
          </div>
          <div className="min-w-0 flex-1">{cta}</div>
        </div>
        <span className="sr-only" role="status" aria-live="polite">
          {justAdded ? t('promotionMode.added') : ''}
        </span>
      </div>
    </div>
  );
}
