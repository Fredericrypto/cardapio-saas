import { activeDateLocale } from '../i18n/languages';
import { useI18n } from '../i18n/I18nContext';
import { Tooltip } from './Tooltip';
import { useState } from 'react';
import { Star, Trash2 } from 'lucide-react';
import { deleteReview } from '../lib/customer-api';
import type { MyItemReview } from '../lib/customer-api';
import {
  MENU_SURFACE,
  MENU_SURFACE_SUBTLE,
  MENU_BORDER,
  MENU_TEXT,
  MENU_TEXT_MUTED,
  MENU_TEXT_FAINT,
} from '../lib/menuTheme';

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={14}
          strokeWidth={1.5}
          fill={n <= rating ? '#F59E0B' : 'transparent'}
          className={n <= rating ? 'text-amber-500' : MENU_TEXT_FAINT}
        />
      ))}
    </div>
  );
}

// Linha de avaliação de ITEM na aba "Minhas Avaliações" — sempre só
// estrela (nunca tem texto, por decisão de produto), com foto/nome do
// produto pra identificar do que se trata. Mesma regra de imutabilidade
// da avaliação de restaurante: só apagar, nunca editar.
export function ItemReviewDisplay({
  tenantId,
  token,
  review,
  onDeleted,
}: {
  tenantId: string;
  token: string;
  review: MyItemReview;
  onDeleted: () => void;
}) {
  const { t } = useI18n();
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await deleteReview(tenantId, token, review.id);
      onDeleted();
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className={`${MENU_SURFACE} rounded-2xl p-4 border ${MENU_BORDER} flex flex-col gap-2`}>
      <div className="flex items-center gap-3">
        <div className={`w-12 h-12 rounded-lg overflow-hidden ${MENU_SURFACE_SUBTLE} shrink-0`}>
          {review.productImageUrl && (
            <img src={review.productImageUrl} alt="" className="w-full h-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${MENU_TEXT} truncate`}>{review.productName}</p>
          <Stars rating={review.rating} />
        </div>
        {!isConfirmingDelete && (
          <Tooltip label={t('itemReviewDisplay.apagar_avaliacao')} className="inline-flex shrink-0">
            <button
              onClick={() => setIsConfirmingDelete(true)}
              className={`${MENU_TEXT_MUTED} hover:text-[#DC2626] dark:hover:text-red-400 hover:bg-black/5 dark:hover:bg-white/10 p-1.5 rounded-lg transition-colors shrink-0`}
              aria-label={t('itemReviewDisplay.apagar_avaliacao')}
            >
              <Trash2 size={15} strokeWidth={1.5} />
            </button>
          </Tooltip>
        )}
      </div>
      <p className={`text-[11px] ${MENU_TEXT_MUTED}`}>
        {new Date(review.createdAt).toLocaleDateString(activeDateLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' })}
      </p>

      {isConfirmingDelete && (
        <div className="mt-1 bg-[#FEF2F2] dark:bg-red-500/10 border border-[#FEE2E2] dark:border-red-500/20 rounded-xl p-3 flex flex-col gap-2">
          <p className="text-xs text-[#B91C1C] dark:text-red-300">
            {t('itemReviewDisplay.apagar_nao_permite_avaliar')}
          </p>
          <div className="flex gap-2">
            <Tooltip label={t('common.cancel')} className="flex flex-1">
              <button
                onClick={() => setIsConfirmingDelete(false)}
                disabled={isDeleting}
                className="w-full py-2 rounded-lg border border-[#E5E7EB] dark:border-white/10 text-xs font-semibold text-[#4B5563] dark:text-[#C4C7C5] hover:bg-black/5 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
            </Tooltip>
            <Tooltip label={t('itemReviewDisplay.apagar_mesmo_assim')} className="flex flex-1">
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="w-full py-2 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {isDeleting ? 'Apagando...' : t('itemReviewDisplay.apagar_mesmo_assim')}
              </button>
            </Tooltip>
          </div>
        </div>
      )}
    </div>
  );
}
