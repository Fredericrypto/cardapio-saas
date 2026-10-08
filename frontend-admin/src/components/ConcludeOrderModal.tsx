import { useState } from 'react';
import { Coins } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { concludeOrderWithPayment } from '../lib/admin-api';
import { useAuth } from '../contexts/AuthContext';
import { generatePixPayload } from '../lib/pix';
import { CashAmountInput } from './CashAmountInput';
import type { Order } from '../types';

interface ConcludeOrderModalProps {
  order: Order;
  onClose: () => void;
  onConcluded: () => void;
}

const PAYMENT_METHODS = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'cartao', label: 'Cartão' },
  { value: 'pix', label: 'Pix' },
];

// Pedido avulso (Balcão/Entrega) não tem uma etapa de "fechar conta"
// separada como as mesas têm — "concluir" é o único momento em que dá
// pra registrar como foi pago. Espelha o CloseSessionModal (mesma
// escolha de forma de pagamento, mesmo cálculo de troco em centavos),
// só que sem o resumo de sessão, já que aqui o total já é conhecido de
// cara (é só o próprio pedido).
export function ConcludeOrderModal({ order, onClose, onConcluded }: ConcludeOrderModalProps) {
  const { tenant } = useAuth();
  // Pré-seleciona a forma que o CLIENTE escolheu no carrinho, se ele
  // escolheu uma — o admin só confirma (ou troca, se o cliente mudou de
  // ideia na hora da entrega).
  const [paymentMethod, setPaymentMethod] = useState(order.paymentMethod ?? 'dinheiro');
  // Em CENTAVOS (nunca float) — ver CashAmountInput.
  const [amountReceivedCents, setAmountReceivedCents] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Preenchido com a resposta REAL do backend depois de confirmar — nunca
  // uma estimativa calculada aqui na tela, porque o valor certo depende
  // de regras que só o servidor conhece (teto diário do cliente, se já
  // bateu o mínimo, etc).
  const [concludedOrder, setConcludedOrder] = useState<Order | null>(null);

  const tip = Number(order.tipAmount ?? 0);
  const total = Number(order.total) + tip;
  const totalCents = Math.round(total * 100);

  function calculateChangeCents(): number | null {
    if (paymentMethod !== 'dinheiro') return null;
    return amountReceivedCents - totalCents;
  }

  async function handleConfirm() {
    setError(null);

    if (paymentMethod === 'dinheiro' && amountReceivedCents < totalCents) {
      setError('Valor recebido é menor que o total do pedido.');
      return;
    }

    setIsSubmitting(true);
    try {
      const updated = await concludeOrderWithPayment(
        order.id,
        paymentMethod,
        paymentMethod === 'dinheiro' ? amountReceivedCents / 100 : undefined,
      );
      // Só fecha na hora se não gerou cashback nenhum — senão mostra o
      // valor certo pro estabelecimento antes de sumir da tela.
      if ((updated.cashbackEarned ?? 0) > 0) {
        setConcludedOrder(updated);
      } else {
        onConcluded();
      }
    } catch {
      setError('Não foi possível concluir o pedido. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const changeCents = calculateChangeCents();
  const label = order.tableNumber ?? (order.orderType === 'entrega' ? 'Entrega' : 'Balcão');

  if (concludedOrder) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl p-5 w-full max-w-sm flex flex-col gap-3 items-center text-center">
          <div className="w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
            <Coins size={22} />
          </div>
          <p className="font-display font-bold text-gray-900">Pagamento confirmado!</p>
          <p className="text-sm text-gray-500">
            Esse pedido deu{' '}
            <span className="font-semibold text-green-600">
              R$ {Number(concludedOrder.cashbackEarned).toFixed(2).replace('.', ',')}
            </span>{' '}
            de cashback pro cliente.
          </p>
          <button
            onClick={onConcluded}
            className="w-full py-2.5 rounded-lg bg-gray-900 text-white text-sm font-semibold mt-1"
          >
            Ok, fechar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm flex flex-col gap-3">
        <p className="font-display font-bold text-gray-900">Concluir pedido — {label}</p>

        <div className="pb-2 border-b border-gray-100">
          {tip > 0 && (
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Pedido + gorjeta</span>
              <span>
                R$ {Number(order.total).toFixed(2).replace('.', ',')} + R${' '}
                {tip.toFixed(2).replace('.', ',')}
              </span>
            </div>
          )}
          <div className="flex justify-between font-bold text-gray-900 text-base">
            <span>Total a cobrar</span>
            <span>R$ {total.toFixed(2).replace('.', ',')}</span>
          </div>
          {(order.cashbackUsed ?? 0) > 0 && (
            <p className="text-[11px] text-amber-600 mt-1">
              Já inclui R$ {Number(order.cashbackUsed).toFixed(2).replace('.', ',')} pagos com
              cashback pelo cliente.
            </p>
          )}
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
                    amount: total,
                  })}
                  size={160}
                />
                <p className="text-xs text-gray-500 text-center">
                  Cliente escaneia com o app do banco. Confirme o recebimento
                  antes de concluir.
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

        <div className="flex gap-2 mt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="flex-1 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-semibold disabled:opacity-60"
          >
            {isSubmitting ? 'Concluindo...' : 'Confirmar pagamento'}
          </button>
        </div>
      </div>
    </div>
  );
}
