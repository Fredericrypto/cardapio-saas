import { useI18n } from '../i18n/I18nContext';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { Tooltip } from './Tooltip';

// Único alternador claro/escuro do app (usado nos cabeçalhos do cardápio geral
// e da mesa). Botão redondo com fundo que acompanha o tema (branco translúcido
// no claro, #1E1E20 no escuro) para sobrepor o banner. Mostra o ícone da AÇÃO
// (lua = ir para o escuro, sol = voltar para o claro) e o balão diz a mesma
// coisa ("Switch to dark mode" / "Switch to light mode"). O balão é do
// componente `Tooltip` (portal em `position: fixed`); não há `title` nativo,
// senão o navegador abriria um segundo balão por cima. A escolha persiste em
// localStorage (lib/theme.ts).
export function ThemeToggle() {
  const { t } = useI18n();
  const { isDark, toggleTheme } = useTheme();
  const label = isDark ? t('themeToggle.ativar_modo_claro') : t('themeToggle.ativar_modo_escuro');
  return (
    <Tooltip label={label} className="contents">
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={label}
        aria-pressed={isDark}
        className="w-9 h-9 shrink-0 rounded-full bg-white/90 dark:bg-[#1E1E20]/90 backdrop-blur-sm ring-1 ring-black/5 dark:ring-white/10 flex items-center justify-center shadow-sm active:scale-90 transition-transform text-gray-700 dark:text-gray-200"
      >
        {isDark ? <Sun size={18} strokeWidth={1.5} /> : <Moon size={18} strokeWidth={1.5} />}
      </button>
    </Tooltip>
  );
}
