import { useMemo } from 'react';
import { accentOnDark } from '../lib/accentColor';
import { useTheme } from './useTheme';

// Cor da marca pronta para texto/ícone: no tema escuro, clareada se for escura demais.
export function useAccentColor(color: string): string {
  const { isDark } = useTheme();
  return useMemo(() => (isDark ? accentOnDark(color) : color), [isDark, color]);
}
