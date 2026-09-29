import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check } from 'lucide-react';
import type { Tenant, TableSession } from '../types';
import { checkSessionPixStatus } from '../lib/menu-api';

const POLL_INTERVAL_MS = 3000;

function formatCountdown(msRemaining: number): string {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Tela de "aguardando Pix" pro FECHAMENTO DE MESA (28/09) — mesmo
// visual/comportamento do PixWaitingPanel já usado pra pedido avulso
// (contador, QR, copiar código, polling), só que consultando
// checkSessionPixStatus em vez de checkPixStatus. Mantido como
// componente separado (em vez de generalizar o outro) pelo mesmo
// motivo de TablesService.consumeForTableSession: os dois formatos
// (Order vs TableSession) são parecidos mas não iguais, e duplicar aqui
// é mais seguro do que arriscar mexer no fluxo de pedido avulso que já
// está em produção.
export function TableSessionPixWaitingPanel({
  tenant,
  session,
  onConfirmed,
  onFailed,
}: {
  tenant: Tenant;
  session: TableSession;
  onConfirmed: () => void;
  onFailed: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [msRemaining, setMsRemaining] = useState(() => {
    if (!session.pixExpiresAt) return 0;
    return new Date(session.pixExpiresAt).getTime() - Date.now();
  });

  useEffect(() => {
    if (!session.pixExpiresAt) return;
    const expiresAtMs = new Date(session.pixExpiresAt).getTime();
    const interval = setInterval(() => setMsRemaining(expiresAtMs - Date.now()), 1000);
    return () => clearInterval(interval);
  }, [session.pixExpiresAt]);

  // Polling do status — o fechamento de verdade acontece no backend
  // (via este poll OU via webhook do Mercado Pago, o que chegar
  // primeiro; ver TablesService.checkSessionPixStatus). Este componente
  // só reage: some sozinho assim que `onConfirmed`/`onFailed` disparam,
  // porque o `summary.session.status` que o MyAccountPage já está
  // consultando muda de estado.
  useEffect(() => {
    let settled = false;
    const interval = setInterval(async () => {
      if (settled) return;
      try {
        const result = await checkSessionPixStatus(tenant.id, session.id);
        if (result.status === 'fechada' || result.paymentStatus === 'pago') {
          settled = true;
          clearInterval(interval);
          onConfirmed();
        } else if (result.paymentStatus === 'falhou') {
          settled = true;
          clearInterval(interval);
          onFailed();
        }
      } catch {
        // Falha de rede pontual — tenta de novo no próximo tick.
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [tenant.id, session.id, onConfirmed, onFailed]);

  async function handleCopy() {
    if (!session.pixPayload) return;
    await navigator.clipboard.writeText(session.pixPayload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!session.pixPayload) return null;

  return (
    <div className="w-full bg-white rounded-2xl border border-gray-100 p-5 flex flex-col items-center gap-4">
      <p className="text-sm font-semibold text-gray-900">Pagando a conta via Pix</p>

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

      <QRCodeSVG value={session.pixPayload} size={180} />

      <button
        onClick={handleCopy}
        className="w-full flex items-center justify-center gap-1.5 border border-gray-200 rounded-xl py-2.5 text-sm font-medium text-gray-700"
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
        {copied ? 'Código copiado!' : 'Copiar código Pix'}
      </button>

      <p className="text-xs text-gray-400 text-center">
        Abra o app do seu banco, escaneie o QR ou cole o código. Sua conta fecha sozinha
        assim que {tenant.name} receber o pagamento — não precisa recarregar a página.
      </p>
    </div>
  );
}
