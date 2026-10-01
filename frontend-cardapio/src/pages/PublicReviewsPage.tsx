import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchPublicReviews, fetchReviewsSummary } from '../lib/customer-api';
import type { PublicReview, ReviewSummary } from '../lib/customer-api';
import { useSelectedLocation } from '../hooks/useSelectedLocation';
import { useTenant } from '../contexts/TenantContext';
import { ReviewsPageLayout } from '../components/ReviewsShared';

// Página pública de avaliações — SEM login, qualquer visitante do
// cardápio pode ver. Mostra TODA review publicada, sem filtro nenhum de
// nota (nunca esconde as ruins) — é literalmente a mesma lista que
// alimenta a média mostrada no header do cardápio. Sempre filtrada pela
// LOJA selecionada (cada unidade tem sua própria nota e lista,
// independente das outras). O layout é o mesmo da página de avaliações
// de cada item (ReviewsPageLayout).
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
    <ReviewsPageLayout
      onBack={() => navigate(`/${slug}`)}
      summary={summary}
      reviews={reviews}
      total={total}
      isLoading={isLoading}
      onLoadMore={() => setPage((p) => p + 1)}
    />
  );
}
