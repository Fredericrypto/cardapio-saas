import { formatBrazilPhone, isValidBrazilPhone } from '../lib/phone';

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

// Sempre guarda o valor já formatado no estado (o pai não precisa saber
// da máscara) — ao enviar pro backend, o valor já vem no formato certo
// pra exibir, e os dígitos podem ser extraídos com .replace(/\D/g, '')
// se algum dia precisar (ex: montar link de wa.me).
export function PhoneInput({ value, onChange, placeholder = '(48) 99999-9999', className }: PhoneInputProps) {
  const showError = value.length > 0 && !isValidBrazilPhone(value);

  return (
    <div>
      <input
        type="tel"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(formatBrazilPhone(e.target.value))}
        placeholder={placeholder}
        className={className}
      />
      {showError && (
        <p className="text-xs text-red-500 mt-1">
          Telefone incompleto — confira o DDD e o número.
        </p>
      )}
    </div>
  );
}
