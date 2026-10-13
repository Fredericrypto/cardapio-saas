import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  CART_FIELD_BOX,
  CART_FIELD_BOX_INVALID,
  CART_FIELD_INPUT,
  CART_FIELD_LABEL,
  CART_SELECT_OPTION,
  CART_TEXT_MUTED,
} from '../../lib/cartTheme';

interface CartFieldProps {
  /** Rótulo pequeno, dentro da caixa, acima do valor (floating label estático). */
  label: string;
  children: ReactNode;
  invalid?: boolean;
  className?: string;
}

// Campo no estilo da referência: contorno fino e rótulo pequeno DENTRO da
// caixa, sempre visível acima do valor. A caixa inteira é um <label>: clicar
// em qualquer ponto foca o campo e o rótulo fica ligado ao input sem `id`
// (serve também para PhoneInput/CurrencyInput, que não aceitam `id`). Foco
// (borda mais forte) e erro (borda vermelha) valem nos dois temas.
export function CartField({ label, children, invalid = false, className = '' }: CartFieldProps) {
  return (
    <label className={`${invalid ? CART_FIELD_BOX_INVALID : CART_FIELD_BOX} ${className}`}>
      <span className={CART_FIELD_LABEL}>{label}</span>
      {children}
    </label>
  );
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'className'>;

/** Campo de texto com rótulo interno. */
export function CartTextField({
  label,
  invalid,
  className,
  ...inputProps
}: InputProps & { label: string; invalid?: boolean; className?: string }) {
  return (
    <CartField label={label} invalid={invalid} className={className}>
      <input aria-invalid={invalid || undefined} {...inputProps} className={CART_FIELD_INPUT} />
    </CartField>
  );
}

/** Área de texto com rótulo interno. */
export function CartTextArea({
  label,
  className,
  ...props
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> & { label: string; className?: string }) {
  return (
    <CartField label={label} className={className}>
      <textarea {...props} className={`${CART_FIELD_INPUT} resize-none`} />
    </CartField>
  );
}

/** Select com rótulo interno e seta própria (a nativa some com `appearance-none`). */
export function CartSelectField({
  label,
  children,
  className,
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> & { label: string; className?: string }) {
  return (
    <CartField label={label} className={className}>
      <span className="relative block">
        <select {...props} className={`${CART_FIELD_INPUT} ${CART_SELECT_OPTION} pr-5`}>
          {children}
        </select>
        <ChevronDown
          size={14}
          strokeWidth={1.5}
          aria-hidden="true"
          className={`absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none ${CART_TEXT_MUTED}`}
        />
      </span>
    </CartField>
  );
}
