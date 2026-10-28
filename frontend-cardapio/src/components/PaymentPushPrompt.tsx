import { useEffect, useRef } from 'react';
import { Bell, BellOff, Check } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { decidePaymentPushPrompt } from '../lib/paymentPushPrompt';

// Avisos de pagamento (push de verdade, vindo do servidor) na tela do Pix.
// Antes a tela só pedia a permissão do navegador e NUNCA criava a inscrição de push no
// servidor; sem inscrição o backend não tem para onde enviar "Pagamento confirmado".
export function PaymentPushPrompt({ tenantId }: { tenantId: string }) {
  const { t } = useI18n();
  const { token } = useCustomerAuth();
  const { isSupported, permission, isSubscribed, isChecked, isLoading, subscribe } = usePushNotifications(
    tenantId,
    token,
  );
  const syncedRef = useRef(false);

  // Permissão já concedida: (re)registra a inscrição UMA vez ao abrir a tela. Cobre quem nunca
  // se inscreveu e também cura inscrição antiga/inválida (ex.: chave VAPID trocada no servidor),
  // que o navegador ainda considera "ativa" mas o servidor não consegue mais usar.
  useEffect(() => {
    if (!isChecked || syncedRef.current || !token || permission !== 'granted') return;
    syncedRef.current = true;
    subscribe().catch(() => undefined);
  }, [isChecked, permission, token, subscribe]);

  const mode = decidePaymentPushPrompt({ supported: isSupported, hasToken: Boolean(token), permission, isSubscribed });
  if (mode === 'hidden' || mode === 'auto_subscribe') return null;

  if (mode === 'enable') {
    return (
      <button
        type="button"
        disabled={isLoading}
        onClick={() => {
          subscribe().catch(() => undefined);
        }}
        className="w-full flex items-center justify-center gap-1.5 border border-gray-200 rounded-xl py-2.5 text-sm font-medium text-gray-700 disabled:opacity-60"
      >
        <Bell size={15} strokeWidth={1.5} />
        {t('pixWaitingPanel.avisar_pagamento')}
      </button>
    );
  }

  const Icon = mode === 'active' ? Check : BellOff;
  return (
    <p className="flex items-center justify-center gap-1.5 text-xs text-gray-400 text-center">
      <Icon size={14} strokeWidth={1.5} className="shrink-0" />
      {mode === 'active' ? t('pixWaitingPanel.avisos_ativados') : t('pixWaitingPanel.avisos_bloqueados')}
    </p>
  );
}
