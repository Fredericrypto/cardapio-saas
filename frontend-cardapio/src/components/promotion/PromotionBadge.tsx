import { Clock, Flame, Sparkles } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import type { PromotionBadgeKind } from '../../lib/promotionPresentation';

// Selo de destaque (só apresentação), nas cores do tema do app. O tipo vem de
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
      className={`inline-flex items-center gap-2 rounded-full border border-black/10 dark:border-white/15 bg-[#FFFFFF]/70 dark:bg-white/10 backdrop-blur px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-[#111827] dark:text-[#E3E2E6] ${muted ? 'opacity-70' : ''}`}
    >
      <Icon size={15} strokeWidth={1.5} aria-hidden="true" />
      {label}
    </span>
  );
}
