import { ArrowLeft, Star, User } from 'lucide-react';
import type { PublicReview, ReviewSummary } from '../lib/customer-api';
import { useTenant } from '../contexts/TenantContext';
import { VerifiedBadge } from './VerifiedBadge';

// Peças visuais ÚNICAS das telas de avaliação: a do restaurante
// (PublicReviewsPage) e a de cada item (ItemReviewsPage) usam exatamente
// o mesmo padrão — nota geral + distribuição, cards de avaliação e a
// resposta do restaurante.

export function formatReviewDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
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

// Cliente tem avatar (predefinido, escolhido no perfil) — mostra a foto
// de verdade quando a review não é anônima e o cliente tem uma
// escolhida; cai pro círculo colorido com a inicial só quando não tem
// avatar definido. Anônimo sempre ganha o ícone neutro cinza, nunca a
// foto real — mesma regra de privacidade de sempre.
const AVATAR_COLORS = ['#F59E0B', '#EF4444', '#8B5CF6', '#10B981', '#3B82F6', '#EC4899'];
export function ReviewerAvatar({
  name,
  avatarUrl,
  isAnonymous,
  isVerified,
}: {
  name: string;
  avatarUrl: string | null;
  isAnonymous: boolean;
  isVerified: boolean;
}) {
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
    <div className="relative shrink-0">
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover bg-gray-100" />
      ) : (
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
          style={{ backgroundColor: AVATAR_COLORS[colorIndex] }}
        >
          {initial}
        </div>
      )}
      {isVerified && (
        <span className="absolute -bottom-0.5 -right-0.5">
          <VerifiedBadge size={12} />
        </span>
      )}
    </div>
  );
}

// Resposta do restaurante: identificada SÓ pelo nome do restaurante e
// pela foto dele — na mesma janelinha QUADRADA de cantos arredondados do
// perfil do restaurante (nunca redonda, que é o formato dos avatares de
// cliente) — seguidos do texto da resposta.
export function RestaurantResponse({
  responseText,
  className = '',
}: {
  responseText: string;
  className?: string;
}) {
  const { tenant } = useTenant();
  return (
    <div className={`bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100 ${className}`}>
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg border-2 border-white shadow-sm bg-white overflow-hidden shrink-0">
          {tenant?.logoUrl ? (
            <img src={tenant.logoUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-white text-xs font-bold"
              style={{ backgroundColor: tenant?.primaryColor }}
            >
              {tenant?.name?.[0]?.toUpperCase()}
            </div>
          )}
        </div>
        <p className="text-xs font-semibold text-gray-700 truncate">{tenant?.name ?? 'Restaurante'}</p>
      </div>
      <p className="text-sm text-gray-700 mt-2">{responseText}</p>
    </div>
  );
}

export function ReviewCard({ review }: { review: PublicReview }) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <ReviewerAvatar
            name={review.customerDisplayName}
            avatarUrl={review.customerAvatarUrl}
            isAnonymous={review.isAnonymous}
            isVerified={review.customerIsVerified}
          />
          <p className="text-sm font-semibold text-gray-900 flex items-center gap-1">
            {review.customerDisplayName}
            {review.customerIsVerified && <VerifiedBadge size={13} />}
          </p>
        </div>
        <Stars rating={review.rating} />
      </div>
      <p className="text-xs text-gray-400 mt-0.5 ml-[38px]">{formatReviewDate(review.createdAt)}</p>
      {review.comment && <p className="text-sm text-gray-700 mt-2">{review.comment}</p>}
      {review.response && (
        <RestaurantResponse responseText={review.response.responseText} className="mt-2.5" />
      )}
    </div>
  );
}

// Página completa de avaliações (cabeçalho com voltar, nota geral com a
// distribuição, lista de cards e "Ver mais"). A do restaurante e a de
// cada item usam este mesmo layout.
export function ReviewsPageLayout({
  subtitle,
  onBack,
  summary,
  reviews,
  total,
  isLoading,
  onLoadMore,
}: {
  subtitle?: string;
  onBack: () => void;
  summary: ReviewSummary | null;
  reviews: PublicReview[];
  total: number;
  isLoading: boolean;
  onLoadMore: () => void;
}) {
  return (
    <div className="min-h-screen bg-gray-50 pb-10 max-w-md mx-auto">
      <div className="flex items-center gap-3 px-4 py-4 bg-white border-b border-gray-100">
        <button onClick={onBack} aria-label="Voltar">
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0">
          <h1 className="font-display font-bold text-lg leading-tight">Avaliações</h1>
          {subtitle && <p className="text-xs text-gray-400 truncate">{subtitle}</p>}
        </div>
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
          <ReviewCard key={review.id} review={review} />
        ))}

        {reviews.length < total && (
          <button
            onClick={onLoadMore}
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
