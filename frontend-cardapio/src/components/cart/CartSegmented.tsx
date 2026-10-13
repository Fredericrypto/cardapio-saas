import { Tooltip } from '../Tooltip';
import {
  CART_SEGMENT_ACTIVE,
  CART_SEGMENT_BASE,
  CART_SEGMENT_INACTIVE,
  CART_SEGMENT_TRACK,
} from '../../lib/cartTheme';

export interface CartSegmentOption<V extends string | number> {
  value: V;
  /** Texto visível no botão. */
  label: string;
  /** Texto do balão (padrão: o próprio rótulo). */
  tooltip?: string;
}

interface CartSegmentedProps<V extends string | number> {
  options: ReadonlyArray<CartSegmentOption<V>>;
  value: V;
  onChange: (value: V) => void;
  primaryColor: string;
  ariaLabel: string;
}

// Segmented control do carrinho (tipo de pedido, gorjeta, crédito/débito).
// O segmento ativo usa a cor do restaurante (inline); cada botão tem Tooltip e
// aria-label. Fica `radiogroup`/`radio` para leitores de tela.
export function CartSegmented<V extends string | number>({
  options,
  value,
  onChange,
  primaryColor,
  ariaLabel,
}: CartSegmentedProps<V>) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={CART_SEGMENT_TRACK}>
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <Tooltip key={String(option.value)} label={option.tooltip ?? option.label} className="flex flex-1 min-w-0">
            <button
              type="button"
              role="radio"
              aria-checked={isActive}
              aria-label={option.tooltip ?? option.label}
              onClick={() => onChange(option.value)}
              className={`${CART_SEGMENT_BASE} ${isActive ? CART_SEGMENT_ACTIVE : CART_SEGMENT_INACTIVE}`}
              style={isActive ? { backgroundColor: primaryColor } : undefined}
            >
              {option.label}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
