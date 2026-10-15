import { Camera, Check, Flame, Heart, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { BADGE_LABEL_KEY, hasBadgeRow } from '../lib/productBadgeCatalog';
import type { AutoBadgeCode, ProductBadgeView } from '../lib/productBadgeCatalog';

// Selos do produto — minimalistas e parte natural da tela (não adesivos):
//  - AUTOMÁTICOS (mais pedido, favorito, tendência): borda e texto mais fortes, ícone
//    de traço fino. São os que trazem credibilidade, então ficam na frente.
//  - DECLARATIVOS (do restaurante): mais discretos, só um "check" suave.
// Sem cor berrante, sem sombra, sem animação; pares claro/escuro em hex fixo.

const AUTO_ICON: Record<AutoBadgeCode, LucideIcon> = {
  top_ordered: Flame,
  customer_favorite: Heart,
  trending: TrendingUp,
};

const AUTO_CHIP =
  'inline-flex items-center gap-1.5 rounded-full border border-[#D1D5DB] bg-[#F9FAFB] px-2.5 py-1 text-xs font-semibold text-[#111827] dark:border-white/20 dark:bg-white/[0.07] dark:text-[#E3E2E6]';
const DECLARED_CHIP =
  'inline-flex items-center gap-1 rounded-full bg-[#F3F4F6] px-2.5 py-1 text-xs font-medium text-[#4B5563] dark:bg-white/[0.06] dark:text-[#C4C7C5]';

export function ProductBadgeRow({ view, className = '' }: { view: ProductBadgeView; className?: string }) {
  const { t } = useI18n();
  if (!hasBadgeRow(view)) return null;
  return (
    <ul aria-label={t('productBadges.listLabel')} className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {view.auto.map((code) => {
        const Icon = AUTO_ICON[code];
        return (
          <li key={code} className={AUTO_CHIP}>
            <Icon size={13} strokeWidth={1.75} aria-hidden="true" />
            {t(BADGE_LABEL_KEY[code])}
          </li>
        );
      })}
      {view.declared.map((code) => (
        <li key={code} className={DECLARED_CHIP}>
          <Check size={12} strokeWidth={2} aria-hidden="true" className="text-[#9CA3AF] dark:text-[#8E918F]" />
          {t(BADGE_LABEL_KEY[code])}
        </li>
      ))}
    </ul>
  );
}

// Selo discreto SOBRE a foto (canto inferior esquerdo): transparência, sem competir
// com o produto. Vidro escuro translúcido funciona em foto clara e escura.
export function IllustrativeImageSeal({ className = '' }: { className?: string }) {
  const { t } = useI18n();
  return (
    <span
      className={`pointer-events-none inline-flex items-center gap-1 rounded-full bg-black/45 px-2 py-1 text-[10px] font-medium text-white/90 backdrop-blur-md ${className}`}
    >
      <Camera size={11} strokeWidth={1.75} aria-hidden="true" />
      {t(BADGE_LABEL_KEY.illustrative_image)}
    </span>
  );
}
