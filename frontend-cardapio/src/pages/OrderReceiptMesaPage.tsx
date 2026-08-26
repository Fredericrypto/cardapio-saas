import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download } from 'lucide-react';
import { fetchSessionSummary } from '../lib/menu-api';
import type { SessionSummary } from '../types';
import { ReceiptContent } from '../components/ReceiptContent';
import { ReviewDisplay } from '../components/ReviewDisplay';
import { saveElementAsPng } from '../lib/saveAsPng';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useTenant } from '../contexts/TenantContext';
import { fetchMyReviews } from '../lib/customer-api';
import type { MyReview } from '../lib/customer-api';

// Cupom de uma visita à mesa (sessão) — mesmo endpoint público de resumo
// de sessão já usado em "Minha Conta" no fluxo de QR code, e o mesmo
// componente visual (ReceiptContent) usado no painel do admin. Assim,
// se o cliente e o restaurante precisarem comparar, os dois cupons batem
// exatamente.
export function OrderReceiptMesaPage() {
  const { slug, sessionId } = useParams<{ slug: string; sessionId: string }>();
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenant || !sessionId) return;
    fetchSessionSummary(tenant.id, sessionId)
      .then(setSummary)
      .catch(() => setNotFound(true));
  }, [tenant, sessionId]);

  // Avaliação é por PEDIDO, não por sessão — uma mesa pode ter vários
  // pedidos (às vezes de clientes diferentes, cada um com seu próprio
  // login). O cupom só EXIBE as avaliações já feitas pelo CLIENTE
  // LOGADO nos pedidos dessa sessão — criar uma nova é sempre pelo
  // modal global (ver ReviewPromptProvider), nunca por aqui.
  const { token: customerToken } = useCustomerAuth();
  const [myReviewsByOrderId, setMyReviewsByOrderId] = useState<Map<string, MyReview>>(new Map());

  useEffect(() => {
    if (!tenant || !customerToken) return;
    fetchMyReviews(tenant.id, customerToken).then((myReviews) => {
      setMyReviewsByOrderId(new Map(myReviews.map((r) => [r.orderId, r])));
    });
  }, [tenant, customerToken]);

  const reviewedOrderIds = (summary?.orders ?? [])
    .map((o) => o.id)
    .filter((id) => myReviewsByOrderId.has(id));

  if (!tenant) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
      </div>
    );
  }

  async function handleSave() {
    setIsSaving(true);
    setSaveError(null);
    try {
      await saveElementAsPng('receipt-print-area', `cupom-mesa-${sessionId}`);
    } catch {
      setSaveError('Não foi possível salvar o cupom. Tenta de novo em alguns segundos.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto">
      <div className="flex items-center gap-3 px-4 py-4 bg-white border-b border-gray-100 print:hidden">
        <button onClick={() => navigate(`/${slug}/conta-cliente/pedidos/historico`)}>
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-display font-bold text-lg">
          Cupom — {summary?.session.table?.number ?? 'mesa'}
        </h1>
      </div>

      <div className="px-4 py-6">
        {notFound && (
          <p className="text-sm text-gray-400 text-center py-12">
            Não foi possível carregar esse cupom.
          </p>
        )}

        {!notFound && !summary && (
          <p className="text-sm text-gray-400 text-center py-12">Carregando...</p>
        )}

        {summary && (
          <div id="receipt-print-area" className="bg-white rounded-2xl p-5 border border-gray-100">
            <ReceiptContent tenant={tenant} summary={summary} />
          </div>
        )}

        {summary && reviewedOrderIds.length > 0 && tenant && customerToken && (
          <div className="flex flex-col gap-3 mt-4 print:hidden">
            {reviewedOrderIds.map((orderId) => {
              const review = myReviewsByOrderId.get(orderId);
              if (!review) return null;
              return (
                <ReviewDisplay
                  key={orderId}
                  tenantId={tenant.id}
                  token={customerToken}
                  review={review}
                  onDeleted={() => {
                    setMyReviewsByOrderId((prev) => {
                      const next = new Map(prev);
                      next.delete(orderId);
                      return next;
                    });
                  }}
                />
              );
            })}
          </div>
        )}

        {summary && (
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
