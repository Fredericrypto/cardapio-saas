import { Star } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import type { ReviewSummary } from '../lib/customer-api';
import { MENU_TEXT_BODY } from '../lib/menuTheme';
import './review-extras.css';

// 0 = Todas.
export type RatingFilterValue = 0 | 1 | 2 | 3 | 4 | 5;

const OPTIONS: RatingFilterValue[] = [0, 5, 4, 3, 2, 1];

// Barra de filtro por nota. Só troca o valor; quem busca (no servidor) é a página.
// Os contadores vêm da distribuição do resumo (já respeita a loja selecionada).
export function ReviewFilter({
  value,
  onChange,
  summary,
}: {
  value: RatingFilterValue;
  onChange: (v: RatingFilterValue) => void;
  summary: ReviewSummary | null;
}) {
  const { t } = useI18n();
  const labelFor = (v: RatingFilterValue): string => {
    switch (v) {
      case 0:
        return t('reviewsFilter.all');
      case 1:
        return t('reviewsFilter.star1');
      case 2:
        return t('reviewsFilter.star2');
      case 3:
        return t('reviewsFilter.star3');
      case 4:
        return t('reviewsFilter.star4');
      default:
        return t('reviewsFilter.star5');
    }
  };
  const countFor = (v: RatingFilterValue): number | null =>
    !summary ? null : v === 0 ? summary.count : summary.distribution[v];

  return (
    <div
      role="group"
      aria-label={t('reviewsFilter.label')}
      className="flex flex-wrap gap-2 py-1"
    >
      {OPTIONS.map((v) => {
        const active = v === value;
        const count = countFor(v);
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            aria-pressed={active}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 lg:h-9 lg:px-3.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d97757] ${
              active
                ? 'border-[#d97757] bg-[#d97757] text-white shadow-sm'
                : `border-black/10 bg-black/[0.03] hover:bg-black/[0.06] dark:border-white/15 dark:bg-white/[0.05] dark:hover:bg-white/10 ${MENU_TEXT_BODY}`
            }`}
          >
            {v !== 0 && (
              <Star size={12} strokeWidth={1.75} fill={active ? 'currentColor' : '#F59E0B'} className={active ? '' : 'text-amber-500'} aria-hidden="true" />
            )}
            {labelFor(v)}
            {count !== null && <span className={`tabular-nums ${active ? 'text-white/80' : 'opacity-60'}`}>{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
