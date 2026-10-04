import { useState } from 'react';

// Aceita só dígitos e um separador decimal (vírgula ou ponto — o usuário
// pode digitar do jeito que preferir, normalizamos pra ponto internamente).
// Nunca deixa passar letra nem símbolo.
function sanitizeDecimalInput(raw: string): string {
  let cleaned = raw.replace(/,/g, '.');
  cleaned = cleaned.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  if (parts.length > 2) {
    cleaned = parts[0] + '.' + parts.slice(1).join('');
  }
  return cleaned;
}

interface MaskedNumberFieldProps {
  value: string; // sempre com ponto decimal (ex: "2.5"), nunca formatado
  onChange: (raw: string) => void;
  formatDisplay: (raw: string) => string;
  placeholder?: string;
  className?: string;
  // Chamado ao sair do campo: devolve o valor já corrigido (ex.: "24.9" →
  // "24.90"). Só dispara onChange se o valor mudou.
  normalize?: (raw: string) => string;
}

// Input numérico "cru" enquanto em foco (fácil de editar), formatado
// (ex: "R$ 2,00" ou "20km") assim que perde o foco. Vazio mostra o
// placeholder em vez de forçar um "0" no campo.
export function MaskedNumberField({
  value,
  onChange,
  formatDisplay,
  placeholder = '0',
  className,
  normalize,
}: MaskedNumberFieldProps) {
  const [isFocused, setIsFocused] = useState(false);

  const displayValue = !isFocused && value ? formatDisplay(value) : value;

  return (
    <input
      type="text"
      inputMode="decimal"
      value={displayValue}
      placeholder={placeholder}
      onFocus={() => setIsFocused(true)}
      onBlur={() => {
        setIsFocused(false);
        if (normalize) {
          const fixed = normalize(value);
          if (fixed !== value) onChange(fixed);
        }
      }}
      onChange={(e) => onChange(sanitizeDecimalInput(e.target.value))}
      className={className}
    />
  );
}

// ---------------------------------------------------------------------------
// Dinheiro (R$): digita do jeito que quiser ("24,9", "24.9", ".5", "1000") e,
// ao clicar fora, o valor é corrigido sozinho para 2 casas ("24.90",
// "0.50", "1000.00") e exibido como "R$ 1.000,00". O valor continua sendo
// uma string com ponto decimal, como o resto do app já espera.
// ---------------------------------------------------------------------------
export function normalizeCurrencyRaw(raw: string): string {
  if (!raw || raw === '.') return '';
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0) return '';
  return (Math.round((num + Number.EPSILON) * 100) / 100).toFixed(2);
}

export function formatCurrencyBRL(raw: string): string {
  const num = Number(raw);
  if (!raw || !Number.isFinite(num)) return '';
  return `R$ ${num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface CurrencyFieldProps {
  value: string;
  onChange: (raw: string) => void;
  placeholder?: string;
  className?: string;
}

export function CurrencyField({ value, onChange, placeholder = 'R$ 0,00', className }: CurrencyFieldProps) {
  return (
    <MaskedNumberField
      value={value}
      onChange={onChange}
      formatDisplay={formatCurrencyBRL}
      normalize={normalizeCurrencyRaw}
      placeholder={placeholder}
      className={className}
    />
  );
}
