import { useI18n } from '../i18n/I18nContext';
import { formatBrazilPhone, isValidBrazilPhone } from '../lib/phone';

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

// Visual padrão (usado só quando o pai NÃO passa `className`): campo no
// mesmo padrão dos inputs do carrinho — claro: fundo #F9FAFB / borda
// #E5E7EB; escuro: bg-white/[0.05], border-white/10, foco white/30.
const DEFAULT_INPUT_CLASS =
  'w-full bg-[#F9FAFB] dark:bg-white/[0.05] border border-[#E5E7EB] dark:border-white/10 rounded-xl px-4 py-3 text-sm text-[#111827] dark:text-white placeholder:text-[#9CA3AF] dark:placeholder:text-gray-500 outline-none focus:border-[#9CA3AF] dark:focus:border-white/30 transition-colors';

// Sempre guarda o valor já formatado no estado (o pai não precisa saber
// da máscara) — ao enviar pro backend, o valor já vem no formato certo
// pra exibir, e os dígitos podem ser extraídos com .replace(/\D/g, '')
// se algum dia precisar (ex: montar link de wa.me).
export function PhoneInput({ value, onChange, placeholder = '(48) 99999-9999', className }: PhoneInputProps) {
  const { t } = useI18n();
  const showError = value.length > 0 && !isValidBrazilPhone(value);

  return (
    <div>
      <input
        type="tel"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(formatBrazilPhone(e.target.value))}
        placeholder={placeholder}
        aria-invalid={showError || undefined}
        className={className ?? DEFAULT_INPUT_CLASS}
      />
      {showError && (
        <p className="text-xs text-[#DC2626] dark:text-red-400 mt-1">
          {t('phoneInput.telefone_incompleto_confira_o')}
        </p>
      )}
    </div>
  );
}
