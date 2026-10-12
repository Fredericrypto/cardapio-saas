import { useI18n } from '../i18n/I18nContext';
import { Search } from 'lucide-react';
import { MENU_BORDER, MENU_SURFACE_SUBTLE, MENU_TEXT_MUTED, MENU_TEXT_SOFT } from '../lib/menuTheme';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  const { t } = useI18n();
  return (
    <div className="px-4 pt-1 md:px-0 md:pt-0">
      <div
        className={`border rounded-xl md:rounded-full px-3.5 md:px-4 py-2.5 flex items-center gap-2 transition-colors focus-within:border-[#D1D5DB] dark:focus-within:border-white/30 ${MENU_SURFACE_SUBTLE} ${MENU_BORDER}`}
      >
        <Search size={18} className={`shrink-0 ${MENU_TEXT_MUTED}`} />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('searchBar.buscar_no_cardapio')}
          aria-label={t('searchBar.buscar_no_cardapio')}
          className={`w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-[#9CA3AF] dark:placeholder:text-[#8E918F] ${MENU_TEXT_SOFT}`}
        />
      </div>
    </div>
  );
}
