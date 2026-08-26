import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useTenant } from '../contexts/TenantContext';
import { fetchMyReviews } from '../lib/customer-api';
import type { MyReview } from '../lib/customer-api';
import { ReviewDisplay } from '../components/ReviewDisplay';

export function MyReviewsPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const [reviews, setReviews] = useState<MyReview[] | null>(null);


  const { customer, token, isLoading } = useCustomerAuth();

  useEffect(() => {
    if (!tenant || !token) return;
    fetchMyReviews(tenant.id, token).then(setReviews);
  }, [tenant, token]);

  if (!tenant || isLoading || !customer) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-10 max-w-md mx-auto">
      <div className="flex items-center gap-3 px-4 py-4 bg-white border-b border-gray-100">
        <button onClick={() => navigate(`/${slug}/conta-cliente/perfil`)}>
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-display font-bold text-lg">Minhas Avaliações</h1>
      </div>

      <div className="px-4 mt-4 flex flex-col gap-3">
        {reviews == null && <p className="text-sm text-gray-400 text-center py-8">Carregando...</p>}

        {reviews != null && reviews.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-12 px-4">
            Você ainda não avaliou nenhum pedido. Depois que um pedido for concluído, você recebe
            uma notificação pra avaliar.
          </p>
        )}

        {(reviews ?? []).map((review) => (
          <ReviewDisplay
            key={review.id}
            tenantId={tenant.id}
            token={token!}
            review={review}
            onDeleted={() => setReviews((prev) => (prev ?? []).filter((r) => r.id !== review.id))}
          />
        ))}
      </div>
    </div>
  );
}
