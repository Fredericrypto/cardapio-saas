import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
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

// Notificação LOCAL (Web Notification API) — não é push de verdade: só
// aparece enquanto essa aba/app tá aberto (em primeiro ou segundo plano),
// nunca com o navegador fechado. Pra isso funcionar com o app fechado de
// verdade (igual notificação nativa do iFood) precisaria de push com
// service worker + VAPID + backend disparando, que é uma peça de infra
// separada — ver aviso no chat. Usa `tag` fixo pra ATUALIZAR a mesma
// notificação (tempo restante) em vez de empilhar uma nova a cada minuto.
function updateLocalNotification(tenant: Tenant, msRemaining: number) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const minutes = Math.floor(msRemaining / 60000);
  const seconds = Math.floor((msRemaining % 60000) / 1000);
  try {
    new Notification(tenant.name, {
      body: `Pedido aguardando pagamento Pix • faltam ${minutes}:${seconds.toString().padStart(2, '0')}`,
      icon: tenant.logoUrl ?? undefined,
      badge: tenant.logoUrl ?? undefined,
      tag: 'pix-countdown',
      silent: true,
    });
  } catch {
    // Alguns navegadores (principalmente mobile) restringem `new
    // Notification()` fora de um service worker — falha silenciosa aqui
    // é intencional, o contador na tela continua funcionando normal.
  }
}

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
  const [copied, setCopied] = useState(false);
  const [msRemaining, setMsRemaining] = useState(() => {
    if (!order.pixExpiresAt) return 0;
    return new Date(order.pixExpiresAt).getTime() - Date.now();
  });
  const settledRef = useRef(false);

  // Pede permissão de notificação uma vez, só quando essa tela abre — não
  // no carregamento do app inteiro, pra não assustar quem só tá olhando
  // o cardápio.
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Contador de 1 em 1 segundo, igual o iFood — e atualiza a notificação
  // local a cada minuto cheio (não toda hora, senão vira spam).
  useEffect(() => {
    if (!order.pixExpiresAt) return;
    const expiresAtMs = new Date(order.pixExpiresAt).getTime();
    let lastNotifiedMinute = -1;

    const interval = setInterval(() => {
      const remaining = expiresAtMs - Date.now();
      setMsRemaining(remaining);

      const currentMinute = Math.floor(remaining / 60000);
      if (currentMinute !== lastNotifiedMinute && remaining > 0) {
        lastNotifiedMinute = currentMinute;
        updateLocalNotification(tenant, remaining);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [order.pixExpiresAt, tenant]);

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
        <p className="text-xs text-gray-400">Tempo</p>
        <p
          className={`font-display text-3xl font-bold tabular-nums ${
            msRemaining < 60000 ? 'text-red-500' : 'text-gray-900'
          }`}
        >
          {formatCountdown(msRemaining)}
        </p>
      </div>

      <QRCodeSVG value={order.pixPayload} size={180} />

      <button
        onClick={handleCopy}
        className="w-full flex items-center justify-center gap-1.5 border border-gray-200 rounded-xl py-2.5 text-sm font-medium text-gray-700"
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
        {copied ? 'Código copiado!' : 'Copiar código Pix'}
      </button>

      <p className="text-xs text-gray-400 text-center">
        Abra o app do seu banco, escaneie o QR ou cole o código, e pague em até{' '}
        {formatCountdown(6 * 60 * 1000)}. O pedido é confirmado assim que{' '}
        {tenant.name} receber o pagamento.
      </p>
    </div>
  );
}
