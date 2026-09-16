import type { Tenant, SessionSummary } from '../types';
import { ReceiptAuthenticityCode } from './ReceiptAuthenticityCode';

// Mesmo layout do cupom usado no painel do admin (ReceiptContent) — de
// propósito idêntico, char por char no essencial, pra que se o cliente e
// o restaurante precisarem comparar recibos, os dois batam exatamente.
export function ReceiptContent({ tenant, summary }: { tenant: Tenant; summary: SessionSummary }) {
  const { session, orders, total, tipAmount, grandTotal, customerName, participants, receiptVerificationCode } = summary;
  const isClosed = session.status === 'fechada';

  const discountTotal = orders
    .filter((o) => o.status !== 'cancelado')
    .reduce((sum, o) => sum + Number(o.discountAmount ?? 0), 0);
  const cashbackUsedTotal = orders
    .filter((o) => o.status !== 'cancelado')
    .reduce((sum, o) => sum + Number(o.cashbackUsed ?? 0), 0);
  const cashbackEarnedTotal = orders
    .filter((o) => o.status !== 'cancelado')
    .reduce((sum, o) => sum + Number(o.cashbackEarned ?? 0), 0);
  // `promotionTitlesSnapshot` cobre pedidos que usaram MAIS DE UM cupom
  // ao mesmo tempo — cai pro singular só em pedidos bem antigos, de
  // antes dessa coluna existir.
  const promotionTitles = Array.from(
    new Set(
      orders
        .filter((o) => o.status !== 'cancelado')
        .flatMap((o) =>
          o.promotionTitlesSnapshot?.length
            ? o.promotionTitlesSnapshot
            : o.promotionTitleSnapshot
              ? [o.promotionTitleSnapshot]
              : [],
        ),
    ),
  );

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
        <span>{session.table?.number ?? 'Mesa'}</span>
        <span>{isClosed ? 'FECHADA' : 'EM ABERTO'}</span>
      </div>
      {/* Pedido do Felipe (14/09, sessão I): mostrar TODO MUNDO que
          esteve na mesa (conta compartilhada), não só um nome único —
          com destaque pra quem abriu. Cai pro `customerName` antigo
          (uma pessoa só) em sessões de antes dessa mudança, que não têm
          `participants` preenchido. */}
      {participants.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          <span>Mesa compartilhada por:</span>
          {participants.map((p, idx) => (
            <div key={idx} className="flex justify-between pl-2">
              <span>{p.name}</span>
              <span className="text-[10px] text-gray-400">{p.isOpener ? 'abriu a mesa' : ''}</span>
            </div>
          ))}
        </div>
      ) : (
        customerName && (
          <div className="flex justify-between">
            <span>Cliente</span>
            <span>{customerName}</span>
          </div>
        )
      )}
      <div className="flex justify-between">
        <span>Aberto em</span>
        <span>
          {new Date(session.openedAt).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
      {isClosed && session.closedAt && (
        <div className="flex justify-between">
          <span>Fechado em</span>
          <span>
            {new Date(session.closedAt).toLocaleString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
      )}

      <div className="border-t border-dashed border-gray-300 my-1" />

      {orders.map((order) => {
        const orderedByName = order.customer?.name ?? order.customerName ?? null;
        const orderCashback = Number(order.cashbackEarned ?? 0);
        return (
          <div key={order.id} className="flex flex-col gap-0.5">
            <p className="text-[10px] text-gray-400 flex justify-between">
              <span>
                {new Date(order.createdAt).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              {/* Pedido do Felipe: de quem foi esse pedido, numa mesa
                  compartilhada — ajuda a conferir a conta e a bater com
                  o cashback individual logo abaixo. */}
              {participants.length > 1 && orderedByName && <span>{orderedByName}</span>}
            </p>
            {(order.items ?? []).map((item, idx) => (
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
            {orderCashback > 0 && (
              <p className="text-[10px] text-green-600 text-right">
                + R$ {orderCashback.toFixed(2).replace('.', ',')} de cashback
                {orderedByName ? ` pra ${orderedByName}` : ''}
              </p>
            )}
          </div>
        );
      })}

      <div className="border-t border-dashed border-gray-300 my-1" />

      <div className="flex justify-between">
        <span>Subtotal</span>
        <span>R$ {total.toFixed(2).replace('.', ',')}</span>
      </div>
      {discountTotal > 0 && (
        <div className="flex justify-between text-red-600">
          <span>
            Desconto aplicado{promotionTitles.length > 0 ? ` (${promotionTitles.join(', ')})` : ''}
            <span className="block text-[10px] text-gray-400">já refletido no subtotal</span>
          </span>
          <span>- R$ {discountTotal.toFixed(2).replace('.', ',')}</span>
        </div>
      )}
      {cashbackUsedTotal > 0 && (
        <div className="flex justify-between text-red-600">
          <span>Cashback usado</span>
          <span>- R$ {cashbackUsedTotal.toFixed(2).replace('.', ',')}</span>
        </div>
      )}
      {tipAmount > 0 && (
        <div className="flex justify-between">
          <span>Gorjeta</span>
          <span>R$ {tipAmount.toFixed(2).replace('.', ',')}</span>
        </div>
      )}
      <div className="flex justify-between font-bold text-sm">
        <span>TOTAL</span>
        <span>R$ {grandTotal.toFixed(2).replace('.', ',')}</span>
      </div>
      {cashbackEarnedTotal > 0 && (
        <div className="flex justify-between text-green-600 text-[11px]">
          <span>Cashback recebido nesse pedido</span>
          <span>+ R$ {cashbackEarnedTotal.toFixed(2).replace('.', ',')}</span>
        </div>
      )}

      {isClosed && session.paymentMethod && (
        <>
          <div className="border-t border-dashed border-gray-300 my-1" />
          <div className="flex justify-between">
            <span>Pagamento</span>
            <span className="capitalize">{session.paymentMethod}</span>
          </div>
          {session.paymentMethod === 'dinheiro' && session.amountReceived != null && (
            <>
              <div className="flex justify-between">
                <span>Recebido</span>
                <span>R$ {Number(session.amountReceived).toFixed(2).replace('.', ',')}</span>
              </div>
              <div className="flex justify-between">
                <span>Troco</span>
                <span>R$ {Number(session.changeGiven ?? 0).toFixed(2).replace('.', ',')}</span>
              </div>
            </>
          )}
        </>
      )}

      <div className="border-t border-dashed border-gray-300 my-1" />

      <p className="text-center pt-1">Obrigado pela preferência!</p>
      <p className="text-center">Volte sempre 🙂</p>

      {receiptVerificationCode && (
        <>
          <div className="border-t border-dashed border-gray-300 my-1" />
          {/* Só existe depois que a mesa fecha de verdade — ver
              TablesService.getSessionSummary. Mesmo princípio do cupom
              avulso: confere autenticidade sem depender de esconder o
              código, já que a verificação sempre recalcula a partir dos
              dados reais no banco. */}
          <ReceiptAuthenticityCode code={receiptVerificationCode} />
        </>
      )}
    </div>
  );
}
