import { useSyncExternalStore } from 'react';
import { getTheme, setTheme, subscribeTheme, toggleTheme } from '../lib/theme';
import type { Theme } from '../lib/theme';

export function useTheme() {
  const theme = useSyncExternalStore<Theme>(subscribeTheme, getTheme, () => 'light');
  return { theme, isDark: theme === 'dark', setTheme, toggleTheme };
}

// Cores dos gráficos (recharts/SVG não leem classes do Tailwind).
export interface ChartPalette {
  ink: string; // linha/área principal e série "mesa"
  grid: string;
  tick: string;
  surface: string; // contorno dos pontos (cor do card)
  channelBalcao: string;
  channelEntrega: string;
  heatEmpty: string;
  heatRgb: string; // "r,g,b" da escala do mapa de calor
}

const LIGHT: ChartPalette = {
  ink: '#18181B',
  grid: '#eeeeee',
  tick: '#9ca3af',
  surface: '#ffffff',
  channelBalcao: '#71717a',
  channelEntrega: '#d4d4d8',
  heatEmpty: '#f4f4f5',
  heatRgb: '24,24,27',
};

const DARK: ChartPalette = {
  ink: '#E3E2E6',
  grid: '#333537',
  tick: '#8E918F',
  surface: '#1E1E20',
  channelBalcao: '#8E918F',
  channelEntrega: '#444746',
  heatEmpty: '#282A2C',
  heatRgb: '227,226,230',
};

export function useChartPalette(): ChartPalette {
  const { isDark } = useTheme();
  return isDark ? DARK : LIGHT;
}
