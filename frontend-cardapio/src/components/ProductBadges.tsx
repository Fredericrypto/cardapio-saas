import {
  Apple,
  BookOpen,
  Camera,
  ChefHat,
  Flame,
  Hand,
  Heart,
  Hourglass,
  Leaf,
  Milk,
  ShoppingBasket,
  Snowflake,
  Thermometer,
  TrendingUp,
  Wheat,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { BADGE_LABEL_KEY, hasBadgeRow } from '../lib/productBadgeCatalog';
import type { AutoBadgeCode, DeclaredBadgeCode, ProductBadgeView } from '../lib/productBadgeCatalog';

// Selos do produto — minimalistas e parte natural da tela (não adesivos):
//  - AUTOMÁTICOS (mais pedido, favorito, tendência): borda e texto mais fortes, ícone
//    de traço fino. São os que trazem credibilidade, então ficam na frente.
//  - DECLARATIVOS (do restaurante): mais discretos, com o ícone próprio de cada selo
//    (os mesmos que o admin vê ao escolher).
// Sem cor berrante, sem sombra, sem animação; pares claro/escuro em hex fixo.

const AUTO_ICON: Record<AutoBadgeCode, LucideIcon> = {
  top_ordered: Flame,
  customer_favorite: Heart,
  trending: TrendingUp,
};

// Cor SÓ no traço de cada ícone (claro / escuro), para identificar o selo de relance.
const AUTO_ICON_COLOR: Record<AutoBadgeCode, string> = {
  top_ordered: 'text-[#EA580C] dark:text-[#FB923C]',
  customer_favorite: 'text-[#E11D48] dark:text-[#FB7185]',
  trending: 'text-[#059669] dark:text-[#34D399]',
};

const DECLARED_ICON_COLOR: Record<DeclaredBadgeCode, string> = {
  illustrative_image: 'text-[#64748B] dark:text-[#94A3B8]',
  selected_ingredients: 'text-[#65A30D] dark:text-[#A3E635]',
  artisanal: 'text-[#C2410C] dark:text-[#FB923C]',
  always_fresh: 'text-[#0284C7] dark:text-[#38BDF8]',
  house_recipe: 'text-[#7C3AED] dark:text-[#A78BFA]',
  chef_recommended: 'text-[#0D9488] dark:text-[#2DD4BF]',
  limited_edition: 'text-[#C026D3] dark:text-[#E879F9]',
  vegan: 'text-[#16A34A] dark:text-[#4ADE80]',
  gluten_free: 'text-[#CA8A04] dark:text-[#FACC15]',
  lactose_free: 'text-[#4F46E5] dark:text-[#818CF8]',
  spicy: 'text-[#DC2626] dark:text-[#F87171]',
  healthy_option: 'text-[#E11D48] dark:text-[#FB7185]',
};

const DECLARED_ICON: Record<DeclaredBadgeCode, LucideIcon> = {
  illustrative_image: Camera,
  selected_ingredients: ShoppingBasket,
  artisanal: Hand,
  always_fresh: Snowflake,
  house_recipe: BookOpen,
  chef_recommended: ChefHat,
  limited_edition: Hourglass,
  vegan: Leaf,
  gluten_free: Wheat,
  lactose_free: Milk,
  spicy: Thermometer,
  healthy_option: Apple,
};

const AUTO_CHIP =
  'inline-flex items-center gap-2 rounded-full border border-[#D1D5DB] bg-[#F9FAFB] px-3.5 py-2 text-sm font-semibold text-[#111827] dark:border-white/20 dark:bg-white/[0.07] dark:text-[#E3E2E6]';
const DECLARED_CHIP =
  'inline-flex items-center gap-2 rounded-full bg-[#F3F4F6] px-3.5 py-2 text-sm font-medium text-[#4B5563] dark:bg-white/[0.06] dark:text-[#C4C7C5]';

export function ProductBadgeRow({ view, className = '' }: { view: ProductBadgeView; className?: string }) {
  const { t } = useI18n();
  if (!hasBadgeRow(view)) return null;
  return (
    <ul aria-label={t('productBadges.listLabel')} className={`flex flex-wrap items-center gap-2 ${className}`}>
      {view.auto.map((code) => {
        const Icon = AUTO_ICON[code];
        return (
          <li key={code} className={AUTO_CHIP}>
            <Icon size={16} strokeWidth={1.75} aria-hidden="true" className={AUTO_ICON_COLOR[code]} />
            {t(BADGE_LABEL_KEY[code])}
          </li>
        );
      })}
      {view.declared.map((code) => {
        const Icon = DECLARED_ICON[code];
        return (
          <li key={code} className={DECLARED_CHIP}>
            <Icon size={15} strokeWidth={1.75} aria-hidden="true" className={DECLARED_ICON_COLOR[code]} />
            {t(BADGE_LABEL_KEY[code])}
          </li>
        );
      })}
    </ul>
  );
}

// Selo discreto SOBRE a foto (canto inferior esquerdo): transparência, sem competir
// com o produto. Vidro escuro translúcido funciona em foto clara e escura.
export function IllustrativeImageSeal({ className = '' }: { className?: string }) {
  const { t } = useI18n();
  return (
    <span
      className={`pointer-events-none inline-flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1.5 text-[11px] font-medium text-white/90 backdrop-blur-md ${className}`}
    >
      <Camera size={12} strokeWidth={1.75} aria-hidden="true" />
      {t(BADGE_LABEL_KEY.illustrative_image)}
    </span>
  );
}
