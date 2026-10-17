import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { getActiveMesaToken } from '../lib/seat';
import { fetchPublicReviews, fetchReviewsSummary } from '../lib/customer-api';
import type { PublicReview, ReviewSummary } from '../lib/customer-api';
import { useSelectedLocation } from '../hooks/useSelectedLocation';
import { useTenant } from '../contexts/TenantContext';
import { ReviewsPageLayout } from '../components/ReviewsShared';
import { ReviewsHero } from '../components/ReviewsHero';
import type { RatingFilterValue } from '../components/ReviewFilter';
import { MENU_PAGE_BG } from '../lib/menuTheme';

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
  const [ratingFilter, setRatingFilter] = useState<RatingFilterValue>(0);
  // Sobe quando o cliente publica a avaliação: recarrega resumo + lista na hora, então ela
  // já aparece aqui (e no painel/histórico, que leem a mesma tabela).
  const [reloadTick, setReloadTick] = useState(0);

  // Resumo (nota geral + distribuição): independe do filtro e da página.
  useEffect(() => {
    if (!tenant) return;
    let cancelled = false;
    fetchReviewsSummary(tenant.id, location?.id)
      .then((s) => {
        if (!cancelled) setSummary(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tenant, location?.id, reloadTick]);

  // Lista: filtro por nota feito no servidor (total e "Ver mais" continuam certos).
  useEffect(() => {
    if (!tenant) return;
    let cancelled = false;
    setIsLoading(true);
    fetchPublicReviews(tenant.id, location?.id, page, { token: customerToken, rating: ratingFilter || undefined })
      .then((r) => {
        if (cancelled) return;
        setReviews((prev) => (page === 1 ? r.items : [...prev, ...r.items]));
        setTotal(r.total);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenant, location?.id, page, ratingFilter, customerToken, reloadTick]);

  function handleFilterChange(v: RatingFilterValue) {
    setRatingFilter(v);
    setPage(1);
  }

  function handleReviewPublished() {
    setPage(1);
    setReloadTick((n) => n + 1);
  }

  if (!tenant) {
    return (
      <div className={`flex items-center justify-center h-screen ${MENU_PAGE_BG}`}>
        <div className="w-8 h-8 border-2 border-gray-200 dark:border-white/10 border-t-gray-500 dark:border-t-gray-300 rounded-full animate-spin" />
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
      hero={<ReviewsHero onReviewPublished={handleReviewPublished} />}
      ratingFilter={ratingFilter}
      onRatingFilterChange={handleFilterChange}
    />
  );
}
