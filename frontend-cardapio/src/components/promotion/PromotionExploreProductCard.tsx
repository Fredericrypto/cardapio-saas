import { memo } from 'react';
import { Ban, Plus } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { AnimatedGradientButton } from '../AnimatedGradientButton';
import { localizedField } from '../../i18n/contentText';
import { formatBRL } from '../../lib/promotionPresentation';
import { getProductImages } from '../../lib/productImages';
import type { ItemPromotionPreview } from '../../lib/promotionEligibility';
import { promotionCardDomId } from '../../lib/promotionMode';
import { PROFILE_CARD } from '../../lib/profileTheme';
import { PROMO_FOCUS } from '../../lib/promotionTheme';
import { MENU_TEXT, MENU_TEXT_MUTED, MENU_SURFACE_SUBTLE } from '../../lib/menuTheme';
import type { Product } from '../../types';

interface PromotionExploreProductCardProps {
  product: Product;
  // Simulação do motor (previewItemPromotion) — nenhuma conta é feita aqui.
  preview: ItemPromotionPreview;
  primaryColor: string;
  storeClosed: boolean;
  // Este card é o aberto no painel (master-detail).
  isSelected: boolean;
  // Id do painel que este card controla (aria-controls) quando selecionado.
  panelId: string;
  // Callbacks ESTÁVEIS (useCallback na tela) recebendo o produto: é o que deixa
  // o memo valer — trocar o item aberto re-renderiza só dois cards.
  onToggle: (productId: string) => void;
  onSelect: (productId: string) => void;
  onQuickAdd: (product: Product) => void;
}

// Card do Modo Promoção: preço de hoje riscado e preço com a promoção, ambos
// vindos do motor. O pedido mínimo NÃO bloqueia o preview (decisão da Etapa 1):
// quem avisa quanto falta é o banner. Item fora da promoção (ou indisponível)
// aparece abaixo dos elegíveis, atenuado e com selo, mas segue clicável e
// comprável: o cliente nunca fica travado fora do desconto.
function PromotionExploreProductCardImpl({
  product,
  preview,
  storeClosed,
  isSelected,
  panelId,
  onToggle,
  onSelect,
  onQuickAdd,
}: PromotionExploreProductCardProps) {
  const { t } = useI18n();
  const name = localizedField(product, 'name');
  const image = getProductImages(product)[0];
  const isUnavailable = product.isAvailable === false;
  const hasRequiredOptions = (product.options ?? []).some((g) => g.minSelect > 0);
  const showDeal = preview.isEligible && preview.unitDiscount > 0 && !isUnavailable;
  const outOfPromotion = !preview.covered || isUnavailable;
  const from = formatBRL(preview.unitPriceBeforePromo);
  const to = formatBRL(preview.unitPriceAfterPromo);
  // Fora da promoção com promoPrice próprio: mantém o preço de tabela riscado.
  const listStrike = !showDeal && product.promoPrice != null ? formatBRL(preview.listUnitPrice) : null;
  const addLabel = t('product.add', { name });
  const actionLabel = hasRequiredOptions ? t('promotionMode.options') : addLabel;

  return (
    <div
      id={promotionCardDomId(product.id)}
      className={`relative flex h-full flex-col overflow-hidden transition-shadow ${PROFILE_CARD} ${
        isSelected ? 'ring-2 ring-[color:var(--accent)] shadow-md' : ''
      }`}
    >
      <button
        type="button"
        onClick={() => onToggle(product.id)}
        aria-pressed={isSelected}
        aria-controls={isSelected ? panelId : undefined}
        className={`flex flex-1 flex-col text-left ${PROMO_FOCUS}`}
        aria-label={showDeal ? `${name}. ${t('promotionMode.priceFromTo', { from, to })}` : name}
      >
        <div className={`relative aspect-[4/3] overflow-hidden ${MENU_SURFACE_SUBTLE}`}>
          {image && (
            <img
              src={image}
              alt=""
              loading="lazy"
              draggable={false}
              className={`h-full w-full object-cover ${isUnavailable ? 'grayscale opacity-60' : outOfPromotion ? 'opacity-80 saturate-[0.85]' : ''}`}
            />
          )}
          {showDeal && (
            <span className="absolute left-2 top-2 rounded-lg bg-black/70 px-2 py-1 text-[11px] font-extrabold tracking-wide text-[#FFFFFF] shadow-sm backdrop-blur">
              {t('promotionMode.unitSaving', { value: formatBRL(preview.unitDiscount) })}
            </span>
          )}
          {isUnavailable ? (
            <span className="absolute left-2 top-2 rounded-full bg-gray-800/85 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
              {t('productCard.indisponivel')}
            </span>
          ) : (
            outOfPromotion && (
              <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-[#374151] shadow-sm dark:bg-[#1E1E20]/90 dark:text-[#C4C7C5]">
                {t('promotionMode.notIncluded')}
              </span>
            )
          )}
        </div>
        <div className="flex flex-1 flex-col p-3 pr-12">
          <p className={`line-clamp-2 min-h-[2.5rem] text-sm font-semibold ${isUnavailable ? MENU_TEXT_MUTED : MENU_TEXT}`}>
            {name}
          </p>
          <div className="mt-auto flex items-baseline gap-2 pt-1.5">
            {showDeal && <span className={`text-xs tabular-nums line-through ${MENU_TEXT_MUTED}`}>R$ {from}</span>}
            {listStrike && <span className={`text-xs tabular-nums line-through ${MENU_TEXT_MUTED}`}>R$ {listStrike}</span>}
            <span
              className={`text-sm font-bold tabular-nums ${showDeal ? '' : isUnavailable ? MENU_TEXT_MUTED : MENU_TEXT}`}
              style={showDeal ? { color: 'var(--accent)' } : undefined}
            >
              R$ {to}
            </span>
          </div>
        </div>
      </button>

      {storeClosed || isUnavailable ? (
        <span
          aria-label={`${name}: ${isUnavailable ? t('productCard.indisponivel') : t('store.closedEstablishment')}`}
          className="absolute bottom-3 right-3 flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-full bg-gray-400 text-white shadow-md"
        >
          <Ban size={15} strokeWidth={1.5} />
        </span>
      ) : (
        <AnimatedGradientButton
          onClick={() => (hasRequiredOptions ? onSelect(product.id) : onQuickAdd(product))}
          aria-label={actionLabel}
          title={actionLabel}
          animation="hover"
          className="absolute bottom-[10px] right-[10px] h-9 w-9 rounded-full shadow-md"
          fillClassName="bg-[var(--brand)] text-white"
          contentClassName="flex h-full w-full items-center justify-center"
        >
          <Plus size={16} strokeWidth={2.75} aria-hidden="true" />
        </AnimatedGradientButton>
      )}
    </div>
  );
}

export const PromotionExploreProductCard = memo(PromotionExploreProductCardImpl);
