import type { CSSProperties, ReactNode } from 'react';
import { ArrowLeft, Check, Coins, MapPin, X } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { paymentMethodLabel } from '../../i18n/labels';
import { activeDateLocale } from '../../i18n/languages';
import { useAccentColor } from '../../hooks/useAccentColor';
import { formatBRL } from '../../lib/cartFormat';
import {
  CART_OUTLINE_BUTTON,
  CART_PANEL,
  CART_TEXT,
  CART_TEXT_BODY,
  CART_TEXT_ERROR,
  CART_TEXT_MUTED,
  CART_TEXT_SOFT,
  CART_TEXT_SUCCESS,
} from '../../lib/cartTheme';
import { PROMO_EYEBROW, PROMO_FOCUS, PROMO_INK, PROMO_MUTED, PROMO_SAGE, PROMO_SERIF } from '../../lib/promotionTheme';
import type { CreatedOrder, Tenant } from '../../types';
import type { OrderSnapshot } from './orderSnapshot';

// Telas de resultado do carrinho (pedido cancelado, Pix expirado/cancelado e
// pedido enviado). Mesma linguagem editorial das telas de carrinho e perfil:
// título serifado, vidro, filetes que esmaecem nas pontas. Só apresentação:
// nenhuma regra de pedido, pagamento ou navegação mora aqui.

const CENTER_COLUMN = 'min-h-[60vh] flex flex-col items-center justify-center text-center max-w-md mx-auto py-8';

// Filete fino que some nas pontas (mesmo recurso da borda da navbar).
function Hairline() {
  return (
    <span
      aria-hidden="true"
      className="block h-px w-full text-black/15 dark:text-white/15"
      style={{ background: 'linear-gradient(90deg, transparent, currentColor 18%, currentColor 82%, transparent)' }}
    />
  );
}

interface ResultHeaderProps {
  icon: ReactNode;
  /** Cor do selo (contorno, ícone e brilho). */
  color: string;
  title: string;
  subtitle: string;
  eyebrow?: string;
}

// Cabeçalho comum a todas as telas de resultado. `role="status"` para o leitor
// de tela anunciar o resultado assim que a tela aparece.
function ResultHeader({ icon, color, title, subtitle, eyebrow }: ResultHeaderProps) {
  return (
    <header role="status" className="cart-pay-in flex flex-col items-center text-center">
      <span
        aria-hidden="true"
        className="flex h-16 w-16 items-center justify-center rounded-full border bg-transparent backdrop-blur-md"
        style={{ color, borderColor: color, boxShadow: `0 0 28px color-mix(in srgb, ${color} 35%, transparent)` }}
      >
        {icon}
      </span>
      {eyebrow && <p className={`mt-5 ${PROMO_EYEBROW} ${PROMO_MUTED}`}>{eyebrow}</p>}
      <h1
        className={`${eyebrow ? 'mt-2' : 'mt-5'} text-4xl md:text-5xl font-light italic leading-tight ${PROMO_INK}`}
        style={{ fontFamily: PROMO_SERIF }}
      >
        {title}
      </h1>
      <p className={`mt-3 max-w-md text-sm ${CART_TEXT_BODY}`}>{subtitle}</p>
    </header>
  );
}

export function OrderCancelledScreen() {
  const { t } = useI18n();
  return (
    <div className={CENTER_COLUMN}>
      <ResultHeader
        icon={<X size={28} strokeWidth={1.5} />}
        color="#9CA3AF"
        title={t('cartPage.pedido_cancelado')}
        subtitle={t('cartPage.voltando_ao_cardapio')}
      />
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
      <ResultHeader
        icon={<X size={28} strokeWidth={1.5} />}
        color="#EF4444"
        title={cancelledByRestaurant ? t('cartPage.o_pedido_foi_cancelado') : t('cartPage.o_tempo_pra_pagar')}
        subtitle={
          cancelledByRestaurant
            ? t('cartPage.name_cancelou_esse_pedido', { name: tenantName })
            : t('cartPage.esse_pedido_foi_cancelado')
        }
      />
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

// Linha de detalhe do recibo: rótulo pequeno em caixa alta + valor.
function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
      <dt className={`${PROMO_EYEBROW} pt-0.5 ${CART_TEXT_MUTED}`}>{label}</dt>
      <dd className={`min-w-0 break-words ${CART_TEXT_SOFT}`}>{children}</dd>
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

  const isPaid = pixState === 'confirmed';
  const isTable = orderSnapshot.orderType === 'mesa';
  const isDelivery = orderSnapshot.orderType === 'entrega';

  const receivingLabel = isTable
    ? (orderSnapshot.tableNumber ?? t('receiptContent.mesa'))
    : isDelivery
      ? t('receiptContentStandalone.entrega')
      : t('receiptContentStandalone.balcao');

  const discountTitles = successOrder.promotionTitlesSnapshot?.length
    ? successOrder.promotionTitlesSnapshot
    : successOrder.promotionTitleSnapshot
      ? [successOrder.promotionTitleSnapshot]
      : [];

  const discountAmount = Number(successOrder.discountAmount ?? 0);
  const cashbackUsed = Number(successOrder.cashbackUsed ?? 0);
  const cashbackEarned = Number(successOrder.cashbackEarned ?? 0);

  const subtitle = isPaid
    ? orderSnapshot.paymentMethod === 'cartao'
      ? t('cartPayment.cardConfirmed')
      : t('cartPage.seu_pix_foi_confirmado')
    : t('cartPage.o_estabelecimento_ja_recebeu');

  const hasDetails =
    Boolean(orderSnapshot.customerName) ||
    (isDelivery && Boolean(orderSnapshot.deliveryAddress)) ||
    (!isTable && Boolean(orderSnapshot.paymentMethod)) ||
    !isTable ||
    Boolean(orderSnapshot.notes);

  return (
    <div className="flex flex-col items-center max-w-2xl mx-auto py-4 md:py-8" style={{ '--accent': accent } as CSSProperties}>
      <ResultHeader
        icon={<Check size={28} strokeWidth={1.5} />}
        color={accent}
        eyebrow={isPaid ? t('orderSuccess.eyebrowPaid') : t('orderSuccess.eyebrow')}
        title={isPaid ? t('cartPage.pagamento_confirmado') : t('cartPage.pedido_enviado')}
        subtitle={subtitle}
      />

      <section aria-label={t('cartUi.summary')} className={`cart-pay-in w-full mt-8 flex flex-col gap-5 ${CART_PANEL}`}>
        <div className="flex items-center gap-3">
          {tenant.logoUrl ? (
            <img src={tenant.logoUrl} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0" />
          ) : (
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0"
              style={{ backgroundColor: tenant.primaryColor }}
            >
              {tenant.name.charAt(0).toUpperCase()}
            </div>
          )}
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

        <Hairline />

        <ul aria-label={t('cartPage.itens')} className="flex flex-col gap-2.5">
          {orderSnapshot.items.map((item, idx) => (
            <li key={idx} className="flex justify-between gap-4 text-sm">
              <span className={`min-w-0 ${CART_TEXT_SOFT}`}>
                {item.quantity}x {item.name}
                {item.selectedOptions.length > 0 && (
                  <span className={`block text-xs ${CART_TEXT_MUTED}`}>{item.selectedOptions.join(', ')}</span>
                )}
              </span>
              <span className={`shrink-0 tabular-nums ${CART_TEXT_BODY}`}>{formatBRL(item.price * item.quantity)}</span>
            </li>
          ))}
        </ul>

        {hasDetails && (
          <>
            <Hairline />
            <dl className="flex flex-col gap-3">
              {orderSnapshot.customerName && <DetailRow label={t('receiptContent.cliente')}>{orderSnapshot.customerName}</DetailRow>}

              {isDelivery && orderSnapshot.deliveryAddress && (
                <DetailRow label={t('receiptContentStandalone.endereco')}>
                  <span className="flex items-start gap-1.5">
                    <MapPin size={14} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <span>{orderSnapshot.deliveryAddress}</span>
                  </span>
                  {orderSnapshot.deliveryReferencePoint && (
                    <span className={`block text-xs ${CART_TEXT_MUTED}`}>
                      {t('receiptContentStandalone.ref')} {orderSnapshot.deliveryReferencePoint}
                    </span>
                  )}
                </DetailRow>
              )}

              {isDelivery && orderSnapshot.deliveryFee != null && (
                <DetailRow label={t('cartPage.taxa_de_entrega')}>
                  {formatBRL(orderSnapshot.deliveryFee)}
                  {orderSnapshot.deliveryDistanceKm != null &&
                    t('cartPage.v0_km', { v0: orderSnapshot.deliveryDistanceKm.toFixed(1) })}
                </DetailRow>
              )}

              {!isTable && orderSnapshot.paymentMethod && (
                <DetailRow label={t('receiptContent.pagamento')}>
                  {t(isDelivery ? 'cart.payOnDelivery' : 'cart.payOnPickup', {
                    method: paymentMethodLabel(orderSnapshot.paymentMethod, t),
                  })}
                </DetailRow>
              )}

              {!isTable && (
                <DetailRow label={t('closingPaymentSheet.gorjeta')}>
                  {orderSnapshot.tipAmount > 0 ? formatBRL(orderSnapshot.tipAmount) : t('cartPage.sem_gorjeta')}
                </DetailRow>
              )}

              {orderSnapshot.notes && <DetailRow label={t('cartPage.observacao_2')}>{orderSnapshot.notes}</DetailRow>}
            </dl>
          </>
        )}

        {(discountAmount > 0 || cashbackUsed > 0 || successOrder.total != null) && <Hairline />}

        <div className="flex flex-col gap-1.5 text-sm">
          {discountAmount > 0 && (
            <div className={`flex justify-between gap-3 ${CART_TEXT_ERROR}`}>
              <span className="min-w-0">
                {t('receiptContent.desconto_aplicado')}
                {discountTitles.length > 0 ? ` (${discountTitles.join(', ')})` : ''}
              </span>
              <span className="shrink-0 tabular-nums">- {formatBRL(discountAmount)}</span>
            </div>
          )}

          {cashbackUsed > 0 && (
            <div className={`flex justify-between gap-3 ${CART_TEXT_ERROR}`}>
              <span>{t('receiptContent.cashback_usado')}</span>
              <span className="shrink-0 tabular-nums">- {formatBRL(cashbackUsed)}</span>
            </div>
          )}

          {successOrder.total != null && (
            <div className={`flex justify-between items-baseline gap-3 ${discountAmount > 0 || cashbackUsed > 0 ? 'pt-2' : ''}`}>
              <span className={`text-sm font-semibold ${CART_TEXT}`}>{t('closingPaymentSheet.total')}</span>
              <span className={`text-4xl font-light tabular-nums ${PROMO_SAGE}`} style={{ fontFamily: PROMO_SERIF }}>
                {formatBRL(Number(successOrder.total) + orderSnapshot.tipAmount)}
              </span>
            </div>
          )}

          {cashbackEarned > 0 && (
            <p className={`flex items-center justify-end gap-1.5 pt-1 text-xs ${CART_TEXT_SUCCESS}`}>
              <Coins size={13} strokeWidth={1.5} aria-hidden="true" />
              {t('receiptContent.cashback_recebido_nesse_pedido')}: + {formatBRL(cashbackEarned)}
            </p>
          )}
        </div>
      </section>

      <div className="w-full mt-4 flex flex-col gap-2">
        {isTableFlow && (
          <>
            {callWaiterError && (
              <p role="alert" className={`text-xs text-center ${CART_TEXT_ERROR}`}>
                {callWaiterError}
              </p>
            )}
            {isWaiterCallPending ? (
              <div className="flex items-center gap-2">
                <div
                  role="status"
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border bg-transparent py-2.5 text-sm font-semibold backdrop-blur-md"
                  style={{ borderColor: accent, color: accent }}
                >
                  <Check size={16} strokeWidth={1.5} aria-hidden="true" />
                  {t('cartPage.garcom_chamado')}
                </div>
                <button type="button" onClick={onCancelWaiterCall} className={`${CART_OUTLINE_BUTTON} !w-auto px-3 text-xs`}>
                  {t('cartPage.cancelar_chamado')}
                </button>
              </div>
            ) : (
              <button type="button" onClick={onCallWaiter} disabled={isCallingWaiter} className={CART_OUTLINE_BUTTON}>
                {isCallingWaiter ? t('cartUi.calling') : t('cartPage.algo_errado_com_o')}
              </button>
            )}
          </>
        )}

        {canFlagAttention && (
          <>
            {flagAttentionError && (
              <p role="alert" className={`text-xs text-center ${CART_TEXT_ERROR}`}>
                {flagAttentionError}
              </p>
            )}
            {attentionFlagged ? (
              <div
                role="status"
                className="flex w-full items-center justify-center gap-2 rounded-xl border bg-transparent py-2.5 text-sm font-semibold backdrop-blur-md"
                style={{ borderColor: accent, color: accent }}
              >
                <Check size={16} strokeWidth={1.5} aria-hidden="true" />
                {t('cartPage.atendente_chamado')}
              </div>
            ) : (
              <button type="button" onClick={onFlagAttention} disabled={isFlaggingAttention} className={CART_OUTLINE_BUTTON}>
                {isFlaggingAttention ? t('cartUi.calling') : t('cartPage.algo_errado_com_o_2')}
              </button>
            )}
          </>
        )}

        {canStillCancelOrder && (
          <>
            {cancelOrderError && (
              <p role="alert" className={`text-xs text-center ${CART_TEXT_ERROR}`}>
                {cancelOrderError}
              </p>
            )}
            <button
              type="button"
              onClick={onCancelOrder}
              disabled={isCancellingOrder}
              className="w-full py-2.5 rounded-xl text-sm font-semibold border disabled:opacity-50 text-red-600 border-red-200 bg-red-50 dark:text-red-300 dark:border-red-500/20 dark:bg-red-500/10"
            >
              {isCancellingOrder ? t('cartUi.cancelling') : t('cartPage.cancelar_pedido')}
            </button>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={onBackToMenu}
        className={`mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold glass-hover ${PROMO_FOCUS}`}
        style={{ color: accent }}
      >
        <ArrowLeft size={16} strokeWidth={1.5} aria-hidden="true" />
        {t('cartPage.voltar_ao_cardapio')}
      </button>
    </div>
  );
}
