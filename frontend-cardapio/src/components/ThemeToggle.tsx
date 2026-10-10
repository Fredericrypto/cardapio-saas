import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

interface ThemeToggleProps {
  // `floating`: botão redondo translúcido para sobrepor o banner do cabeçalho
  // (mesmo visual do botão "Voltar"). `default`: botão quadrado com borda.
  variant?: 'default' | 'floating';
}

// Alterna claro/escuro. Mostra o ícone da AÇÃO (lua = ir para o escuro,
// sol = voltar para o claro). A escolha persiste em localStorage (lib/theme.ts).
export function ThemeToggle({ variant = 'default' }: ThemeToggleProps) {
  const { isDark, toggleTheme } = useTheme();
  const label = isDark ? 'Ativar modo claro' : 'Ativar modo escuro';
  const className =
    variant === 'floating'
      ? 'w-9 h-9 shrink-0 rounded-full bg-white/90 dark:bg-[#1E1E20]/90 backdrop-blur-sm flex items-center justify-center shadow-sm active:scale-90 transition-transform text-gray-700 dark:text-gray-200'
      : 'w-9 h-9 shrink-0 rounded-xl border border-gray-200 bg-white flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors dark:border-white/10 dark:bg-[#1E1E20] dark:text-gray-300 dark:hover:bg-[#282A2C]';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      aria-pressed={isDark}
      title={label}
      className={className}
    >
      {isDark ? <Sun size={18} strokeWidth={1.5} /> : <Moon size={18} strokeWidth={1.5} />}
    </button>
  );
}
