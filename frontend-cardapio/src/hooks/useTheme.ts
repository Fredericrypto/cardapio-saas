import { useSyncExternalStore } from 'react';
import { getTheme, setTheme, subscribeTheme, toggleTheme } from '../lib/theme';
import type { Theme } from '../lib/theme';

export function useTheme() {
  const theme = useSyncExternalStore<Theme>(subscribeTheme, getTheme, () => 'light');
  return { theme, isDark: theme === 'dark', setTheme, toggleTheme };
}
