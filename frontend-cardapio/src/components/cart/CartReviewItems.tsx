import { Tag } from 'lucide-react';
import { localizedField } from '../../i18n/contentText';
import { useI18n } from '../../i18n/I18nContext';
import { useAccentColor } from '../../hooks/useAccentColor';
import { cartItemOptionsLabel, cartItemUnitPrice, formatBRL } from '../../lib/cartFormat';
import { CART_TEXT_BODY, CART_TEXT_MUTED, CART_TEXT_SOFT } from '../../lib/cartTheme';
import type { CartItem } from '../../types';

interface CartReviewItemsProps {
  items: CartItem[];
  discountedQtyFor: (lineKey: string) => number;
  primaryColor: string;
}

// Itens na etapa "Revisar pedido". Mantém a isolação do cupom parcial: se o
// cupom cobre só parte da quantidade, são duas linhas separadas (igual à
// etapa anterior).
export function CartReviewItems({ items, discountedQtyFor, primaryColor }: CartReviewItemsProps) {
  const { t } = useI18n();
  const accent = useAccentColor(primaryColor);

  const couponLabel = (
    <span className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: accent }}>
      <Tag size={11} strokeWidth={1.5} aria-hidden="true" />
      {t('cartPage.cupom_aplicado')}
    </span>
  );

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => {
        const unitPrice = cartItemUnitPrice(item);
        const discountedQty = discountedQtyFor(item.lineKey);
        const regularQty = item.quantity - discountedQty;
        const isSplit = discountedQty > 0 && regularQty > 0;
        const optionsLabel = cartItemOptionsLabel(item);
        const name = localizedField(item.product, 'name');
        const row = (qty: number, withCoupon: boolean) => (
          <div className="flex justify-between gap-3 text-sm">
            <span className={`min-w-0 ${CART_TEXT_SOFT}`}>
              {qty}x {name}
              {optionsLabel && <span className={`block text-xs ${CART_TEXT_MUTED}`}>{optionsLabel}</span>}
              {withCoupon && couponLabel}
            </span>
            <span className={`shrink-0 tabular-nums ${CART_TEXT_BODY}`}>{formatBRL(unitPrice * qty)}</span>
          </div>
        );
        if (isSplit) {
          return (
            <div key={item.lineKey} className="flex flex-col gap-1">
              {row(discountedQty, true)}
              {row(regularQty, false)}
            </div>
          );
        }
        return <div key={item.lineKey}>{row(item.quantity, discountedQty > 0)}</div>;
      })}
    </div>
  );
}
