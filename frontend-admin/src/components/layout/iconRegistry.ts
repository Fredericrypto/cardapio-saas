import {
  BadgeCheck,
  Gift,
  History,
  LayoutDashboard,
  Percent,
  ScanLine,
  Settings,
  ShieldCheck,
  Star,
  StickyNote,
  Store,
  Table2,
  TrendingUp,
  UtensilsCrossed,
  Wallet,
  Circle,
  type LucideIcon,
} from 'lucide-react';

// nome (string em sidebarConfig) → componente Lucide. Ícone novo = uma linha.
const ICONS: Record<string, LucideIcon> = {
  BadgeCheck,
  Gift,
  History,
  LayoutDashboard,
  Percent,
  ScanLine,
  Settings,
  ShieldCheck,
  Star,
  StickyNote,
  Store,
  Table2,
  TrendingUp,
  UtensilsCrossed,
  Wallet,
};

export function getIcon(name: string): LucideIcon {
  return ICONS[name] ?? Circle;
}
