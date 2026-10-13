import { Minus, Plus, Tag, Trash2 } from 'lucide-react';
import { localizedField } from '../../i18n/contentText';
import { useI18n } from '../../i18n/I18nContext';
import { useAccentColor } from '../../hooks/useAccentColor';
import { cartItemOptionsLabel, cartItemUnitPrice, formatBRL } from '../../lib/cartFormat';
import {
  CART_ICON_BUTTON_DANGER,
  CART_QTY_BUTTON,
  CART_QTY_PILL,
  CART_TEXT,
  CART_TEXT_MUTED,
} from '../../lib/cartTheme';
import type { CartItem } from '../../types';
import { Tooltip } from '../Tooltip';

interface CartItemRowProps {
  item: CartItem;
  primaryColor: string;
  /** Quantas unidades da linha têm cupom aplicado (0 = nenhuma). */
  discountedQty: number;
  onIncrease: (lineKey: string) => void;
  onDecrease: (lineKey: string) => void;
  /** Abre o modal "Remover item?" — nunca remove direto. */
  onRequestRemoval: (lineKey: string) => void;
}

// Linha de item no estilo da referência (divisor fino entre linhas, sem
// cartão): imagem arredondada à esquerda, nome + subtítulo (opções escolhidas
// ou preço unitário), controle de quantidade em pílula com contorno, preço à
// direita em peso leve e botão de remover discreto.
//
// Grade: no celular o controle e o preço descem para uma segunda linha (sob o
// texto); a partir de md tudo fica numa linha só.
//
// Cupom parcial (`isSplit`): quando o cupom cobre só PARTE da quantidade, as
// unidades com desconto ficam isoladas das demais, como sempre foi.
export function CartItemRow({
  item,
  primaryColor,
  discountedQty,
  onIncrease,
  onDecrease,
  onRequestRemoval,
}: CartItemRowProps) {
  const { t } = useI18n();
  const accent = useAccentColor(primaryColor);
  const unitPrice = cartItemUnitPrice(item);
  const regularQty = item.quantity - discountedQty;
  const isSplit = discountedQty > 0 && regularQty > 0;
  const optionsLabel = cartItemOptionsLabel(item);
  const name = localizedField(item.product, 'name');
  // Subtítulo: opções escolhidas; sem opções, o preço unitário.
  const subtitle = optionsLabel ?? formatBRL(unitPrice);
  const lineTotal = unitPrice * item.quantity;

  const couponBadge = (label: string) => (
    <p className="text-[11px] font-semibold mt-0.5 flex items-center gap-1" style={{ color: accent }}>
      <Tag size={11} strokeWidth={1.5} aria-hidden="true" className="shrink-0" />
      <span className="truncate">{label}</span>
    </p>
  );

  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] md:grid-cols-[auto_minmax(0,1fr)_auto_6.5rem_auto] items-center gap-x-4 gap-y-3 md:gap-x-6 py-5 first:pt-1">
      <div className="row-span-2 md:row-span-1 self-start md:self-center w-16 h-16 md:w-20 md:h-20 rounded-xl bg-black/5 dark:bg-white/5 overflow-hidden shrink-0">
        {item.product.imageUrl && (
          <img src={item.product.imageUrl} alt={name} className="w-full h-full object-cover" />
        )}
      </div>

      <div className="col-start-2 row-start-1 min-w-0 flex flex-col gap-2">
        {isSplit ? (
          <>
            <div
              className="rounded-lg px-2.5 py-1.5 border"
              style={{ borderColor: `${primaryColor}55`, backgroundColor: `${primaryColor}0D` }}
            >
              <p className={`text-sm font-medium truncate ${CART_TEXT}`}>
                {discountedQty}x {name}
              </p>
              {optionsLabel && <p className={`text-xs truncate ${CART_TEXT_MUTED}`}>{optionsLabel}</p>}
              {couponBadge(`${t('cartPage.cupom_aplicado_r')} ${(unitPrice * discountedQty).toFixed(2).replace('.', ',')}`)}
            </div>
            <div className="px-0.5">
              <p className={`text-sm font-medium truncate ${CART_TEXT}`}>
                {regularQty}x {name}
              </p>
              {optionsLabel && <p className={`text-xs truncate ${CART_TEXT_MUTED}`}>{optionsLabel}</p>}
              <p className={`text-xs ${CART_TEXT_MUTED}`}>{formatBRL(unitPrice * regularQty)}</p>
            </div>
          </>
        ) : (
          <div>
            <p className={`text-base font-semibold line-clamp-2 break-words ${CART_TEXT}`}>{name}</p>
            <p className={`text-xs truncate ${CART_TEXT_MUTED}`}>{subtitle}</p>
            {discountedQty > 0 && couponBadge(t('cartPage.cupom_aplicado'))}
          </div>
        )}
      </div>

      <div className="col-start-3 row-start-1 md:col-start-5 justify-self-end">
        <Tooltip label={t('tooltip.remove')}>
          <button
            type="button"
            onClick={() => onRequestRemoval(item.lineKey)}
            aria-label={t('tooltip.remove')}
            className={CART_ICON_BUTTON_DANGER}
          >
            <Trash2 size={18} strokeWidth={1.5} />
          </button>
        </Tooltip>
      </div>

      <div className="col-start-2 row-start-2 md:col-start-3 md:row-start-1">
        <div className={CART_QTY_PILL}>
          <Tooltip label={t('tooltip.decrease')}>
            <button
              type="button"
              onClick={() => onDecrease(item.lineKey)}
              aria-label={t('tooltip.decrease')}
              className={CART_QTY_BUTTON}
            >
              <Minus size={14} strokeWidth={1.5} />
            </button>
          </Tooltip>
          <span className={`min-w-7 text-center text-sm font-medium tabular-nums ${CART_TEXT}`} aria-live="polite">
            {item.quantity}
          </span>
          <Tooltip label={t('tooltip.increase')}>
            <button
              type="button"
              onClick={() => onIncrease(item.lineKey)}
              aria-label={t('tooltip.increase')}
              className={CART_QTY_BUTTON}
            >
              <Plus size={14} strokeWidth={1.5} />
            </button>
          </Tooltip>
        </div>
      </div>

      <p
        className={`col-start-3 row-start-2 md:col-start-4 md:row-start-1 text-right text-base md:text-lg font-light tabular-nums whitespace-nowrap ${CART_TEXT}`}
      >
        {formatBRL(lineTotal)}
      </p>
    </div>
  );
}
