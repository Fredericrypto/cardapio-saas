import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { PROFILE_LABEL } from '../lib/profileTheme';

interface ProfileFieldProps {
  label: string;
  icon?: LucideIcon;
  className?: string;
  children: ReactNode;
}

// Campo de formulário das subpáginas: rótulo acima + ícone de apoio dentro do
// input (traço fino). O input filho precisa levar `pl-10` quando há ícone.
// Só apresentação — o estado e a validação continuam na página.
export function ProfileField({ label, icon: Icon, className = '', children }: ProfileFieldProps) {
  return (
    <label className={`flex flex-col gap-1.5 min-w-0 ${className}`}>
      <span className={PROFILE_LABEL}>{label}</span>
      <span className="relative block">
        {Icon && (
          <Icon
            size={16}
            strokeWidth={1.5}
            className="absolute left-3.5 top-[23px] -translate-y-1/2 pointer-events-none text-[#9CA3AF] dark:text-[#8E918F]"
          />
        )}
        {children}
      </span>
    </label>
  );
}

interface ProfileSectionHeaderProps {
  icon: LucideIcon;
  title: string;
  accent: string;
}

// Cabeçalho de cartão: ícone em círculo tingido com a cor do restaurante + título.
export function ProfileSectionHeader({ icon: Icon, title, accent }: ProfileSectionHeaderProps) {
  return (
    <div className="flex items-center gap-3 mb-4 md:mb-5">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border border-black/5 dark:border-white/10"
        style={{ backgroundColor: `${accent}1A` }}
      >
        <Icon size={18} strokeWidth={1.5} className="text-[#374151] dark:text-[#E3E2E6]" />
      </div>
      <h2 className="font-display text-base font-bold text-[#111827] dark:text-[#E3E2E6]">{title}</h2>
    </div>
  );
}
