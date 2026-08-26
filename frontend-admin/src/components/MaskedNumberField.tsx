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
      onBlur={() => setIsFocused(false)}
      onChange={(e) => onChange(sanitizeDecimalInput(e.target.value))}
      className={className}
    />
  );
}
