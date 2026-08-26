import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download } from 'lucide-react';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useTenant } from '../contexts/TenantContext';
import { fetchMyOrderById, fetchMyReviews, type CustomerOrderHistoryItem, type MyReview } from '../lib/customer-api';
import { ReceiptContentStandalone } from '../components/ReceiptContentStandalone';
import { ReviewDisplay } from '../components/ReviewDisplay';
import { saveElementAsPng } from '../lib/saveAsPng';

// Cupom de um pedido avulso (balcão/entrega) — sem sessão, é só o pedido
// em si. Usa o mesmo componente visual (ReceiptContentStandalone) usado
// no painel do admin.
export function OrderReceiptAvulsoPage() {
  const { slug, orderId } = useParams<{ slug: string; orderId: string }>();
  const navigate = useNavigate();
  const { tenant } = useTenant();


  const { token, isLoading: isLoadingAuth } = useCustomerAuth();
  const [order, setOrder] = useState<CustomerOrderHistoryItem | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!tenant || !token || !orderId) return;
    fetchMyOrderById(tenant.id, orderId, token)
      .then(setOrder)
      .catch(() => setNotFound(true));
  }, [tenant, token, orderId]);

  // O cupom só EXIBE a avaliação já feita (se existir) — nunca cria uma
  // nova por aqui. Quem dispara a criação é o modal global (ver
  // ReviewPromptProvider), que aparece assim que o pedido é concluído.
  const [myReview, setMyReview] = useState<MyReview | null | undefined>(undefined);

  useEffect(() => {
    if (!tenant || !token || !orderId) return;
    fetchMyReviews(tenant.id, token).then((reviews) => {
      setMyReview(reviews.find((r) => r.orderId === orderId) ?? null);
    });
  }, [tenant, token, orderId]);

  const [isSaving, setIsSaving] = useState(false);

  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSave() {
    setIsSaving(true);
    setSaveError(null);
    try {
      await saveElementAsPng('receipt-print-area', `cupom-${orderId}`);
    } catch {
      setSaveError('Não foi possível salvar o cupom. Tenta de novo em alguns segundos.');
    } finally {
      setIsSaving(false);
    }
  }

  if (!tenant || isLoadingAuth) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto">
      <div className="flex items-center gap-3 px-4 py-4 bg-white border-b border-gray-100 print:hidden">
        <button onClick={() => navigate(`/${slug}/conta-cliente/pedidos/historico`)}>
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-display font-bold text-lg">
          Cupom — {order?.orderType === 'entrega' ? 'Entrega' : 'Balcão'}
        </h1>
      </div>

      <div className="px-4 py-6">
        {notFound && (
          <p className="text-sm text-gray-400 text-center py-12">
            Não foi possível carregar esse cupom.
          </p>
        )}

        {!notFound && !order && (
          <p className="text-sm text-gray-400 text-center py-12">Carregando...</p>
        )}

        {order && (
          <div id="receipt-print-area" className="bg-white rounded-2xl p-5 border border-gray-100">
            <ReceiptContentStandalone tenant={tenant} order={order} />
          </div>
        )}

        {order && token && myReview && (
          <div className="mt-4 print:hidden">
            <ReviewDisplay
              tenantId={tenant.id}
              token={token}
              review={myReview}
              onDeleted={() => setMyReview(null)}
            />
          </div>
        )}

        {order && (
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full mt-4 py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold flex items-center justify-center gap-1.5 print:hidden disabled:opacity-60"
          >
            <Download size={15} />
            {isSaving ? 'Salvando...' : 'Salvar'}
          </button>
        )}

        {saveError && <p className="text-xs text-red-500 text-center mt-2">{saveError}</p>}
      </div>
    </div>
  );
}
