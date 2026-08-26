import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Bell } from 'lucide-react';
import { fetchSessionSummary, requestSessionClosing } from '../lib/menu-api';
import type { SessionSummary } from '../types';
import { useTableSession } from '../hooks/useTableSession';
import { useTenant } from '../contexts/TenantContext';

const STATUS_LABELS: Record<string, string> = {
  aguardando_pagamento: 'Aguardando Pix',
  pendente: 'Pendente',
  confirmado: 'Confirmado',
  preparando: 'Preparando',
  pronto: 'Pronto',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

export function MyAccountPage() {
  const { qrCodeToken } = useParams<{ slug: string; qrCodeToken: string }>();
  const navigate = useNavigate();
  const { session } = useTableSession(qrCodeToken);
  const { tenant } = useTenant();

  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRequesting, setIsRequesting] = useState(false);
  const [closingRequested, setClosingRequested] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [tipPercent, setTipPercent] = useState<number | 'custom' | null>(null);
  const [customTip, setCustomTip] = useState('');
  const [statusNotification, setStatusNotification] = useState<string | null>(null);

  // Guarda o último status conhecido de cada pedido pra detectar mudanças
  // entre uma atualização (poll) e outra, e avisar o cliente na tela.
  const previousStatusesRef = useRef<Record<string, string> | null>(null);

  function detectStatusChanges(newSummary: SessionSummary) {
    const previous = previousStatusesRef.current;
    const current: Record<string, string> = {};
    newSummary.orders.forEach((order) => {
      current[order.id] = order.status;
    });

    // Só compara a partir da segunda atualização — na primeira carga não
    // existe "mudança" de verdade, é só o estado inicial.
    if (previous) {
      for (const order of newSummary.orders) {
        const before = previous[order.id];
        if (before && before !== order.status) {
          const label = STATUS_LABELS[order.status] ?? order.status;
          setStatusNotification(`Seu pedido agora está: ${label}`);
          setTimeout(() => setStatusNotification(null), 5000);
          break; // mostra uma notificação por vez, mesmo se vários mudarem juntos
        }
      }
    }
    previousStatusesRef.current = current;
  }

  useEffect(() => {
    if (!tenant || !session) return;
    const tenantId = tenant.id;

    async function load() {
      const summaryData = await fetchSessionSummary(tenantId, session!.id);
      setSummary(summaryData);
      setClosingRequested(summaryData.session.status === 'fechamento_solicitado');
      detectStatusChanges(summaryData);
      setIsLoading(false);
    }

    load();

    // Atualiza a cada poucos segundos — assim o cliente vê em tempo real
    // quando o garçom avança o status do pedido, ou quando a conta é
    // efetivamente fechada (pagamento confirmado), sem precisar recarregar
    // a página manualmente.
    const interval = setInterval(async () => {
      const summaryData = await fetchSessionSummary(tenantId, session!.id);
      setSummary(summaryData);
      setClosingRequested(summaryData.session.status === 'fechamento_solicitado');
      detectStatusChanges(summaryData);
    }, 4000);

    return () => clearInterval(interval);
  }, [tenant, session]);

  function calculateTipAmount(): number {
    if (!summary) return 0;
    if (tipPercent === 'custom') {
      const value = Number(customTip.replace(',', '.'));
      return isNaN(value) || value < 0 ? 0 : Math.round(value * 100) / 100;
    }
    if (typeof tipPercent === 'number') {
      const totalCents = Math.round(summary.total * 100);
      const tipCents = Math.round((totalCents * tipPercent) / 100);
      return tipCents / 100;
    }
    return 0;
  }

  async function handleRequestClosing() {
    if (!tenant || !session) return;
    setIsRequesting(true);
    setRequestError(null);
    try {
      await requestSessionClosing(tenant.id, session.id, calculateTipAmount());
      setClosingRequested(true);
    } catch (err) {
      setRequestError('Não foi possível solicitar o fechamento. Tente novamente ou chame um garçom.');
    } finally {
      setIsRequesting(false);
    }
  }

  if (isLoading || !tenant || !summary) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (summary.session.status === 'fechada') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center max-w-md mx-auto">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl mb-4"
          style={{ backgroundColor: tenant.primaryColor }}
        >
          ✓
        </div>
        <h1 className="font-display text-xl font-bold text-gray-900">
          Conta fechada
        </h1>
        <p className="text-sm text-gray-500 mt-2">
          Obrigado pela visita! Sua conta já foi paga e encerrada.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white max-w-md mx-auto pb-32">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100">
        <button onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-display font-bold text-lg">Minha conta</h1>
      </div>

      {statusNotification && (
        <div
          className="mx-4 mt-3 rounded-lg px-4 py-2.5 text-sm font-medium text-white flex items-center gap-2"
          style={{ backgroundColor: tenant.secondaryColor }}
        >
          <Bell size={15} />
          {statusNotification}
        </div>
      )}

      {summary.orders.length === 0 ? (
        <p className="text-center text-gray-400 text-sm py-12">
          Você ainda não fez nenhum pedido nessa mesa.
        </p>
      ) : (
        <div className="p-4 flex flex-col gap-4">
          {summary.orders.map((order) => (
            <div key={order.id} className="border border-gray-100 rounded-xl p-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-semibold text-gray-400">
                  {new Date(order.createdAt).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: `${tenant.primaryColor}1A`,
                    color: tenant.primaryColor,
                  }}
                >
                  {STATUS_LABELS[order.status] ?? order.status}
                </span>
              </div>

              {order.items.map((item, idx) => (
                <div key={idx} className="flex justify-between text-sm py-0.5">
                  <span className="text-gray-700">
                    {item.quantity}x {item.productName}
                  </span>
                  <span className="text-gray-500">
                    R$ {Number(item.subtotal).toFixed(2).replace('.', ',')}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-4 bg-white border-t border-gray-100 flex flex-col gap-3">
        {!closingRequested && summary.orders.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1.5">
              Gorjeta (opcional)
            </p>
            <div className="flex gap-2">
              {[0, 10, 15].map((percent) => (
                <button
                  key={percent}
                  onClick={() => setTipPercent(percent === 0 ? null : percent)}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold border"
                  style={
                    (percent === 0 && tipPercent === null) || tipPercent === percent
                      ? {
                          backgroundColor: tenant.primaryColor,
                          color: 'white',
                          borderColor: tenant.primaryColor,
                        }
                      : { borderColor: '#e5e5e5', color: '#666' }
                  }
                >
                  {percent === 0 ? 'Sem gorjeta' : `${percent}%`}
                </button>
              ))}
              <button
                onClick={() => setTipPercent('custom')}
                className="flex-1 py-2 rounded-lg text-xs font-semibold border"
                style={
                  tipPercent === 'custom'
                    ? {
                        backgroundColor: tenant.primaryColor,
                        color: 'white',
                        borderColor: tenant.primaryColor,
                      }
                    : { borderColor: '#e5e5e5', color: '#666' }
                }
              >
                Outro
              </button>
            </div>
            {tipPercent === 'custom' && (
              <input
                type="number"
                step="0.01"
                value={customTip}
                onChange={(e) => setCustomTip(e.target.value)}
                placeholder="Valor da gorjeta (R$)"
                className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
              />
            )}
          </div>
        )}

        <div className="flex justify-between items-center text-sm text-gray-500">
          <span>Subtotal</span>
          <span>R$ {summary.total.toFixed(2).replace('.', ',')}</span>
        </div>

        {/* Depois de solicitado o fechamento, usa o valor de gorjeta já
            confirmado pelo backend (summary.tipAmount) em vez do cálculo
            local — que reseta ao recarregar a página e fazia a linha
            "Gorjeta" sumir mesmo com gorjeta aplicada. */}
        {(closingRequested ? summary.tipAmount : calculateTipAmount()) > 0 && (
          <div className="flex justify-between items-center text-sm text-gray-500">
            <span>Gorjeta</span>
            <span>
              R${' '}
              {(closingRequested ? summary.tipAmount : calculateTipAmount())
                .toFixed(2)
                .replace('.', ',')}
            </span>
          </div>
        )}

        <div className="flex justify-between items-center">
          <span className="text-sm font-semibold text-gray-500">Total</span>
          <span className="text-lg font-bold" style={{ color: tenant.primaryColor }}>
            R${' '}
            {closingRequested
              ? summary.grandTotal.toFixed(2).replace('.', ',')
              : (summary.total + calculateTipAmount()).toFixed(2).replace('.', ',')}
          </span>
        </div>

        {requestError && (
          <p className="text-xs text-red-500 text-center">{requestError}</p>
        )}

        {closingRequested ? (
          <div className="flex items-center justify-center gap-2 py-3 text-sm font-semibold text-gray-500">
            <CheckCircle2 size={16} />
            Fechamento solicitado — aguarde o garçom
          </div>
        ) : (
          <button
            onClick={handleRequestClosing}
            disabled={isRequesting || summary.orders.length === 0}
            className="w-full py-3.5 rounded-xl text-white font-semibold disabled:opacity-60"
            style={{ backgroundColor: tenant.primaryColor }}
          >
            {isRequesting ? 'Enviando...' : 'Solicitar fechamento da conta'}
          </button>
        )}
      </div>
    </div>
  );
}
