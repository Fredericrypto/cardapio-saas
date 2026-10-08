import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

// Alterna claro/escuro. Mostra o ícone da AÇÃO (lua = ir para o escuro,
// sol = voltar para o claro). A escolha persiste em localStorage (lib/theme.ts).
export function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();
  const label = isDark ? 'Ativar modo claro' : 'Ativar modo escuro';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      aria-pressed={isDark}
      title={label}
      className="w-9 h-9 rounded-xl border border-gray-200 bg-white flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors"
    >
      {isDark ? <Sun size={18} strokeWidth={1.5} /> : <Moon size={18} strokeWidth={1.5} />}
    </button>
  );
}
