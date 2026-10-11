import { orderStatusLabel } from '../i18n/labels';
import { activeDateLocale } from '../i18n/languages';
import { useI18n } from '../i18n/I18nContext';
import type { Tenant } from '../types';
import { ReceiptAuthenticityCode } from './ReceiptAuthenticityCode';
import type { CustomerOrderHistoryItem } from '../lib/customer-api';

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
  const { t } = useI18n();
  const label = order.orderType === 'entrega' ? t('receiptContentStandalone.entrega') : t('receiptContentStandalone.balcao');

  return (
    <div className="font-mono text-xs text-gray-800 flex flex-col gap-2 w-full max-w-[280px] mx-auto">
      <div className="text-center flex flex-col gap-0.5">
        <p className="font-bold text-sm">{tenant.name}</p>
      </div>

      <div className="border-t border-dashed border-gray-300 my-1" />

      <p className="text-center">{t('receiptContent.simples_conferencia_da_conta')}</p>
      <p className="text-center">{t('receiptContent.nao_e_documento_fiscal')}</p>

      <div className="border-t border-dashed border-gray-300 my-1" />

      <div className="flex justify-between">
        <span>{label}</span>
        <span>{orderStatusLabel(order.status, t)}</span>
      </div>
      {order.customerName && (
        <div className="flex justify-between">
          <span>{t('receiptContent.cliente')}</span>
          <span>{order.customerName}</span>
        </div>
      )}
      {order.deliveryAddress && (
        <>
          <div className="flex justify-between">
            <span>{t('receiptContentStandalone.endereco')}</span>
          </div>
          <p className="text-left">{order.deliveryAddress}</p>
          {order.deliveryReferencePoint && (
            <p className="text-left">{t('receiptContentStandalone.ref')} {order.deliveryReferencePoint}</p>
          )}
          {order.deliveryAddressPrecise === false && (
            <p className="text-left">{t('receiptContentStandalone.endereco_nao_confirmado_com')}</p>
          )}
        </>
      )}
      <div className="flex justify-between">
        <span>{t('receiptContentStandalone.pedido_em')}</span>
        <span>
          {new Date(order.createdAt).toLocaleString(activeDateLocale(), {
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
            {t('receiptContent.desconto_aplicado')}
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
            <span className="block text-[10px] text-gray-400">{t('receiptContentStandalone.ja_refletido_no_total')}</span>
          </span>
          <span>- R$ {Number(order.discountAmount).toFixed(2).replace('.', ',')}</span>
        </div>
      )}

      {(order.cashbackUsed ?? 0) > 0 && (
        <div className="flex justify-between text-red-600">
          <span>
            {t('receiptContent.cashback_usado')}
            <span className="block text-[10px] text-gray-400">{t('receiptContentStandalone.ja_refletido_no_total')}</span>
          </span>
          <span>- R$ {Number(order.cashbackUsed).toFixed(2).replace('.', ',')}</span>
        </div>
      )}

      {order.tipAmount > 0 && (
        <div className="flex justify-between">
          <span>{t('closingPaymentSheet.gorjeta')}</span>
          <span>R$ {Number(order.tipAmount).toFixed(2).replace('.', ',')}</span>
        </div>
      )}

      <div className="flex justify-between font-bold text-sm">
        <span>{t('receiptContent.total')}</span>
        <span>
          R$ {(Number(order.total) + Number(order.tipAmount)).toFixed(2).replace('.', ',')}
        </span>
      </div>

      {(order.cashbackEarned ?? 0) > 0 && (
        <div className="flex justify-between text-green-600 text-[11px]">
          <span>{t('receiptContent.cashback_recebido_nesse_pedido')}</span>
          <span>+ R$ {Number(order.cashbackEarned).toFixed(2).replace('.', ',')}</span>
        </div>
      )}

      {order.status === 'entregue' && order.paymentMethod && (
        <>
          <div className="border-t border-dashed border-gray-300 my-1" />
          <div className="flex justify-between">
            <span>{t('receiptContent.pagamento')}</span>
            <span className="capitalize">{order.paymentMethod}</span>
          </div>
          {order.paymentMethod === 'dinheiro' && order.amountReceived != null && (
            <>
              <div className="flex justify-between">
                <span>{t('receiptContent.recebido')}</span>
                <span>R$ {Number(order.amountReceived).toFixed(2).replace('.', ',')}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>{t('receiptContent.troco')}</span>
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

      <p className="text-center pt-1">{t('receiptContent.obrigado_pela_preferencia')}</p>
      <p className="text-center">{t('receiptContent.volte_sempre')}</p>

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
