import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchProducts } from '../lib/menu-api';
import { fetchItemReviews, fetchItemReviewsSummary } from '../lib/customer-api';
import type { PublicReview, ReviewSummary } from '../lib/customer-api';
import { useTenant } from '../contexts/TenantContext';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import type { RatingFilterValue } from '../components/ReviewFilter';
import { ReviewsPageLayout } from '../components/ReviewsShared';
import { MENU_PAGE_BG } from '../lib/menuTheme';

// Página completa de avaliações de UM item — aberta pela nota que
// aparece no header do item (ProductDetailPage). Mesmo layout e mesmos
// cards da página de avaliações do restaurante (ReviewsPageLayout);
// substitui a lista solta "Avaliações desse item" que ficava no pé da
// tela do item.
export function ItemReviewsPage() {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const { token: customerToken } = useCustomerAuth();
  const [ratingFilter, setRatingFilter] = useState<RatingFilterValue>(0);
  const [productName, setProductName] = useState<string | undefined>();
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!tenant || !productId) return;
    fetchProducts(tenant.id)
      .then((products) => setProductName(products.find((p) => p.id === productId)?.name))
      .catch(() => setProductName(undefined));
  }, [tenant, productId]);

  // Resumo: não depende do filtro nem da página.
  useEffect(() => {
    if (!tenant || !productId) return;
    let cancelled = false;
    fetchItemReviewsSummary(tenant.id, productId)
      .then((s) => {
        if (!cancelled) setSummary(s);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [tenant, productId]);

  useEffect(() => {
    if (!tenant || !productId) return;
    let cancelled = false;
    setIsLoading(true);
    fetchItemReviews(tenant.id, productId, page, { token: customerToken, rating: ratingFilter || undefined })
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
  }, [tenant, productId, page, ratingFilter, customerToken]);

  function handleFilterChange(v: RatingFilterValue) {
    setRatingFilter(v);
    setPage(1);
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
      subtitle={productName}
      onBack={() => navigate(-1)}
      summary={summary}
      reviews={reviews}
      total={total}
      isLoading={isLoading}
      onLoadMore={() => setPage((p) => p + 1)}
      ratingFilter={ratingFilter}
      onRatingFilterChange={handleFilterChange}
    />
  );
}
