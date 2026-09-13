import { useState } from 'react';
import { Star, Trash2 } from 'lucide-react';
import { deleteReview } from '../lib/customer-api';
import type { MyItemReview } from '../lib/customer-api';

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={14}
          fill={n <= rating ? '#F59E0B' : 'transparent'}
          className={n <= rating ? 'text-amber-500' : 'text-gray-300'}
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
    <div className="bg-white rounded-2xl p-4 border border-gray-100 flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 shrink-0">
          {review.productImageUrl && (
            <img src={review.productImageUrl} alt="" className="w-full h-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 truncate">{review.productName}</p>
          <Stars rating={review.rating} />
        </div>
        {!isConfirmingDelete && (
          <button
            onClick={() => setIsConfirmingDelete(true)}
            className="text-gray-400 p-1 shrink-0"
            aria-label="Apagar avaliação"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
      <p className="text-[11px] text-gray-400">
        {new Date(review.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
      </p>

      {isConfirmingDelete && (
        <div className="mt-1 bg-red-50 border border-red-100 rounded-xl p-3 flex flex-col gap-2">
          <p className="text-xs text-red-700">
            Apagar não permite avaliar esse item de novo — só um pedido novo com ele libera uma
            avaliação nova. Tem certeza?
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
