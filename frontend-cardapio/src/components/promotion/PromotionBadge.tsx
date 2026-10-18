import { Clock, Flame, Sparkles } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import type { PromotionBadgeKind } from '../../lib/promotionPresentation';
import { PROMO_INK } from '../../lib/promotionTheme';

// Selo de destaque (só apresentação), só com contorno fino. O tipo vem de
// getPromotionBadgeKind.
export function PromotionBadge({ kind, muted = false }: { kind: PromotionBadgeKind; muted?: boolean }) {
  const { t } = useI18n();
  const Icon = kind === 'endingSoon' ? Clock : kind === 'hotDeal' ? Flame : Sparkles;
  const label =
    kind === 'endingSoon'
      ? t('promotionDetailPage.badge_termina_em_breve')
      : kind === 'hotDeal'
        ? t('promotionDetailPage.badge_hot_deal')
        : t('promotionDetailPage.badge_destaque');

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border border-black/15 bg-transparent px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.14em] dark:border-white/15 ${PROMO_INK} ${muted ? 'opacity-70' : ''}`}
    >
      <Icon size={13} strokeWidth={1.5} aria-hidden="true" />
      {label}
    </span>
  );
}
