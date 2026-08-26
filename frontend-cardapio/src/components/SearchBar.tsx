import { Search } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="px-4 pt-1">
      <div className="bg-gray-50 border border-gray-100 rounded-xl px-3.5 py-2.5 flex items-center gap-2">
        <Search size={18} className="text-gray-400 shrink-0" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Buscar no cardápio"
          className="w-full text-sm text-gray-700 placeholder:text-gray-400 outline-none"
        />
      </div>
    </div>
  );
}
