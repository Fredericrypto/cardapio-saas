import type { ReactNode } from 'react';
import { Check, MapPin, X } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { paymentMethodLabel } from '../../i18n/labels';
import { activeDateLocale } from '../../i18n/languages';
import { useAccentColor } from '../../hooks/useAccentColor';
import { formatBRL } from '../../lib/cartFormat';
import {
  CART_OUTLINE_BUTTON,
  CART_RULE,
  CART_TEXT,
  CART_TEXT_BODY,
  CART_TEXT_ERROR,
  CART_TEXT_MUTED,
  CART_TEXT_SOFT,
  CART_TITLE,
} from '../../lib/cartTheme';
import { MENU_DIVIDER, MENU_SURFACE } from '../../lib/menuTheme';
import type { CreatedOrder, Tenant } from '../../types';
import type { OrderSnapshot } from './orderSnapshot';

// Telas de resultado do carrinho (pedido cancelado, Pix expirado/cancelado e
// pedido enviado). Mesmo tema claro/escuro e MESMO container do resto do
// carrinho (a CartShell fornece a navbar e o container); os símbolos de texto
// ✕/✓ viraram ícones Lucide de traço fino.

function StatusBadge({ children, color, className = '' }: { children: ReactNode; color?: string; className?: string }) {
  return (
    <div
      className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white mb-4 ${className}`}
      style={color ? { backgroundColor: color } : undefined}
    >
      {children}
    </div>
  );
}

const CENTER_COLUMN = 'min-h-[60vh] flex flex-col items-center justify-center text-center max-w-md mx-auto py-8';

export function OrderCancelledScreen() {
  const { t } = useI18n();
  return (
    <div className={CENTER_COLUMN}>
      <StatusBadge className="bg-[#9CA3AF] dark:bg-[#5F6368]">
        <X size={30} strokeWidth={1.5} aria-hidden="true" />
      </StatusBadge>
      <h1 className={`text-xl ${CART_TITLE}`}>{t('cartPage.pedido_cancelado')}</h1>
      <p className={`text-sm mt-2 ${CART_TEXT_BODY}`}>{t('cartPage.voltando_ao_cardapio')}</p>
    </div>
  );
}

interface PixFailedScreenProps {
  cancelledByRestaurant: boolean;
  tenantName: string;
  primaryColor: string;
  onBackToMenu: () => void;
}

export function PixFailedScreen({ cancelledByRestaurant, tenantName, primaryColor, onBackToMenu }: PixFailedScreenProps) {
  const { t } = useI18n();
  return (
    <div className={CENTER_COLUMN}>
      <StatusBadge className="bg-red-500">
        <X size={30} strokeWidth={1.5} aria-hidden="true" />
      </StatusBadge>
      <h1 className={`text-xl ${CART_TITLE}`}>
        {cancelledByRestaurant ? t('cartPage.o_pedido_foi_cancelado') : t('cartPage.o_tempo_pra_pagar')}
      </h1>
      <p className={`text-sm mt-2 ${CART_TEXT_BODY}`}>
        {cancelledByRestaurant
          ? t('cartPage.name_cancelou_esse_pedido', { name: tenantName })
          : t('cartPage.esse_pedido_foi_cancelado')}
      </p>
      <button
        type="button"
        onClick={onBackToMenu}
        className="mt-6 text-white px-5 py-2.5 rounded-xl text-sm font-semibold ring-1 ring-black/5 dark:ring-white/15"
        style={{ backgroundColor: primaryColor }}
      >
        {t('cartPage.voltar_ao_cardapio')}
      </button>
    </div>
  );
}

interface OrderSuccessScreenProps {
  tenant: Tenant;
  successOrder: CreatedOrder;
  orderSnapshot: OrderSnapshot;
  pixState: 'waiting' | 'confirmed' | 'expired' | 'cancelled';
  isTableFlow: boolean;
  // Chamar garçom (mesa)
  isWaiterCallPending: boolean;
  isCallingWaiter: boolean;
  callWaiterError: string | null;
  onCallWaiter: () => void;
  onCancelWaiterCall: () => void;
  // Chamar atendente (balcão)
  canFlagAttention: boolean;
  attentionFlagged: boolean;
  isFlaggingAttention: boolean;
  flagAttentionError: string | null;
  onFlagAttention: () => void;
  // Cancelar pedido (entrega)
  canStillCancelOrder: boolean;
  isCancellingOrder: boolean;
  cancelOrderError: string | null;
  onCancelOrder: () => void;
  onBackToMenu: () => void;
}

export function OrderSuccessScreen({
  tenant,
  successOrder,
  orderSnapshot,
  pixState,
  isTableFlow,
  isWaiterCallPending,
  isCallingWaiter,
  callWaiterError,
  onCallWaiter,
  onCancelWaiterCall,
  canFlagAttention,
  attentionFlagged,
  isFlaggingAttention,
  flagAttentionError,
  onFlagAttention,
  canStillCancelOrder,
  isCancellingOrder,
  cancelOrderError,
  onCancelOrder,
  onBackToMenu,
}: OrderSuccessScreenProps) {
  const { t } = useI18n();
  const accent = useAccentColor(tenant.primaryColor);

  const receivingLabel =
    orderSnapshot.orderType === 'mesa'
      ? (orderSnapshot.tableNumber ?? t('receiptContent.mesa'))
      : orderSnapshot.orderType === 'entrega'
        ? t('receiptContentStandalone.entrega')
        : t('receiptContentStandalone.balcao');

  const discountTitles = successOrder.promotionTitlesSnapshot?.length
    ? successOrder.promotionTitlesSnapshot
    : successOrder.promotionTitleSnapshot
      ? [successOrder.promotionTitleSnapshot]
      : [];

  const logo = tenant.logoUrl ? (
    <img src={tenant.logoUrl} alt={tenant.name} className="w-9 h-9 rounded-xl object-cover shrink-0" />
  ) : (
    <div
      className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0"
      style={{ backgroundColor: tenant.primaryColor }}
    >
      {tenant.name.charAt(0).toUpperCase()}
    </div>
  );

  return (
    <div className="flex flex-col items-center max-w-xl mx-auto py-4 md:py-8">
      <StatusBadge color={tenant.primaryColor}>
        <Check size={30} strokeWidth={1.5} aria-hidden="true" />
      </StatusBadge>
      <h1 className={`text-xl text-center ${CART_TITLE}`}>
        {pixState === 'confirmed' ? t('cartPage.pagamento_confirmado') : t('cartPage.pedido_enviado')}
      </h1>
      <p className={`text-sm mt-1 text-center ${CART_TEXT_BODY}`}>
        {pixState === 'confirmed' ? t('cartPage.seu_pix_foi_confirmado') : t('cartPage.o_estabelecimento_ja_recebeu')}
      </p>

      <div className={`w-full rounded-2xl border mt-5 overflow-hidden ${MENU_SURFACE} ${MENU_DIVIDER}`}>
        <div className={`flex items-center gap-2.5 px-4 py-3 border-b ${MENU_DIVIDER}`}>
          {logo}
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-semibold truncate ${CART_TEXT}`}>{tenant.name}</p>
            <p className={`text-xs ${CART_TEXT_MUTED}`}>
              {new Date(orderSnapshot.createdAt).toLocaleString(activeDateLocale(), {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
              {' · '}
              {receivingLabel}
            </p>
          </div>
        </div>

        <div className={`px-4 py-3 flex flex-col gap-1.5 border-b ${MENU_DIVIDER}`}>
          {orderSnapshot.items.map((item, idx) => (
            <div key={idx} className="flex justify-between text-sm">
              <span className={CART_TEXT_SOFT}>
                {item.quantity}x {item.name}
                {item.selectedOptions.length > 0 && (
                  <span className={`block text-xs ${CART_TEXT_MUTED}`}>{item.selectedOptions.join(', ')}</span>
                )}
              </span>
              <span className={`shrink-0 ml-2 ${CART_TEXT_BODY}`}>{formatBRL(item.price * item.quantity)}</span>
            </div>
          ))}
        </div>

        <div className={`px-4 py-3 flex flex-col gap-1.5 text-xs ${CART_TEXT_BODY}`}>
          {orderSnapshot.customerName && (
            <p>
              {t('cartPage.cliente')} <span className={`font-medium ${CART_TEXT_SOFT}`}>{orderSnapshot.customerName}</span>
            </p>
          )}

          {orderSnapshot.orderType === 'entrega' && orderSnapshot.deliveryAddress && (
            <>
              <p className="font-semibold flex items-center gap-1.5 mt-1">
                <MapPin size={13} strokeWidth={1.5} aria-hidden="true" />
                {t('cartPage.entrega_para')}
              </p>
              <p className={`text-sm font-medium ${CART_TEXT_SOFT}`}>{orderSnapshot.deliveryAddress}</p>
              {orderSnapshot.deliveryReferencePoint && (
                <p>
                  {t('receiptContentStandalone.ref')} {orderSnapshot.deliveryReferencePoint}
                </p>
              )}
              {orderSnapshot.deliveryFee != null && (
                <p>
                  {t('cartPage.taxa_de_entrega_r')} {orderSnapshot.deliveryFee.toFixed(2).replace('.', ',')}
                  {orderSnapshot.deliveryDistanceKm != null &&
                    t('cartPage.v0_km', { v0: orderSnapshot.deliveryDistanceKm.toFixed(1) })}
                </p>
              )}
            </>
          )}

          {orderSnapshot.orderType !== 'mesa' && orderSnapshot.paymentMethod && (
            <p>
              {t('cartPage.pagamento')}{' '}
              <span className={`font-medium ${CART_TEXT_SOFT}`}>
                {t(orderSnapshot.orderType === 'entrega' ? 'cart.payOnDelivery' : 'cart.payOnPickup', {
                  method: paymentMethodLabel(orderSnapshot.paymentMethod, t),
                })}
              </span>
            </p>
          )}

          <p>
            {t('cartPage.gorjeta')}{' '}
            <span className={`font-medium ${CART_TEXT_SOFT}`}>
              {orderSnapshot.tipAmount > 0 ? formatBRL(orderSnapshot.tipAmount) : t('cartPage.sem_gorjeta')}
            </span>
          </p>

          {(successOrder.discountAmount ?? 0) > 0 && (
            <p className={CART_TEXT_ERROR}>
              {t('receiptContent.desconto_aplicado')}
              {discountTitles.length > 0 ? ` (${discountTitles.join(', ')})` : ''}:{' '}
              <span className="font-medium">- {formatBRL(Number(successOrder.discountAmount))}</span>
            </p>
          )}

          {(successOrder.cashbackUsed ?? 0) > 0 && (
            <p className={CART_TEXT_ERROR}>
              {t('cartPage.cashback_usado')}{' '}
              <span className="font-medium">- {formatBRL(Number(successOrder.cashbackUsed))}</span>
            </p>
          )}

          {successOrder.total != null && (
            <p className={`pt-1 mt-1 flex justify-between text-sm ${CART_RULE}`}>
              <span className={`font-bold ${CART_TEXT}`}>{t('closingPaymentSheet.total')}</span>
              <span className={`font-bold ${CART_TEXT}`}>
                {formatBRL(Number(successOrder.total) + orderSnapshot.tipAmount)}
              </span>
            </p>
          )}

          {orderSnapshot.notes && (
            <p>
              {t('cartPage.observacao')} <span className={`font-medium ${CART_TEXT_SOFT}`}>{orderSnapshot.notes}</span>
            </p>
          )}
        </div>
      </div>

      {isTableFlow && (
        <div className="w-full mt-3 flex flex-col gap-2">
          {callWaiterError && <p className={`text-xs text-center ${CART_TEXT_ERROR}`}>{callWaiterError}</p>}
          {isWaiterCallPending ? (
            <div className="flex items-center gap-2">
              <div
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-center"
                style={{ backgroundColor: tenant.secondaryColor, color: 'white' }}
              >
                {t('cartPage.garcom_chamado')}
              </div>
              <button
                type="button"
                onClick={onCancelWaiterCall}
                className={`${CART_OUTLINE_BUTTON} !w-auto px-3 text-xs`}
              >
                {t('cartPage.cancelar_chamado')}
              </button>
            </div>
          ) : (
            <button type="button" onClick={onCallWaiter} disabled={isCallingWaiter} className={CART_OUTLINE_BUTTON}>
              {isCallingWaiter ? t('cartUi.calling') : t('cartPage.algo_errado_com_o')}
            </button>
          )}
        </div>
      )}

      {canFlagAttention && (
        <div className="w-full mt-2 flex flex-col gap-1.5">
          {flagAttentionError && <p className={`text-xs text-center ${CART_TEXT_ERROR}`}>{flagAttentionError}</p>}
          {attentionFlagged ? (
            <div
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-center text-white"
              style={{ backgroundColor: tenant.secondaryColor }}
            >
              {t('cartPage.atendente_chamado')}
            </div>
          ) : (
            <button type="button" onClick={onFlagAttention} disabled={isFlaggingAttention} className={CART_OUTLINE_BUTTON}>
              {isFlaggingAttention ? t('cartUi.calling') : t('cartPage.algo_errado_com_o_2')}
            </button>
          )}
        </div>
      )}

      {canStillCancelOrder && (
        <div className="w-full mt-2 flex flex-col gap-1.5">
          {cancelOrderError && <p className={`text-xs text-center ${CART_TEXT_ERROR}`}>{cancelOrderError}</p>}
          <button
            type="button"
            onClick={onCancelOrder}
            disabled={isCancellingOrder}
            className="w-full py-2.5 rounded-xl text-sm font-semibold border disabled:opacity-50 text-red-600 border-red-200 bg-red-50 dark:text-red-300 dark:border-red-500/20 dark:bg-red-500/10"
          >
            {isCancellingOrder ? t('cartUi.cancelling') : t('cartPage.cancelar_pedido')}
          </button>
        </div>
      )}

      <button type="button" onClick={onBackToMenu} className="mt-5 text-sm font-semibold" style={{ color: accent }}>
        {t('cartPage.voltar_ao_cardapio')}
      </button>
    </div>
  );
}
