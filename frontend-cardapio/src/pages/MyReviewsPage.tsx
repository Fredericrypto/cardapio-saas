import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useTenant } from '../contexts/TenantContext';
import { fetchMyReviews } from '../lib/customer-api';
import type { PublicReview, MyItemReview } from '../lib/customer-api';
import { ReviewDisplay } from '../components/ReviewDisplay';
import { ItemReviewDisplay } from '../components/ItemReviewDisplay';

// Pedido explícito do Felipe: separado por categoria — Restaurante e
// Pedido (itens) — cada avaliação mostrando a data e os detalhes do que
// foi avaliado (já embutido nos dois componentes de exibição).
export function MyReviewsPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const [restaurantReview, setRestaurantReview] = useState<PublicReview | null | undefined>(undefined);
  const [itemReviews, setItemReviews] = useState<MyItemReview[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const { customer, token, isLoading } = useCustomerAuth();

  useEffect(() => {
    if (!tenant || !token) return;
    setLoadError(false);
    fetchMyReviews(tenant.id, token)
      .then(({ restaurant, items }) => {
        setRestaurantReview(restaurant);
        setItemReviews(items);
      })
      .catch(() => setLoadError(true));
  }, [tenant, token]);

  if (!tenant || isLoading || !customer) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
      </div>
    );
  }

  const isLoadingReviews = restaurantReview === undefined || itemReviews === null;
  const hasNothing = !isLoadingReviews && !restaurantReview && itemReviews!.length === 0;

  return (
    <div className="min-h-screen bg-gray-50 pb-10 max-w-md mx-auto">
      <div className="flex items-center gap-3 px-4 py-4 bg-white border-b border-gray-100">
        <button onClick={() => navigate(`/${slug}/conta-cliente/perfil`)}>
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-display font-bold text-lg">Minhas Avaliações</h1>
      </div>

      <div className="px-4 mt-4 flex flex-col gap-5">
        {loadError && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="text-sm text-gray-500">Não foi possível carregar suas avaliações.</p>
            <button
              onClick={() => {
                setRestaurantReview(undefined);
                setItemReviews(null);
                setLoadError(false);
                if (tenant && token) {
                  fetchMyReviews(tenant.id, token)
                    .then(({ restaurant, items }) => {
                      setRestaurantReview(restaurant);
                      setItemReviews(items);
                    })
                    .catch(() => setLoadError(true));
                }
              }}
              className="text-sm font-semibold text-gray-900 underline"
            >
              Tentar de novo
            </button>
          </div>
        )}

        {!loadError && isLoadingReviews && (
          <p className="text-sm text-gray-400 text-center py-8">Carregando...</p>
        )}

        {!loadError && hasNothing && (
          <p className="text-sm text-gray-400 text-center py-12 px-4">
            Você ainda não avaliou nada. Depois que um pedido for concluído, você recebe uma
            notificação pra avaliar o restaurante e os itens que pediu.
          </p>
        )}

        {restaurantReview && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">
              Restaurante
            </p>
            <ReviewDisplay
              tenantId={tenant.id}
              token={token!}
              restaurantName={tenant.name}
              review={{
                id: restaurantReview.id,
                orderId: '',
                rating: restaurantReview.rating,
                comment: restaurantReview.comment,
                isAnonymous: restaurantReview.isAnonymous,
                createdAt: restaurantReview.createdAt,
                response: restaurantReview.response,
              }}
              onDeleted={() => setRestaurantReview(null)}
            />
          </div>
        )}

        {itemReviews && itemReviews.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">Pedido</p>
            <div className="flex flex-col gap-2.5">
              {itemReviews.map((review) => (
                <ItemReviewDisplay
                  key={review.id}
                  tenantId={tenant.id}
                  token={token!}
                  review={review}
                  onDeleted={() =>
                    setItemReviews((prev) => (prev ?? []).filter((r) => r.id !== review.id))
                  }
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
