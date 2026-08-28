import { useEffect, useRef, useState } from 'react';
import { Printer } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { fetchSessionSummary, closeTableSession, forceResetSession } from '../lib/admin-api';
import { useAuth } from '../contexts/AuthContext';
import { ReceiptContent } from './ReceiptContent';
import { generatePixPayload } from '../lib/pix';
import { CashAmountInput } from './CashAmountInput';
import type { TableSession, SessionSummary } from '../types';

interface CloseSessionModalProps {
  session: TableSession;
  onClose: () => void;
  onClosed: () => void;
}

const PAYMENT_METHODS = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'cartao', label: 'Cartão' },
  { value: 'pix', label: 'Pix' },
];

export function CloseSessionModal({ session, onClose, onClosed }: CloseSessionModalProps) {
  const { tenant } = useAuth();
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('dinheiro');
  // Em CENTAVOS (nunca float) — ver CashAmountInput.
  const [amountReceivedCents, setAmountReceivedCents] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Depois de confirmar o pagamento, trocamos o formulário pelo cupom
  // pronto pra imprimir — assim o dono só aperta "Imprimir" se o cliente
  // pedir a via impressa, sem precisar de outra tela.
  const [closedSummary, setClosedSummary] = useState<SessionSummary | null>(null);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Escape-hatch administrativo (encerrar sem cobrar) — fica escondido
  // atrás de um segundo clique de propósito: primeiro só revela o campo
  // de motivo, nunca executa a ação direto. Motivo é obrigatório e vai
  // pra auditoria (ver TablesService.forceResetSession) — nunca mais um
  // simples confirm() do navegador, que não registra nada.
  const [showForceReset, setShowForceReset] = useState(false);
  const [forceResetReason, setForceResetReason] = useState('');
  const [forceResetError, setForceResetError] = useState<string | null>(null);

  useEffect(() => {
    fetchSessionSummary(session.id).then(setSummary);
    // Mantém o resumo atualizado enquanto o modal está aberto — sem isso,
    // um pedido novo feito nesse meio-tempo ficava invisível pro garçom
    // até ele fechar e reabrir o modal (ver handoff: pedido "some" ao
    // fechar a conta). Para de atualizar assim que o pagamento é confirmado.
    const interval = setInterval(() => {
      fetchSessionSummary(session.id).then(setSummary);
    }, 4000);
    refreshIntervalRef.current = interval;
    return () => clearInterval(interval);
  }, [session.id]);

  // Cálculo em centavos, igual ao backend — evita mostrar um troco
  // "quase certo" que depois diverge do valor que o servidor grava.
  function calculateChangeCents(): number | null {
    if (!summary || paymentMethod !== 'dinheiro') return null;
    const totalCents = Math.round(summary.grandTotal * 100);
    return amountReceivedCents - totalCents;
  }

  async function handleConfirm() {
    if (!summary) return;
    setError(null);

    const totalCents = Math.round(summary.grandTotal * 100);
    if (paymentMethod === 'dinheiro' && amountReceivedCents < totalCents) {
      setError('Valor recebido é menor que o total da conta.');
      return;
    }

    setIsSubmitting(true);
    try {
      await closeTableSession(session.id, {
        paymentMethod,
        amountReceived: paymentMethod === 'dinheiro' ? amountReceivedCents / 100 : undefined,
      });
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
      // Busca de novo já com status "fechada" + dados de pagamento
      // preenchidos, pra montar o cupom final corretamente.
      const finalSummary = await fetchSessionSummary(session.id);
      setClosedSummary(finalSummary);
    } catch (err) {
      setError('Não foi possível fechar a conta. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const changeCents = calculateChangeCents();
  const unfinishedOrdersCount =
    summary?.orders.filter((o) => o.status === 'pendente' || o.status === 'preparando').length ?? 0;

  async function handleForceReset() {
    if (forceResetReason.trim().length < 5) {
      setForceResetError('Descreva o motivo (mínimo 5 caracteres) antes de encerrar sem cobrar.');
      return;
    }
    setForceResetError(null);
    setIsSubmitting(true);
    try {
      await forceResetSession(session.id, forceResetReason.trim());
      onClosed();
    } catch (err) {
      setError('Não foi possível encerrar a mesa.');
    } finally {
      setIsSubmitting(false);
    }
  }

  // Tela final: conta já fechada, mostrando o cupom com opção de imprimir.
  if (closedSummary && tenant) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl p-5 w-full max-w-sm flex flex-col gap-3">
          <p className="font-display font-bold text-gray-900 text-center">
            Conta fechada com sucesso
          </p>

          <div id="receipt-print-area" className="border border-gray-100 rounded-lg p-4 bg-gray-50">
            <ReceiptContent tenant={tenant} summary={closedSummary} />
          </div>

          <div className="flex gap-2 mt-1">
            <button
              onClick={() => window.print()}
              className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 flex items-center justify-center gap-1.5"
            >
              <Printer size={15} />
              Imprimir cupom
            </button>
            <button
              onClick={onClosed}
              className="flex-1 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-semibold"
            >
              Concluir
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm flex flex-col gap-3">
        <p className="font-display font-bold text-gray-900">
          Fechar {session.table?.number ?? 'mesa'}
        </p>

        {!summary ? (
          <p className="text-sm text-gray-400 py-4">Carregando...</p>
        ) : (
          <>
            <div className="flex flex-col gap-1 text-sm">
              <div className="flex justify-between text-gray-500">
                <span>Subtotal</span>
                <span>R$ {summary.total.toFixed(2).replace('.', ',')}</span>
              </div>
              {(() => {
                const cashbackUsedTotal = summary.orders
                  .filter((o) => o.status !== 'cancelado')
                  .reduce((sum, o) => sum + Number(o.cashbackUsed ?? 0), 0);
                return cashbackUsedTotal > 0 ? (
                  <div className="flex justify-between text-red-600">
                    <span>Cashback usado (já refletido no subtotal)</span>
                    <span>- R$ {cashbackUsedTotal.toFixed(2).replace('.', ',')}</span>
                  </div>
                ) : null;
              })()}
              {summary.tipAmount > 0 && (
                <div className="flex justify-between text-gray-500">
                  <span>Gorjeta</span>
                  <span>R$ {summary.tipAmount.toFixed(2).replace('.', ',')}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-gray-900 text-base pt-1 border-t border-gray-100 mt-1">
                <span>Total a cobrar</span>
                <span>R$ {summary.grandTotal.toFixed(2).replace('.', ',')}</span>
              </div>
              <p className="text-[11px] text-gray-400 pt-1">
                O cashback ganho por essa conta é creditado automaticamente na carteira de cada
                cliente assim que a mesa fecha.
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1.5">
                Forma de pagamento
              </label>
              <div className="flex gap-2">
                {PAYMENT_METHODS.map((method) => (
                  <button
                    key={method.value}
                    onClick={() => setPaymentMethod(method.value)}
                    className="flex-1 py-2 rounded-lg text-xs font-semibold border"
                    style={
                      paymentMethod === method.value
                        ? { backgroundColor: '#111827', color: 'white', borderColor: '#111827' }
                        : { borderColor: '#e5e5e5', color: '#666' }
                    }
                  >
                    {method.label}
                  </button>
                ))}
              </div>
            </div>

            {paymentMethod === 'dinheiro' && (
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">
                  Valor recebido
                </label>
                <CashAmountInput
                  valueCents={amountReceivedCents}
                  onChangeCents={setAmountReceivedCents}
                  autoFocus
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
                />
                {changeCents !== null && amountReceivedCents > 0 && (
                  <p
                    className={`text-sm font-semibold mt-1.5 ${
                      changeCents < 0 ? 'text-red-500' : 'text-green-600'
                    }`}
                  >
                    {changeCents < 0
                      ? `Faltam R$ ${(Math.abs(changeCents) / 100).toFixed(2).replace('.', ',')}`
                      : `Troco: R$ ${(changeCents / 100).toFixed(2).replace('.', ',')}`}
                  </p>
                )}
              </div>
            )}

            {paymentMethod === 'pix' && (
              <div>
                {tenant?.pixKey ? (
                  <div className="flex flex-col items-center gap-2 bg-gray-50 rounded-lg p-4">
                    <QRCodeSVG
                      value={generatePixPayload({
                        pixKey: tenant.pixKey,
                        merchantName: tenant.name,
                        merchantCity: tenant.pixMerchantCity || 'BRASIL',
                        amount: summary.grandTotal,
                      })}
                      size={160}
                    />
                    <p className="text-xs text-gray-500 text-center">
                      Cliente escaneia com o app do banco. Confirme o recebimento
                      antes de fechar a conta.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-3">
                    Nenhuma chave Pix cadastrada. Configure em Configurações para
                    gerar o QR code automaticamente.
                  </p>
                )}
              </div>
            )}

            {error && <p className="text-xs text-red-500">{error}</p>}

            {unfinishedOrdersCount > 0 && (
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2.5">
                {unfinishedOrdersCount === 1
                  ? 'Ainda há 1 pedido não finalizado nesta mesa.'
                  : `Ainda há ${unfinishedOrdersCount} pedidos não finalizados nesta mesa.`}{' '}
                Eles já estão somados no total acima e continuam aparecendo em
                "Pedidos ativos" até a cozinha marcar como concluídos.
              </p>
            )}
          </>
        )}

        <div className="flex gap-2 mt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={isSubmitting || !summary}
            className="flex-1 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-semibold disabled:opacity-60"
          >
            {isSubmitting ? 'Fechando...' : 'Confirmar fechamento'}
          </button>
        </div>

        <button
          onClick={() => setShowForceReset(true)}
          disabled={isSubmitting}
          className={`text-xs text-gray-400 underline text-center disabled:opacity-60 ${showForceReset ? 'hidden' : ''}`}
        >
          Encerrar mesa sem cobrar (corrigir sessão)
        </button>

        {showForceReset && (
          <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 flex flex-col gap-2">
            <p className="text-xs text-amber-700 font-semibold">
              Isso encerra a mesa SEM registrar pagamento. Use só pra corrigir uma sessão
              presa ou de teste — os pedidos ficam marcados como cancelados no histórico.
              Motivo e responsável ficam registrados na auditoria.
            </p>
            <textarea
              value={forceResetReason}
              onChange={(e) => setForceResetReason(e.target.value)}
              placeholder="Descreva o motivo (obrigatório)..."
              rows={2}
              className="border border-amber-300 rounded-lg px-2.5 py-2 text-xs outline-none w-full resize-none"
            />
            {forceResetError && <p className="text-xs text-red-500">{forceResetError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowForceReset(false);
                  setForceResetReason('');
                  setForceResetError(null);
                }}
                disabled={isSubmitting}
                className="flex-1 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600"
              >
                Cancelar
              </button>
              <button
                onClick={handleForceReset}
                disabled={isSubmitting}
                className="flex-1 py-2 rounded-lg bg-amber-600 text-white text-xs font-semibold disabled:opacity-60"
              >
                {isSubmitting ? 'Encerrando...' : 'Confirmar encerramento sem cobrança'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
