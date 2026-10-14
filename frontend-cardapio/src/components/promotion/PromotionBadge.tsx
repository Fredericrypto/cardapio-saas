import { Clock, Flame, Sparkles } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { withAlpha } from '../../lib/promotionPresentation';
import type { PromotionBadgeKind } from '../../lib/promotionPresentation';

// Selo de destaque (só apresentação). O tipo vem de getPromotionBadgeKind.
export function PromotionBadge({
  kind,
  primaryColor,
  accent,
  muted = false,
}: {
  kind: PromotionBadgeKind;
  primaryColor: string;
  accent: string;
  muted?: boolean;
}) {
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
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider"
      style={
        muted
          ? undefined
          : { color: accent, backgroundColor: withAlpha(primaryColor, 0.12), borderColor: withAlpha(primaryColor, 0.3) }
      }
    >
      <Icon size={13} strokeWidth={1.5} aria-hidden="true" />
      <span className={muted ? 'text-[#6B7280] dark:text-[#C4C7C5]' : undefined}>{label}</span>
    </span>
  );
}
