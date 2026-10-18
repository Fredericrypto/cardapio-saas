import { useI18n } from '../i18n/I18nContext';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Download } from 'lucide-react';
import { fetchSessionSummary } from '../lib/menu-api';
import type { SessionSummary } from '../types';
import { ReceiptContent } from '../components/ReceiptContent';
import { ReviewDisplay } from '../components/ReviewDisplay';
import { saveElementAsPng } from '../lib/saveAsPng';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useTenant } from '../contexts/TenantContext';
import { fetchMyReviewsByOrderIds } from '../lib/customer-api';
import type { MyReview } from '../lib/customer-api';
import { ProfileSubpageShell } from '../components/ProfileSubpageShell';
import { Tooltip } from '../components/Tooltip';
import { MENU_PAGE_BG, MENU_TEXT_MUTED } from '../lib/menuTheme';
import { PROFILE_BTN_SOLID } from '../lib/profileTheme';

// Cupom de uma visita à mesa (sessão) — mesmo endpoint público de resumo
// de sessão já usado em "Minha Conta" no fluxo de QR code, e o mesmo
// componente visual (ReceiptContent) usado no painel do admin. Assim,
// se o cliente e o restaurante precisarem comparar, os dois cupons batem
// exatamente.
export function OrderReceiptMesaPage() {
  const { t } = useI18n();
  const { slug, sessionId } = useParams<{ slug: string; sessionId: string }>();
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
    if (!tenant || !customerToken || !summary) return;
    const orderIds = summary.orders.map((o) => o.id);
    fetchMyReviewsByOrderIds(tenant.id, customerToken, orderIds).then((byOrder) => {
      setMyReviewsByOrderId(new Map(Object.entries(byOrder)));
    });
  }, [tenant, customerToken, summary]);

  const reviewedOrderIds = (summary?.orders ?? [])
    .map((o) => o.id)
    .filter((id) => myReviewsByOrderId.has(id));

  if (!tenant) {
    return (
      <div className={`flex items-center justify-center h-screen ${MENU_PAGE_BG}`}>
        <div className="w-8 h-8 border-2 border-gray-200 dark:border-white/10 border-t-gray-500 dark:border-t-gray-300 rounded-full animate-spin" />
      </div>
    );
  }

  async function handleSave() {
    setIsSaving(true);
    setSaveError(null);
    try {
      await saveElementAsPng('receipt-print-area', `cupom-mesa-${sessionId}`);
    } catch {
      setSaveError(t('orderReceiptAvulsoPage.nao_foi_possivel_salvar'));
    } finally {
      setIsSaving(false);
    }
  }

  const title = `${t('orderReceiptAvulsoPage.cupom')} ${summary?.session.table?.number ?? 'mesa'}`;

  return (
    <ProfileSubpageShell tenant={tenant} title={title} backTo={`/${slug}/conta-cliente/pedidos/historico`}>
      <div className="max-w-md mx-auto">
        {notFound && (
          <p className={`text-sm ${MENU_TEXT_MUTED} text-center py-12`}>
            {t('orderReceiptAvulsoPage.nao_foi_possivel_carregar')}
          </p>
        )}

        {!notFound && !summary && (
          <p className={`text-sm ${MENU_TEXT_MUTED} text-center py-12`}>{t('common.loading')}</p>
        )}

        {summary && (
          // O cupom é um "papel": fica branco nos dois temas de propósito
          // (é o que vira PNG/impressão). Texto escuro explícito para não
          // herdar a cor clara do tema escuro.
          <div id="receipt-print-area" className="w-full max-w-sm mx-auto bg-[#F9FAFB] text-[#1F2937] rounded-lg p-4 border border-[#F3F4F6] [color-scheme:light]">
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
          <Tooltip label={t('editProfilePage.salvar')} className="flex w-full">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className={`w-full mt-4 py-3 rounded-xl text-sm flex items-center justify-center gap-1.5 print:hidden ${PROFILE_BTN_SOLID}`}
            >
              <Download size={15} strokeWidth={1.5} />
              {isSaving ? 'Salvando...' : t('editProfilePage.salvar')}
            </button>
          </Tooltip>
        )}

        {saveError && <p className="text-xs text-red-500 dark:text-red-400 text-center mt-2">{saveError}</p>}
      </div>
    </ProfileSubpageShell>
  );
}
