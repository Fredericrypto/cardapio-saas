import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { getActiveMesaToken } from '../lib/seat';
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
  const routerLocation = useLocation();
  const { token: customerToken } = useCustomerAuth();

  // Voltar SEMPRE para de onde a pessoa veio (mesa ou cardápio geral). Antes
  // o botão ia fixo para o cardápio geral, enquanto o voltar do aparelho
  // (histórico) ia para a mesa — daí "às vezes uma seção, às vezes outra",
  // 2 ou 3 tentativas. Agora os dois fazem o mesmo: se há histórico
  // (routerLocation.key != 'default'), volta exatamente uma entrada; se abriu o
  // link direto, cai na mesa ativa (se houver) ou no cardápio geral.
  function goBack() {
    if (routerLocation.key !== 'default') {
      navigate(-1);
      return;
    }
    const activeMesa = slug ? getActiveMesaToken(customerToken, slug) : null;
    navigate(activeMesa ? `/${slug}/mesa/${activeMesa}` : `/${slug}`, { replace: true });
  }
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
      onBack={goBack}
      summary={summary}
      reviews={reviews}
      total={total}
      isLoading={isLoading}
      onLoadMore={() => setPage((p) => p + 1)}
    />
  );
}
