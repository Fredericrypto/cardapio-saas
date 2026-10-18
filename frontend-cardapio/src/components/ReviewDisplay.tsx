import { useI18n } from '../i18n/I18nContext';
import { RestaurantResponse } from './ReviewsShared';
import { Tooltip } from './Tooltip';
import { useState } from 'react';
import { Star, Trash2, EyeOff } from 'lucide-react';
import { deleteReview } from '../lib/customer-api';
import type { MyReview } from '../lib/customer-api';
import {
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
          size={16}
          strokeWidth={1.5}
          fill={n <= rating ? '#F59E0B' : 'transparent'}
          className={n <= rating ? 'text-amber-500' : MENU_TEXT_FAINT}
        />
      ))}
    </div>
  );
}

// Mostra a avaliação já feita desse pedido, no cupom — só EXIBE, nunca
// deixa editar (a review é imutável depois de publicada, ver
// ReviewsService no backend). A única ação possível aqui é apagar, com
// confirmação explicando que o pedido não poderá ser avaliado de novo.
export function ReviewDisplay({
  tenantId,
  token,
  review,
  onDeleted,
}: {
  tenantId: string;
  token: string;
  review: MyReview;
  onDeleted: () => void;
  // Nome do restaurante configurado pelo admin (ex: "Restaurante
  // Awesome") — pedido do Felipe: mostrar o nome de verdade em vez do
  // rótulo genérico "Resposta do restaurante".
  restaurantName?: string; // legado: o nome agora vem do tenant (RestaurantResponse)
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
    <div className={`bg-[#FFFFFF]/70 dark:bg-[#161617]/70 rounded-2xl p-5 border ${MENU_BORDER} flex flex-col gap-2`}>
      <div className="flex items-center justify-between">
        <p className={`text-sm font-semibold ${MENU_TEXT}`}>{t('reviewDisplay.sua_avaliacao')}</p>
        {!isConfirmingDelete && (
          <Tooltip label={t('itemReviewDisplay.apagar_avaliacao')} className="inline-flex shrink-0">
            <button
              onClick={() => setIsConfirmingDelete(true)}
              className={`${MENU_TEXT_MUTED} hover:text-[#DC2626] dark:hover:text-red-400 hover:bg-black/5 dark:hover:bg-white/10 p-1.5 rounded-lg transition-colors`}
              aria-label={t('itemReviewDisplay.apagar_avaliacao')}
            >
              <Trash2 size={15} strokeWidth={1.5} />
            </button>
          </Tooltip>
        )}
      </div>
      <Stars rating={review.rating} />
      {review.comment && <p className="text-sm text-[#4B5563] dark:text-[#C4C7C5]">{review.comment}</p>}
      {review.isAnonymous && (
        <p className={`text-xs ${MENU_TEXT_MUTED} flex items-center gap-1`}>
          <EyeOff size={12} strokeWidth={1.5} />
          {t('reviewDisplay.publicada_como_anonimo')}
        </p>
      )}

      {/* Resposta do restaurante — pedido do Felipe: antes o cliente não
          tinha como saber que foi respondido, só o admin via a própria
          resposta. Mesmo texto/data que já aparece na vitrine pública
          (ver ReviewDisplay do lado admin/PublicReviewsPage). */}
      {review.response && (
        <RestaurantResponse responseText={review.response.responseText} className="mt-1" />
      )}

      {isConfirmingDelete && (
        <div className="mt-1 bg-[#FEF2F2] dark:bg-red-500/10 border border-[#FEE2E2] dark:border-red-500/20 rounded-xl p-3 flex flex-col gap-2">
          <p className="text-xs text-[#B91C1C] dark:text-red-300">
            {t('reviewDisplay.apagar_nao_permite_avaliar')}
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
