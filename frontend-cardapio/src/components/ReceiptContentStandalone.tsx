import type { Tenant } from '../types';
import { ReceiptAuthenticityCode } from './ReceiptAuthenticityCode';
import type { CustomerOrderHistoryItem } from '../lib/customer-api';

const STATUS_LABELS: Record<string, string> = {
  aguardando_pagamento: 'Aguardando Pix',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

// Mesmo estilo do ReceiptContent (cupom de mesa), mas pra um pedido
// avulso (balcão/entrega) — sem sessão, é só o pedido em si. Idêntico ao
// ReceiptContentStandalone do painel do admin.
export function ReceiptContentStandalone({
  tenant,
  order,
}: {
  tenant: Tenant;
  order: CustomerOrderHistoryItem;
}) {
  const label = order.orderType === 'entrega' ? 'Entrega' : 'Balcão';

  return (
    <div className="font-mono text-xs text-gray-800 flex flex-col gap-2 w-full max-w-[280px] mx-auto">
      <div className="text-center flex flex-col gap-0.5">
        <p className="font-bold text-sm">{tenant.name}</p>
      </div>

      <div className="border-t border-dashed border-gray-300 my-1" />

      <p className="text-center">*** SIMPLES CONFERÊNCIA DA CONTA ***</p>
      <p className="text-center">*** NÃO É DOCUMENTO FISCAL ***</p>

      <div className="border-t border-dashed border-gray-300 my-1" />

      <div className="flex justify-between">
        <span>{label}</span>
        <span>{STATUS_LABELS[order.status] ?? order.status}</span>
      </div>
      {order.customerName && (
        <div className="flex justify-between">
          <span>Cliente</span>
          <span>{order.customerName}</span>
        </div>
      )}
      {order.deliveryAddress && (
        <>
          <div className="flex justify-between">
            <span>Endereço</span>
          </div>
          <p className="text-left">{order.deliveryAddress}</p>
          {order.deliveryReferencePoint && (
            <p className="text-left">Ref: {order.deliveryReferencePoint}</p>
          )}
          {order.deliveryAddressPrecise === false && (
            <p className="text-left">⚠ endereço não confirmado com exatidão</p>
          )}
        </>
      )}
      <div className="flex justify-between">
        <span>Pedido em</span>
        <span>
          {new Date(order.createdAt).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>

      <div className="border-t border-dashed border-gray-300 my-1" />

      {order.items.map((item, idx) => (
        <div key={idx} className="flex justify-between">
          <span>
            {item.quantity}x {item.productName}
            {item.selectedOptions && item.selectedOptions.length > 0 && (
              <span className="block text-[10px] text-gray-400">
                {item.selectedOptions.map((o) => o.label).join(', ')}
              </span>
            )}
          </span>
          <span>R$ {Number(item.subtotal).toFixed(2).replace('.', ',')}</span>
        </div>
      ))}

      <div className="border-t border-dashed border-gray-300 my-1" />

      {(order.discountAmount ?? 0) > 0 && (
        <div className="flex justify-between text-red-600">
          <span>
            Desconto aplicado
            {/* `promotionTitlesSnapshot` é a lista de verdade — cobre
                pedidos com mais de um cupom junto (ex: um pro burger +
                outro pra coca-cola). Cai pro singular só em pedidos bem
                antigos, de antes dessa coluna existir. */}
            {(() => {
              const titles = order.promotionTitlesSnapshot?.length
                ? order.promotionTitlesSnapshot
                : order.promotionTitleSnapshot
                  ? [order.promotionTitleSnapshot]
                  : [];
              return titles.length > 0 ? ` (${titles.join(', ')})` : '';
            })()}
            <span className="block text-[10px] text-gray-400">já refletido no total</span>
          </span>
          <span>- R$ {Number(order.discountAmount).toFixed(2).replace('.', ',')}</span>
        </div>
      )}

      {(order.cashbackUsed ?? 0) > 0 && (
        <div className="flex justify-between text-red-600">
          <span>
            Cashback usado
            <span className="block text-[10px] text-gray-400">já refletido no total</span>
          </span>
          <span>- R$ {Number(order.cashbackUsed).toFixed(2).replace('.', ',')}</span>
        </div>
      )}

      {order.tipAmount > 0 && (
        <div className="flex justify-between">
          <span>Gorjeta</span>
          <span>R$ {Number(order.tipAmount).toFixed(2).replace('.', ',')}</span>
        </div>
      )}

      <div className="flex justify-between font-bold text-sm">
        <span>TOTAL</span>
        <span>
          R$ {(Number(order.total) + Number(order.tipAmount)).toFixed(2).replace('.', ',')}
        </span>
      </div>

      {(order.cashbackEarned ?? 0) > 0 && (
        <div className="flex justify-between text-green-600 text-[11px]">
          <span>Cashback recebido nesse pedido</span>
          <span>+ R$ {Number(order.cashbackEarned).toFixed(2).replace('.', ',')}</span>
        </div>
      )}

      {order.status === 'entregue' && order.paymentMethod && (
        <>
          <div className="border-t border-dashed border-gray-300 my-1" />
          <div className="flex justify-between">
            <span>Pagamento</span>
            <span className="capitalize">{order.paymentMethod}</span>
          </div>
          {order.paymentMethod === 'dinheiro' && order.amountReceived != null && (
            <>
              <div className="flex justify-between">
                <span>Recebido</span>
                <span>R$ {Number(order.amountReceived).toFixed(2).replace('.', ',')}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>Troco</span>
                <span>
                  R${' '}
                  {(
                    Number(order.amountReceived) -
                    Number(order.total) -
                    Number(order.tipAmount)
                  )
                    .toFixed(2)
                    .replace('.', ',')}
                </span>
              </div>
            </>
          )}
        </>
      )}

      <div className="border-t border-dashed border-gray-300 my-1" />

      <p className="text-center pt-1">Obrigado pela preferência!</p>
      <p className="text-center">Volte sempre 🙂</p>

      {order.receiptVerificationCode && (
        <>
          <div className="border-t border-dashed border-gray-300 my-1" />
          {/* Código de autenticidade — o estabelecimento consegue
              conferir que esse cupom é genuíno (e que o valor/data não
              foram adulterados) escaneando o QR ou digitando o código
              no painel admin. Ver OrdersService.verifyReceiptCode. */}
          <ReceiptAuthenticityCode code={order.receiptVerificationCode} />
        </>
      )}
    </div>
  );
}
