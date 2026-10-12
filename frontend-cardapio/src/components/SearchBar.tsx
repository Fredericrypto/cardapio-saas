import { useI18n } from '../i18n/I18nContext';
import { Search } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  const { t } = useI18n();
  return (
    <div className="px-4 pt-1 md:px-0 md:pt-0">
      <div className="bg-gray-50 border border-gray-100 rounded-xl md:rounded-full px-3.5 md:px-4 py-2.5 flex items-center gap-2 transition-colors focus-within:border-gray-300">
        <Search size={18} className="text-gray-400 shrink-0" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('searchBar.buscar_no_cardapio')}
          aria-label={t('searchBar.buscar_no_cardapio')}
          className="w-full min-w-0 text-sm text-gray-700 placeholder:text-gray-400 outline-none"
        />
      </div>
    </div>
  );
}
