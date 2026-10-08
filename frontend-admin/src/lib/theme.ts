// Tema do painel (claro/escuro). Fonte única da verdade: a classe `dark` no <html>.
// - Padrão: CLARO (cores originais da aplicação).
// - A escolha persiste no localStorage e vale para todas as abas abertas.
// - O <script> inline do index.html aplica a classe ANTES do primeiro paint
//   (sem "flash" de tema claro ao recarregar em modo escuro); este módulo só
//   mantém o estado depois que o React sobe.
export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'cardapio-admin-theme';

const listeners = new Set<() => void>();

function readStoredTheme(): Theme {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    // Modo privado / storage bloqueado: segue no claro, sem quebrar.
    return 'light';
  }
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  // Faz scrollbars, <select>, date pickers etc. nativos acompanharem o tema.
  root.style.colorScheme = theme;
}

let current: Theme = readStoredTheme();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function getTheme(): Theme {
  return current;
}

export function setTheme(theme: Theme): void {
  if (theme === current) return;
  current = theme;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // sem persistência, mas o tema continua valendo nesta sessão
  }
  applyTheme(theme);
  emit();
}

export function toggleTheme(): void {
  setTheme(current === 'dark' ? 'light' : 'dark');
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Chamado uma vez em main.tsx, antes de renderizar.
export function initTheme(): void {
  current = readStoredTheme();
  applyTheme(current);
  // Outra aba do painel trocou o tema → acompanha.
  window.addEventListener('storage', (event) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    const next = readStoredTheme();
    if (next === current) return;
    current = next;
    applyTheme(next);
    emit();
  });
}
