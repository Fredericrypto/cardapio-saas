import { Ban, Plus } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { localizedField } from '../../i18n/contentText';
import { formatBRL } from '../../lib/promotionPresentation';
import { getProductImages } from '../../lib/productImages';
import type { ItemPromotionPreview } from '../../lib/promotionEligibility';
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
  onOpen: () => void;
  onAdd: () => void;
}

// Card do Modo Promoção: preço de hoje riscado e preço com a promoção, ambos
// vindos do motor. O pedido mínimo NÃO bloqueia o preview (decisão da Etapa 1):
// quem avisa quanto falta é o banner.
export function PromotionExploreProductCard({
  product,
  preview,
  primaryColor,
  storeClosed,
  onOpen,
  onAdd,
}: PromotionExploreProductCardProps) {
  const { t } = useI18n();
  const name = localizedField(product, 'name');
  const image = getProductImages(product)[0];
  const hasRequiredOptions = (product.options ?? []).some((g) => g.minSelect > 0);
  const showDeal = preview.isEligible && preview.unitDiscount > 0;
  const from = formatBRL(preview.unitPriceBeforePromo);
  const to = formatBRL(preview.unitPriceAfterPromo);

  return (
    <div className={`relative flex h-full flex-col overflow-hidden ${PROFILE_CARD}`}>
      <button
        type="button"
        onClick={onOpen}
        className={`flex flex-1 flex-col text-left ${PROMO_FOCUS}`}
        aria-label={showDeal ? `${name}. ${t('promotionMode.priceFromTo', { from, to })}` : name}
      >
        <div className={`relative aspect-[4/3] overflow-hidden ${MENU_SURFACE_SUBTLE}`}>
          {image && (
            <img src={image} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />
          )}
          {showDeal && (
            <span className="absolute left-2 top-2 rounded-lg bg-black/70 px-2 py-1 text-[11px] font-extrabold tracking-wide text-[#FFFFFF] shadow-sm backdrop-blur">
              {t('promotionMode.unitSaving', { value: formatBRL(preview.unitDiscount) })}
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col p-3 pr-12">
          <p className={`line-clamp-2 min-h-[2.5rem] text-sm font-semibold ${MENU_TEXT}`}>{name}</p>
          <div className="mt-auto flex items-baseline gap-2 pt-1.5">
            {showDeal && (
              <span className={`text-xs tabular-nums line-through ${MENU_TEXT_MUTED}`}>R$ {from}</span>
            )}
            <span
              className={`text-sm font-bold tabular-nums ${showDeal ? '' : MENU_TEXT}`}
              style={showDeal ? { color: 'var(--accent)' } : undefined}
            >
              R$ {to}
            </span>
          </div>
        </div>
      </button>

      {storeClosed ? (
        <span
          aria-label={`${name}: ${t('store.closedEstablishment')}`}
          className="absolute bottom-3 right-3 flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-full bg-gray-400 text-white shadow-md"
        >
          <Ban size={15} strokeWidth={1.5} />
        </span>
      ) : (
        <button
          type="button"
          onClick={hasRequiredOptions ? onOpen : onAdd}
          aria-label={hasRequiredOptions ? t('promotionMode.options') : t('product.add', { name })}
          title={hasRequiredOptions ? t('promotionMode.options') : t('product.add', { name })}
          className={`absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-full text-white shadow-md transition-transform active:scale-90 ${PROMO_FOCUS}`}
          style={{ backgroundColor: primaryColor }}
        >
          <Plus size={16} strokeWidth={2.75} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
