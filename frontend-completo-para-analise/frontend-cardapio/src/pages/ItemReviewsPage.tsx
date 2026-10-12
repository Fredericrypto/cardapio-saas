import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchProducts } from '../lib/menu-api';
import { fetchItemReviews, fetchItemReviewsSummary } from '../lib/customer-api';
import type { PublicReview, ReviewSummary } from '../lib/customer-api';
import { useTenant } from '../contexts/TenantContext';
import { ReviewsPageLayout } from '../components/ReviewsShared';

// Página completa de avaliações de UM item — aberta pela nota que
// aparece no header do item (ProductDetailPage). Mesmo layout e mesmos
// cards da página de avaliações do restaurante (ReviewsPageLayout);
// substitui a lista solta "Avaliações desse item" que ficava no pé da
// tela do item.
export function ItemReviewsPage() {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const { tenant } = useTenant();
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

  useEffect(() => {
    if (!tenant || !productId) return;
    setIsLoading(true);
    Promise.all([
      fetchItemReviewsSummary(tenant.id, productId),
      fetchItemReviews(tenant.id, productId, page),
    ])
      .then(([s, r]) => {
        setSummary(s);
        setReviews((prev) => (page === 1 ? r.items : [...prev, ...r.items]));
        setTotal(r.total);
      })
      .catch(() => {
        setSummary(null);
      })
      .finally(() => setIsLoading(false));
  }, [tenant, productId, page]);

  if (!tenant) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
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
    />
  );
}
