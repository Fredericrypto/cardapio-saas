import { useEffect, useState } from 'react';
import { fetchMyCashbackBalance } from '../lib/customer-api';
import type { RequestClosingPayload } from '../lib/menu-api';

interface ClosingPaymentSheetProps {
  tenantId: string;
  primaryColor: string;
  subtotal: number;
  tipAmount: number;
  customerToken: string | null;
  // Quantos clientes DISTINTOS e logados pediram algo nessa mesa — só
  // pergunta como dividir o cashback ganho quando é mais de 1 (pedido
  // do Felipe, 28/09). Ver MyAccountPage, que conta isso a partir de
  // summary.orders.
  distinctPayingCustomers: number;
  isSubmitting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (payload: RequestClosingPayload) => void;
}

const PAYMENT_METHODS: { value: 'pix' | 'cartao' | 'dinheiro'; label: string }[] = [
  { value: 'pix', label: 'Pix' },
  { value: 'cartao', label: 'Cartão' },
  { value: 'dinheiro', label: 'Dinheiro' },
];

// Folha de pagamento aberta ao tocar em "Solicitar fechamento" (pedido
// do Felipe, 28/09, revisado no mesmo dia pra NUNCA pular direto pra
// "nada a pagar" mesmo quando o cashback cobre tudo — sempre uma
// escolha explícita) — antes disso o cliente só apertava um botão e o
// admin tinha que decidir tudo sozinho, sem nenhum sinal de forma de
// pagamento nem chance de usar cashback. Formata em reais só pra
// exibição; tudo que sai daqui pro backend continua em número puro
// (RequestClosingPayload), que por sua vez SEMPRE recalcula contra o
// saldo ao vivo do cliente (ver TablesService.requestClosing/
// getSessionSummary) — o valor mostrado aqui é só uma prévia.
export function ClosingPaymentSheet({
  tenantId,
  primaryColor,
  subtotal,
  tipAmount,
  customerToken,
  distinctPayingCustomers,
  isSubmitting,
  error,
  onCancel,
  onConfirm,
}: ClosingPaymentSheetProps) {
  const [cashbackBalance, setCashbackBalance] = useState<number | null>(null);
  const [useCashback, setUseCashback] = useState(false);
  // Escolha EXPLÍCITA de "pagar tudo com cashback" quando ele cobre
  // 100% — nunca assumida sozinha, mesmo com useCashback ligado; o
  // cliente ainda pode preferir "usar outra forma" nesse caso.
  const [payFullyWithCashback, setPayFullyWithCashback] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'cartao' | 'dinheiro' | null>(null);
  const [cashDeliveryPreference, setCashDeliveryPreference] = useState<'balcao' | 'mesa' | null>(
    null,
  );
  const [cashbackSplitMode, setCashbackSplitMode] = useState<'pagador' | 'por_pedido' | null>(
    null,
  );

  // Convidado sem login não tem carteira — nem tenta buscar saldo.
  useEffect(() => {
    if (!customerToken) return;
    fetchMyCashbackBalance(tenantId, customerToken)
      .then(setCashbackBalance)
      .catch(() => setCashbackBalance(null));
  }, [tenantId, customerToken]);

  const preTotal = subtotal + tipAmount;
  const cashbackApplied = useCashback && cashbackBalance ? Math.min(cashbackBalance, preTotal) : 0;
  const remaining = Math.max(0, Math.round((preTotal - cashbackApplied) * 100) / 100);
  const cashbackCoversAll = useCashback && cashbackApplied > 0 && remaining === 0;
  const askSplitMode = distinctPayingCustomers > 1;

  const canConfirm = cashbackCoversAll
    ? payFullyWithCashback && (!askSplitMode || cashbackSplitMode !== null)
    : paymentMethod !== null &&
      (paymentMethod !== 'dinheiro' || cashDeliveryPreference !== null) &&
      (!askSplitMode || cashbackSplitMode !== null);

  function handleConfirm() {
    if (!canConfirm) return;
    onConfirm({
      tipAmount,
      paymentMethod: cashbackCoversAll && payFullyWithCashback ? 'cashback' : paymentMethod!,
      useCashback: cashbackCoversAll ? payFullyWithCashback : useCashback,
      cashDeliveryPreference:
        !cashbackCoversAll && paymentMethod === 'dinheiro' ? cashDeliveryPreference! : undefined,
      cashbackSplitMode: askSplitMode ? cashbackSplitMode! : undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center">
      <div className="bg-white w-full max-w-md rounded-t-2xl p-5 flex flex-col gap-4 max-h-[85vh] overflow-y-auto">
        <p className="font-display font-bold text-gray-900 text-center">Fechar minha conta</p>

        <div className="flex flex-col gap-1 text-sm">
          <div className="flex justify-between text-gray-500">
            <span>Subtotal</span>
            <span>R$ {subtotal.toFixed(2).replace('.', ',')}</span>
          </div>
          {tipAmount > 0 && (
            <div className="flex justify-between text-gray-500">
              <span>Gorjeta</span>
              <span>R$ {tipAmount.toFixed(2).replace('.', ',')}</span>
            </div>
          )}
          {cashbackApplied > 0 && (
            <div className="flex justify-between text-red-600">
              <span>Cashback aplicado</span>
              <span>- R$ {cashbackApplied.toFixed(2).replace('.', ',')}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-gray-900 text-base pt-1 border-t border-gray-100 mt-1">
            <span>Total</span>
            <span>R$ {remaining.toFixed(2).replace('.', ',')}</span>
          </div>
        </div>

        {cashbackBalance !== null && cashbackBalance > 0 && (
          <button
            onClick={() => {
              setUseCashback((v) => !v);
              setPayFullyWithCashback(false);
            }}
            className="flex items-center justify-between border border-gray-200 rounded-xl px-3 py-2.5 text-left"
          >
            <span className="text-sm text-gray-700">
              Usar meu cashback
              <span className="block text-xs text-gray-400">
                Saldo disponível: R$ {cashbackBalance.toFixed(2).replace('.', ',')}
              </span>
            </span>
            <span
              className="w-5 h-5 rounded border flex items-center justify-center shrink-0"
              style={
                useCashback
                  ? { backgroundColor: primaryColor, borderColor: primaryColor }
                  : { borderColor: '#d1d5db' }
              }
            >
              {useCashback && <span className="w-2 h-2 rounded-sm bg-white" />}
            </span>
          </button>
        )}

        {useCashback && cashbackApplied > 0 && remaining === 0 ? (
          // Cobre 100% — mas SEMPRE pergunta explicitamente em vez de
          // assumir (pedido do Felipe, 28/09): o cliente pode preferir
          // guardar o cashback e pagar de outro jeito mesmo assim.
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setPayFullyWithCashback(true)}
              className="w-full py-3 rounded-xl text-sm font-semibold border-2 text-left px-4"
              style={
                payFullyWithCashback
                  ? { backgroundColor: '#F0FDF4', borderColor: '#16A34A', color: '#15803D' }
                  : { borderColor: '#e5e5e5', color: '#374151' }
              }
            >
              Pagar com cashback
              <span className="block text-xs font-normal opacity-80">
                Cobre a conta inteira — nada mais a pagar
              </span>
            </button>
            <button
              onClick={() => setPayFullyWithCashback(false)}
              className="w-full py-2.5 rounded-xl text-xs font-semibold border"
              style={
                !payFullyWithCashback
                  ? { backgroundColor: primaryColor, color: 'white', borderColor: primaryColor }
                  : { borderColor: '#e5e5e5', color: '#666' }
              }
            >
              Prefiro pagar de outro jeito
            </button>
          </div>
        ) : (
          <>
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1.5">Como você vai pagar?</p>
              <div className="flex gap-2">
                {PAYMENT_METHODS.map((method) => (
                  <button
                    key={method.value}
                    onClick={() => {
                      setPaymentMethod(method.value);
                      if (method.value !== 'dinheiro') setCashDeliveryPreference(null);
                    }}
                    className="flex-1 py-2.5 rounded-lg text-xs font-semibold border"
                    style={
                      paymentMethod === method.value
                        ? { backgroundColor: primaryColor, color: 'white', borderColor: primaryColor }
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
                <p className="text-xs font-semibold text-gray-500 mb-1.5">
                  Prefere pagar onde?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCashDeliveryPreference('balcao')}
                    className="flex-1 py-2.5 rounded-lg text-xs font-semibold border"
                    style={
                      cashDeliveryPreference === 'balcao'
                        ? { backgroundColor: primaryColor, color: 'white', borderColor: primaryColor }
                        : { borderColor: '#e5e5e5', color: '#666' }
                    }
                  >
                    Vou pagar no balcão
                  </button>
                  <button
                    onClick={() => setCashDeliveryPreference('mesa')}
                    className="flex-1 py-2.5 rounded-lg text-xs font-semibold border"
                    style={
                      cashDeliveryPreference === 'mesa'
                        ? { backgroundColor: primaryColor, color: 'white', borderColor: primaryColor }
                        : { borderColor: '#e5e5e5', color: '#666' }
                    }
                  >
                    Atendente vem à mesa
                  </button>
                </div>
              </div>
            )}

            {paymentMethod === 'pix' && (
              <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2.5">
                Se o restaurante tiver Pix automático configurado, o QR aparece na próxima
                tela e a conta fecha sozinha assim que você pagar. Senão, o garçom leva o
                QR até você.
              </p>
            )}
            {paymentMethod === 'cartao' && (
              <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2.5">
                O garçom vai levar a maquininha até você.
              </p>
            )}
          </>
        )}

        {askSplitMode && (
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1.5">
              Essa mesa teve mais de uma pessoa pedindo. O cashback que essa conta vai gerar
              fica:
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setCashbackSplitMode('por_pedido')}
                className="w-full py-2.5 rounded-xl text-xs text-left px-3 border"
                style={
                  cashbackSplitMode === 'por_pedido'
                    ? { backgroundColor: primaryColor, color: 'white', borderColor: primaryColor }
                    : { borderColor: '#e5e5e5', color: '#374151' }
                }
              >
                Cada pessoa recebe o cashback do que ela mesma pediu
              </button>
              <button
                onClick={() => setCashbackSplitMode('pagador')}
                className="w-full py-2.5 rounded-xl text-xs text-left px-3 border"
                style={
                  cashbackSplitMode === 'pagador'
                    ? { backgroundColor: primaryColor, color: 'white', borderColor: primaryColor }
                    : { borderColor: '#e5e5e5', color: '#374151' }
                }
              >
                Só pra mim, já que estou fechando a conta
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-red-500 text-center">{error}</p>}

        <div className="flex gap-2 mt-1">
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm || isSubmitting}
            className="flex-1 py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-60"
            style={{ backgroundColor: primaryColor }}
          >
            {isSubmitting ? 'Enviando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}
