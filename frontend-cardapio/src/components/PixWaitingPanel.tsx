import { useI18n } from '../i18n/I18nContext';
import { useEffect, useRef, useState } from 'react';
import { QrCodeBox } from './QrCodeBox';
import { PaymentPushPrompt } from './PaymentPushPrompt';
import { Copy, Check } from 'lucide-react';
import type { Tenant, CreatedOrder } from '../types';
import { checkPixStatus } from '../lib/menu-api';

const POLL_INTERVAL_MS = 3000;

function formatCountdown(msRemaining: number): string {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Aviso FORA do app = push de verdade, enviado pelo servidor (ver OrdersService.notifyPaymentPending e
// PaymentPushPrompt, que cria a inscrição de push). A antiga notificação LOCAL com contagem foi removida:
// o navegador suspende a página em segundo plano e ela congelava (ex.: parada em 5:56).
//
// NOTA PARA O APP NATIVO (pedido explícito do Felipe): quando o app nativo estiver pronto, ele quer o
// COUNTDOWN em tempo real no próprio push (como o iFood). Em PWA isso é impossível com o app fechado:
// a notificação web não se atualiza sozinha. Por isso hoje o push traz o horário-limite fixo
// ("Pague até HH:MM") e a contagem regressiva em tempo real fica aqui dentro, na tela do Pix.

export function PixWaitingPanel({
  tenant,
  order,
  onConfirmed,
  onExpired,
  onCancelledByRestaurant,
}: {
  tenant: Tenant;
  order: CreatedOrder;
  onConfirmed: () => void;
  onExpired: () => void;
  onCancelledByRestaurant: () => void;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [msRemaining, setMsRemaining] = useState(() => {
    if (!order.pixExpiresAt) return 0;
    return new Date(order.pixExpiresAt).getTime() - Date.now();
  });
  const settledRef = useRef(false);

  // Contador de 1 em 1 segundo, igual o iFood — dentro do app. Fora do app o aviso é o push do
  // servidor com horário-limite fixo (ver comentário no topo deste arquivo).
  useEffect(() => {
    if (!order.pixExpiresAt) return;
    const expiresAtMs = new Date(order.pixExpiresAt).getTime();
    const interval = setInterval(() => setMsRemaining(expiresAtMs - Date.now()), 1000);
    return () => clearInterval(interval);
  }, [order.pixExpiresAt]);

  // Polling do status — pergunta pro backend a cada poucos segundos se o
  // admin já confirmou (ou cancelou), ou se expirou sozinho lá, caso a
  // aba tenha ficado aberta além do prazo. O backend usa o mesmo status
  // ('cancelado') pros dois casos — cancelamento manual do admin E
  // expiração automática — então a distinção é feita aqui: se o prazo
  // (pixExpiresAt) ainda não tinha passado quando o status virou
  // 'cancelado', só pode ter sido o admin cancelando na mão.
  useEffect(() => {
    const interval = setInterval(async () => {
      if (settledRef.current) return;
      try {
        const result = await checkPixStatus(tenant.id, order.id);
        if (result.status === 'pendente' || result.status === 'confirmado') {
          settledRef.current = true;
          clearInterval(interval);
          onConfirmed();
        } else if (result.status === 'cancelado') {
          settledRef.current = true;
          clearInterval(interval);
          const alreadyExpired =
            !result.pixExpiresAt || new Date(result.pixExpiresAt).getTime() <= Date.now();
          if (alreadyExpired) {
            onExpired();
          } else {
            onCancelledByRestaurant();
          }
        }
      } catch {
        // Falha de rede pontual no polling — tenta de novo no próximo
        // tick, não interrompe a tela por causa disso.
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [tenant.id, order.id, onConfirmed, onExpired, onCancelledByRestaurant]);

  // Expira sozinho na tela também (não só no backend), assim que o
  // contador zera — não precisa esperar o próximo poll pra reagir.
  useEffect(() => {
    if (msRemaining <= 0 && !settledRef.current) {
      settledRef.current = true;
      onExpired();
    }
  }, [msRemaining, onExpired]);

  async function handleCopy() {
    if (!order.pixPayload) return;
    await navigator.clipboard.writeText(order.pixPayload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!order.pixPayload) return null;

  return (
    <div className="w-full bg-white rounded-2xl border border-gray-100 p-5 flex flex-col items-center gap-4">
      <div className="flex items-center gap-2">
        {tenant.logoUrl && (
          <img
            src={tenant.logoUrl}
            alt=""
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
            className="w-6 h-6 rounded-full object-cover"
          />
        )}
        <p className="text-sm font-semibold text-gray-900">{tenant.name}</p>
      </div>

      <div className="text-center">
        <p className="text-xs text-gray-400">{t('pixWaitingPanel.tempo')}</p>
        <p
          className={`font-display text-3xl font-bold tabular-nums ${
            msRemaining < 60000 ? 'text-red-500' : 'text-gray-900'
          }`}
        >
          {formatCountdown(msRemaining)}
        </p>
      </div>

      <QrCodeBox value={order.pixPayload} size={180} />

      <button
        onClick={handleCopy}
        className="w-full flex items-center justify-center gap-1.5 border border-gray-200 rounded-xl py-2.5 text-sm font-medium text-gray-700"
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
        {copied ? t('pixWaitingPanel.codigo_copiado') : t('pixWaitingPanel.copiar_codigo_pix')}
      </button>

      <PaymentPushPrompt tenantId={tenant.id} />

      <p className="text-xs text-gray-400 text-center">
        {t('pixWaitingPanel.abra_o_app_do')}{' '}
        {formatCountdown(6 * 60 * 1000)}. O pedido é confirmado assim que{' '}
        {tenant.name} {t('pixWaitingPanel.receber_o_pagamento')}
      </p>
    </div>
  );
}
