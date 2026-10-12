// Tema do cardápio (claro/escuro). Fonte única da verdade: a classe `dark` no <html>.
// - Sem escolha salva, segue a preferência do sistema (prefers-color-scheme).
// - A escolha manual persiste no localStorage e vale para todas as abas abertas.
// - O <script> inline do index.html aplica a classe ANTES do primeiro paint
//   (sem "flash" ao recarregar); este módulo só mantém o estado depois que o React sobe.
export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'cardapio-customer-theme';

const listeners = new Set<() => void>();

function readStoredTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    // Modo privado / storage bloqueado: cai na preferência do sistema.
    return null;
  }
}

function systemTheme(): Theme {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function resolveTheme(): Theme {
  return readStoredTheme() ?? systemTheme();
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  // Faz scrollbars, <select>, date pickers etc. nativos acompanharem o tema.
  root.style.colorScheme = theme;
}

let current: Theme = resolveTheme();

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

function syncFromEnvironment(): void {
  const next = resolveTheme();
  if (next === current) return;
  current = next;
  applyTheme(next);
  emit();
}

// Chamado uma vez em main.tsx, antes de renderizar.
export function initTheme(): void {
  current = resolveTheme();
  applyTheme(current);
  // Outra aba trocou o tema → acompanha.
  window.addEventListener('storage', (event) => {
    if (event.key !== null && event.key !== THEME_STORAGE_KEY) return;
    syncFromEnvironment();
  });
  // Sistema trocou claro/escuro → acompanha só se o usuário nunca escolheu manualmente.
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (readStoredTheme() === null) syncFromEnvironment();
    });
  } catch {
    // navegador sem matchMedia.addEventListener: ignora
  }
}
