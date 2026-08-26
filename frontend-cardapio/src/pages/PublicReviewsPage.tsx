import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Star, User } from 'lucide-react';
import { fetchPublicReviews, fetchReviewsSummary } from '../lib/customer-api';
import type { PublicReview, ReviewSummary } from '../lib/customer-api';
import { useSelectedLocation } from '../hooks/useSelectedLocation';
import { useTenant } from '../contexts/TenantContext';

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          fill={n <= rating ? '#F59E0B' : 'transparent'}
          className={n <= rating ? 'text-amber-500' : 'text-gray-300'}
        />
      ))}
    </div>
  );
}

// Avatar genérico (sem foto de perfil no sistema hoje) — anônimo ganha
// um ícone neutro cinza igual qualquer rede social usa como placeholder;
// nome real ganha um círculo colorido com a inicial, determinístico
// (mesmo nome sempre cai na mesma cor) só pra dar um pouco de
// identidade visual sem precisar de upload de foto nenhum.
const AVATAR_COLORS = ['#F59E0B', '#EF4444', '#8B5CF6', '#10B981', '#3B82F6', '#EC4899'];
function ReviewerAvatar({ name, isAnonymous }: { name: string; isAnonymous: boolean }) {
  if (isAnonymous) {
    return (
      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
        <User size={16} className="text-gray-400" />
      </div>
    );
  }
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const colorIndex = name.charCodeAt(0) % AVATAR_COLORS.length;
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-bold"
      style={{ backgroundColor: AVATAR_COLORS[colorIndex] }}
    >
      {initial}
    </div>
  );
}

// Página pública de avaliações — SEM login, qualquer visitante do
// cardápio pode ver. Mostra TODA review publicada, sem filtro nenhum de
// nota (nunca esconde as ruins) — é literalmente a mesma lista que
// alimenta a média mostrada no header do cardápio. Sempre filtrada pela
// LOJA selecionada (cada unidade tem sua própria nota e lista,
// independente das outras).
export function PublicReviewsPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const { location } = useSelectedLocation(tenant?.id);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!tenant) return;
    setIsLoading(true);
    Promise.all([
      fetchReviewsSummary(tenant.id, location?.id),
      fetchPublicReviews(tenant.id, location?.id, page),
    ]).then(([s, r]) => {
      setSummary(s);
      setReviews((prev) => (page === 1 ? r.items : [...prev, ...r.items]));
      setTotal(r.total);
      setIsLoading(false);
    });
  }, [tenant, location?.id, page]);

  if (!tenant) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-10 max-w-md mx-auto">
      <div className="flex items-center gap-3 px-4 py-4 bg-white border-b border-gray-100">
        <button onClick={() => navigate(`/${slug}`)}>
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-display font-bold text-lg">Avaliações</h1>
      </div>

      {summary && (
        <div className="px-4 mt-4">
          <div className="bg-white rounded-2xl p-5 border border-gray-100 flex items-center gap-4">
            <div className="text-center shrink-0">
              <p className="text-3xl font-bold text-gray-900">
                {summary.count > 0 ? summary.average.toFixed(1) : '—'}
              </p>
              {summary.count > 0 && <Stars rating={Math.round(summary.average)} />}
              <p className="text-[11px] text-gray-400 mt-0.5">
                {summary.count} {summary.count === 1 ? 'avaliação' : 'avaliações'}
              </p>
            </div>
            <div className="flex-1 flex flex-col gap-1">
              {[5, 4, 3, 2, 1].map((n) => {
                const count = summary.distribution[n as 1 | 2 | 3 | 4 | 5];
                const pct = summary.count > 0 ? (count / summary.count) * 100 : 0;
                return (
                  <div key={n} className="flex items-center gap-1.5">
                    <span className="text-[10px] text-gray-400 w-3">{n}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full bg-amber-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="px-4 mt-4 flex flex-col gap-3">
        {!isLoading && reviews.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-12">Ainda não há avaliações por aqui.</p>
        )}

        {reviews.map((review) => (
          <div key={review.id} className="bg-white rounded-2xl p-4 border border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ReviewerAvatar name={review.customerDisplayName} isAnonymous={review.isAnonymous} />
                <p className="text-sm font-semibold text-gray-900">{review.customerDisplayName}</p>
              </div>
              <Stars rating={review.rating} />
            </div>
            <p className="text-xs text-gray-400 mt-0.5 ml-[38px]">{formatDate(review.createdAt)}</p>
            {review.comment && <p className="text-sm text-gray-700 mt-2">{review.comment}</p>}
            {review.response && (
              <div className="mt-2.5 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                <p className="text-xs font-semibold text-gray-500">Resposta do restaurante</p>
                <p className="text-sm text-gray-700 mt-0.5">{review.response.responseText}</p>
              </div>
            )}
          </div>
        ))}

        {reviews.length < total && (
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={isLoading}
            className="py-2.5 text-sm font-semibold text-gray-500"
          >
            {isLoading ? 'Carregando...' : 'Ver mais avaliações'}
          </button>
        )}
      </div>
    </div>
  );
}
