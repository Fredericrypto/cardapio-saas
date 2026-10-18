import { useI18n } from '../i18n/I18nContext';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Download } from 'lucide-react';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useTenant } from '../contexts/TenantContext';
import { fetchMyOrderById, fetchMyReviewsByOrderIds, type CustomerOrderHistoryItem, type MyReview } from '../lib/customer-api';
import { ReceiptContentStandalone } from '../components/ReceiptContentStandalone';
import { ReviewDisplay } from '../components/ReviewDisplay';
import { saveElementAsPng } from '../lib/saveAsPng';
import { ProfileSubpageShell } from '../components/ProfileSubpageShell';
import { Tooltip } from '../components/Tooltip';
import { MENU_PAGE_BG, MENU_TEXT_MUTED } from '../lib/menuTheme';
import { PROFILE_BTN_SOLID } from '../lib/profileTheme';

// Cupom de um pedido avulso (balcão/entrega) — sem sessão, é só o pedido
// em si. Usa o mesmo componente visual (ReceiptContentStandalone) usado
// no painel do admin.
export function OrderReceiptAvulsoPage() {
  const { t } = useI18n();
  const { slug, orderId } = useParams<{ slug: string; orderId: string }>();
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
    fetchMyReviewsByOrderIds(tenant.id, token, [orderId]).then((byOrder) => {
      setMyReview(byOrder[orderId] ?? null);
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
      setSaveError(t('orderReceiptAvulsoPage.nao_foi_possivel_salvar'));
    } finally {
      setIsSaving(false);
    }
  }

  if (!tenant || isLoadingAuth) {
    return (
      <div className={`flex items-center justify-center h-screen ${MENU_PAGE_BG}`}>
        <div className="w-8 h-8 border-2 border-gray-200 dark:border-white/10 border-t-gray-500 dark:border-t-gray-300 rounded-full animate-spin" />
      </div>
    );
  }

  const title = `${t('orderReceiptAvulsoPage.cupom')} ${order?.orderType === 'entrega' ? t('receiptContentStandalone.entrega') : t('receiptContentStandalone.balcao')}`;

  return (
    <ProfileSubpageShell tenant={tenant} title={title} backTo={`/${slug}/conta-cliente/pedidos/historico`}>
      <div className="max-w-md mx-auto">
        {notFound && (
          <p className={`text-sm ${MENU_TEXT_MUTED} text-center py-12`}>
            {t('orderReceiptAvulsoPage.nao_foi_possivel_carregar')}
          </p>
        )}

        {!notFound && !order && (
          <p className={`text-sm ${MENU_TEXT_MUTED} text-center py-12`}>{t('common.loading')}</p>
        )}

        {order && (
          // O cupom é um "papel": fica branco nos dois temas de propósito
          // (é o que vira PNG/impressão). Texto escuro explícito para não
          // herdar a cor clara do tema escuro.
          <div id="receipt-print-area" className="w-full max-w-sm mx-auto bg-[#F9FAFB] text-[#1F2937] rounded-lg p-4 border border-[#F3F4F6] [color-scheme:light]">
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
