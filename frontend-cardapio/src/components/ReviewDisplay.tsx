import { useState } from 'react';
import { Star, Trash2, EyeOff } from 'lucide-react';
import { deleteReview } from '../lib/customer-api';
import type { MyReview } from '../lib/customer-api';

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={16}
          fill={n <= rating ? '#F59E0B' : 'transparent'}
          className={n <= rating ? 'text-amber-500' : 'text-gray-300'}
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
}) {
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
    <div className="bg-white rounded-2xl p-5 border border-gray-100 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900">Sua avaliação</p>
        {!isConfirmingDelete && (
          <button
            onClick={() => setIsConfirmingDelete(true)}
            className="text-gray-400 p-1"
            aria-label="Apagar avaliação"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
      <Stars rating={review.rating} />
      {review.comment && <p className="text-sm text-gray-600">{review.comment}</p>}
      {review.isAnonymous && (
        <p className="text-xs text-gray-400 flex items-center gap-1">
          <EyeOff size={12} />
          Publicada como anônimo
        </p>
      )}

      {isConfirmingDelete && (
        <div className="mt-1 bg-red-50 border border-red-100 rounded-xl p-3 flex flex-col gap-2">
          <p className="text-xs text-red-700">
            Apagar não permite avaliar esse pedido de novo — só uma compra nova libera uma nova
            avaliação. Tem certeza?
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setIsConfirmingDelete(false)}
              disabled={isDeleting}
              className="flex-1 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex-1 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold disabled:opacity-50"
            >
              {isDeleting ? 'Apagando...' : 'Apagar mesmo assim'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
