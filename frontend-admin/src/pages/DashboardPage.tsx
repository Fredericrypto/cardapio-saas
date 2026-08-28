import { useEffect, useState } from 'react';
import { Bell, Clock, Table2, Receipt, Check, X, ShoppingBag, Bike, Copy, MessageSquare, Tag, Coins } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  attendWaiterCall,
  updateOrderStatus,
  confirmPixPayment,
} from '../lib/admin-api';
import { useDashboardData } from '../contexts/DashboardDataContext';
import { CloseSessionModal } from '../components/CloseSessionModal';
import { ViewReceiptModal } from '../components/ViewReceiptModal';
import { ConcludeOrderModal } from '../components/ConcludeOrderModal';
import type { TableSession, Order, RestaurantTable } from '../types';

const STATUS_OPTIONS: Order['status'][] = ['pendente', 'preparando', 'pronto'];

const STATUS_LABELS: Record<string, string> = {
  aguardando_pagamento: 'Aguardando Pix',
  pendente: 'Pendente',
  confirmado: 'Confirmado',
  preparando: 'Preparando',
  pronto: 'Pronto',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  dinheiro: 'Dinheiro',
  cartao: 'Cartão',
  pix: 'Pix',
};

const STATUS_COLORS: Record<string, string> = {
  aguardando_pagamento: 'bg-orange-100 text-orange-700',
  pendente: 'bg-amber-100 text-amber-700',
  confirmado: 'bg-blue-100 text-blue-700',
  preparando: 'bg-purple-100 text-purple-700',
  pronto: 'bg-green-100 text-green-700',
  entregue: 'bg-gray-100 text-gray-500',
  cancelado: 'bg-red-100 text-red-700',
};

function elapsedSince(dateStr: string): string {
  const minutes = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h${minutes % 60}min`;
}

interface ActiveTableGroup {
  kind: 'mesa-ativa';
  session: TableSession;
  table: RestaurantTable;
  total: number;
  openedAt: string;
  orders: Order[];
  // Pisca o card pra chamar atenção do admin: garçom chamado, cliente
  // solicitou fechamento, ou tem pedido novo (pendente) ainda não visto.
  needsAttention: boolean;
  // Assinatura do "motivo de atenção" atual — usada pra saber se o admin
  // já dispensou EXATAMENTE esse estado (clicando no card) ou se surgiu
  // algo novo desde então (ex: mais um pedido chegou) que deve voltar a
  // piscar mesmo já tendo sido dispensado antes.
  attentionSignature: string;
}

interface ClosedTableGroup {
  kind: 'mesa-fechada';
  tableNumber: string;
  orders: Order[];
}

interface StandaloneGroup {
  kind: 'avulso';
  order: Order;
}

type DisplayGroup = ActiveTableGroup | ClosedTableGroup | StandaloneGroup;

interface OrderActions {
  onStatusChange: (order: Order, status: Order['status']) => void;
  onConclude: (order: Order) => void;
  onCancel: (order: Order) => void;
  onConfirmPixPayment?: (order: Order) => void;
}

export function DashboardPage() {
  const {
    orders,
    waiterCalls,
    activeTables,
    refetchOrders,
    refetchWaiterCalls,
    refetchActiveTables,
  } = useDashboardData();
  const [closingSession, setClosingSession] = useState<TableSession | null>(null);
  const [viewingReceiptSession, setViewingReceiptSession] = useState<TableSession | null>(null);
  const [concludingOrder, setConcludingOrder] = useState<Order | null>(null);
  // Guarda, por mesa, a última "assinatura de atenção" que o admin já
  // dispensou clicando no card. Se a assinatura atual bater com a
  // dispensada, para de piscar; se surgir algo novo (mais um pedido,
  // outro chamado), a assinatura muda e volta a piscar.
  // Persistido no localStorage (não só em state) porque essa página
  // desmonta toda vez que o admin sai da aba Painel e volta — sem isso,
  // tudo que já tinha sido clicado voltava a piscar do zero.
  const [dismissedAttention, setDismissedAttention] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem('dashboard-dismissed-attention');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  function updateDismissedAttention(updater: (prev: Record<string, string>) => Record<string, string>) {
    setDismissedAttention((prev) => {
      const next = updater(prev);
      try {
        localStorage.setItem('dashboard-dismissed-attention', JSON.stringify(next));
      } catch {
        // localStorage indisponível (modo privado etc.) — só perde a
        // persistência entre navegações, não quebra o piscar em si.
      }
      return next;
    });
  }
  // Mesmo esquema, só que por pedido — usado pelos pedidos avulsos
  // (Balcão/Entrega) que não têm mesa: cada pedido "pendente" pisca até
  // ser clicado, e continua dispensado enquanto for o MESMO pedido no
  // mesmo status (se voltar a ficar pendente de outro jeito, é sempre um
  // pedido novo com id novo, então volta a piscar sozinho). Também
  // persistido no localStorage pelo mesmo motivo acima.
  const [dismissedStandaloneOrderIds, setDismissedStandaloneOrderIds] = useState<Set<string>>(
    () => {
      try {
        const raw = localStorage.getItem('dashboard-dismissed-standalone-order-ids');
        return raw ? new Set(JSON.parse(raw)) : new Set();
      } catch {
        return new Set();
      }
    },
  );
  function addDismissedStandaloneOrderId(id: string) {
    setDismissedStandaloneOrderIds((prev) => {
      const next = new Set(prev).add(id);
      try {
        localStorage.setItem(
          'dashboard-dismissed-standalone-order-ids',
          JSON.stringify([...next]),
        );
      } catch {
        // idem — sem persistência nesse caso, mas não quebra a tela.
      }
      return next;
    });
  }

  const activeOrders = (orders ?? []).filter(
    (o) => o.status !== 'entregue' && o.status !== 'cancelado',
  );

  const ordersBySessionId = new Map<string, Order[]>();
  const standaloneOrders: Order[] = [];

  for (const order of activeOrders) {
    if (order.tableSessionId) {
      const list = ordersBySessionId.get(order.tableSessionId) ?? [];
      list.push(order);
      ordersBySessionId.set(order.tableSessionId, list);
    } else {
      standaloneOrders.push(order);
    }
  }

  const groups: DisplayGroup[] = [];
  const sessionIdsWithPendingCall = new Set(
    (waiterCalls ?? []).map((call) => call.tableSessionId),
  );

  for (const item of activeTables ?? []) {
    const tableOrders = ordersBySessionId.get(item.session.id) ?? [];
    const pendingOrderCount = tableOrders.filter((o) => o.status === 'pendente').length;
    const hasPendingCall = sessionIdsWithPendingCall.has(item.session.id);
    const isAwaitingClosing = item.session.status === 'fechamento_solicitado';
    const attentionSignature = `${pendingOrderCount}|${hasPendingCall}|${isAwaitingClosing}`;
    const hasAttentionReason = pendingOrderCount > 0 || hasPendingCall || isAwaitingClosing;

    groups.push({
      kind: 'mesa-ativa',
      session: item.session,
      table: item.table,
      total: item.total,
      openedAt: item.openedAt,
      orders: tableOrders,
      needsAttention: hasAttentionReason && dismissedAttention[item.session.id] !== attentionSignature,
      attentionSignature,
    });
    ordersBySessionId.delete(item.session.id);
  }

  for (const [, sessionOrders] of ordersBySessionId) {
    if (sessionOrders.length === 0) continue;
    const tableNumber = sessionOrders[0].tableNumber ?? 'Mesa';
    groups.push({ kind: 'mesa-fechada', tableNumber, orders: sessionOrders });
  }

  for (const order of standaloneOrders) {
    groups.push({ kind: 'avulso', order });
  }

  const isEmpty = groups.length === 0;

  async function handleAttendCall(id: string) {
    await attendWaiterCall(id);
    refetchWaiterCalls();
  }

  async function handleStatusChange(order: Order, newStatus: Order['status']) {
    await updateOrderStatus(order.id, newStatus);
    refetchOrders();
  }

  async function handleConclude(order: Order) {
    await updateOrderStatus(order.id, 'entregue');
    refetchOrders();
  }

  async function handleCancel(order: Order) {
    const label = order.tableNumber ?? (order.orderType === 'entrega' ? 'Entrega' : 'Balcão');
    if (!confirm(`Cancelar o pedido de ${label}? Essa ação não pode ser desfeita.`)) return;
    await updateOrderStatus(order.id, 'cancelado');
    refetchOrders();
  }

  async function handleConfirmPixPayment(order: Order) {
    await confirmPixPayment(order.id);
    refetchOrders();
  }

  // Pedido de mesa: "concluir" é só o status de cozinha (item entregue à
  // mesa) — o pagamento de verdade acontece depois, ao "Fechar conta".
  const tableOrderActions: OrderActions = {
    onStatusChange: handleStatusChange,
    onConclude: handleConclude,
    onCancel: handleCancel,
  };

  // Pedido avulso (Balcão/Entrega) não tem uma etapa de "fechar conta"
  // separada — "concluir" É o único momento em que o pagamento é
  // registrado. Por isso abre um modal pedindo a forma de pagamento em
  // vez de marcar como entregue direto: sem isso, o pedido saía da lista
  // de pedidos ativos silenciosamente, dando a impressão de "fechado
  // como se tivesse sido pago" sem NUNCA perguntar como foi pago.
  const standaloneOrderActions: OrderActions = {
    onStatusChange: handleStatusChange,
    onConclude: (order) => setConcludingOrder(order),
    onCancel: handleCancel,
    onConfirmPixPayment: handleConfirmPixPayment,
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="font-display text-xl font-bold text-gray-900 mb-6">Painel</h1>

      {waiterCalls && waiterCalls.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-500 mb-2 flex items-center gap-1.5">
            <Bell size={15} />
            Chamados de garçom pendentes
          </h2>
          <div className="flex flex-col gap-2">
            {waiterCalls.map((call) => (
              <div
                key={call.id}
                className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {call.tableSession?.table?.number ?? 'Mesa desconhecida'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(call.createdAt).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <button
                  onClick={() => handleAttendCall(call.id)}
                  className="text-xs font-semibold bg-gray-900 text-white px-3 py-1.5 rounded-lg"
                >
                  Marcar como atendido
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <h2 className="text-sm font-semibold text-gray-500 mb-3 flex items-center gap-1.5">
        <Clock size={15} />
        Mesas e pedidos ativos
      </h2>

      {isEmpty ? (
        <p className="text-sm text-gray-400 py-8 text-center">
          Nenhuma mesa ou pedido ativo no momento.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {groups.map((group) => {
            if (group.kind === 'mesa-ativa') {
              return (
                <ActiveTableCard
                  key={group.session.id}
                  group={group}
                  onViewReceipt={() => setViewingReceiptSession(group.session)}
                  onCloseAccount={() => setClosingSession(group.session)}
                  onDismissAttention={() =>
                    updateDismissedAttention((prev) => ({
                      ...prev,
                      [group.session.id]: group.attentionSignature,
                    }))
                  }
                  actions={tableOrderActions}
                />
              );
            }
            if (group.kind === 'mesa-fechada') {
              return (
                <ClosedTableCard
                  key={`fechada-${group.tableNumber}-${group.orders[0]?.id}`}
                  group={group}
                  actions={tableOrderActions}
                />
              );
            }
            const needsAttention =
              ((group.order.status === 'pendente' || group.order.status === 'aguardando_pagamento') ||
                group.order.flagged) &&
              !dismissedStandaloneOrderIds.has(group.order.id);
            return (
              <StandaloneOrderCard
                key={group.order.id}
                order={group.order}
                actions={standaloneOrderActions}
                needsAttention={needsAttention}
                onDismissAttention={() => addDismissedStandaloneOrderId(group.order.id)}
              />
            );
          })}
        </div>
      )}

      {closingSession && (
        <CloseSessionModal
          session={closingSession}
          onClose={() => setClosingSession(null)}
          onClosed={() => {
            setClosingSession(null);
            refetchActiveTables();
            refetchOrders();
          }}
        />
      )}

      {viewingReceiptSession && (
        <ViewReceiptModal
          session={viewingReceiptSession}
          onClose={() => setViewingReceiptSession(null)}
        />
      )}

      {concludingOrder && (
        <ConcludeOrderModal
          order={concludingOrder}
          onClose={() => setConcludingOrder(null)}
          onConcluded={() => {
            setConcludingOrder(null);
            refetchOrders();
          }}
        />
      )}
    </div>
  );
}

function OrderRow({ order, actions }: { order: Order; actions: OrderActions }) {
  return (
    <div className="border-t border-gray-100 pt-2.5 first:border-t-0 first:pt-0">
      {order.items && order.items.length > 0 && (
        <div className="mb-1.5 flex flex-col gap-0.5">
          {order.items.map((item) => (
            <div key={item.id}>
              <p className="text-xs text-gray-500">
                {item.quantity}x {item.productName}
              </p>
              {item.selectedOptions && item.selectedOptions.length > 0 && (
                <p className="text-[11px] text-gray-400 pl-3">
                  {item.selectedOptions.map((o) => o.label).join(', ')}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {order.flagged && (
        <div className="mb-1.5 bg-orange-50 border border-orange-100 rounded-lg px-2 py-1.5 flex items-center gap-1.5">
          <Bell size={13} className="text-orange-600 shrink-0" />
          <p className="text-xs text-orange-800 font-medium">Cliente chamou o atendente</p>
        </div>
      )}

      {order.notes && (
        <div className="mb-1.5 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5 flex gap-1.5">
          <MessageSquare size={13} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">{order.notes}</p>
        </div>
      )}

      {order.orderType === 'entrega' && order.deliveryAddress && (
        <div className="mb-1.5 bg-gray-50 rounded-lg p-2 flex flex-col gap-0.5">
          <p className="text-xs text-gray-600 font-medium">{order.deliveryAddress}</p>
          {order.deliveryReferencePoint && (
            <p className="text-xs text-gray-400">Ref: {order.deliveryReferencePoint}</p>
          )}
          {(order.deliveryDistanceKm != null || order.deliveryFee) && (
            <p className="text-xs text-gray-400">
              {order.deliveryDistanceKm != null && `${order.deliveryDistanceKm.toFixed(1)} km`}
              {order.deliveryDistanceKm != null && order.deliveryFee ? ' · ' : ''}
              {order.deliveryFee
                ? `Taxa de entrega: R$ ${Number(order.deliveryFee).toFixed(2).replace('.', ',')}`
                : ''}
            </p>
          )}
          {order.deliveryAddressPrecise === false && (
            <p className="text-xs text-amber-600 font-medium">
              ⚠ Endereço não confirmado com exatidão — confira com o cliente
            </p>
          )}
        </div>
      )}

      {(order.discountAmount ?? 0) > 0 && (
        <div className="mb-1.5 bg-red-50 border border-red-100 rounded-lg px-2 py-1.5 flex items-center gap-1.5">
          <Tag size={13} className="text-red-500 shrink-0" />
          <p className="text-xs text-red-700">
            {(() => {
              const titles = order.promotionTitlesSnapshot?.length
                ? order.promotionTitlesSnapshot
                : order.promotionTitleSnapshot
                  ? [order.promotionTitleSnapshot]
                  : [];
              return `Cupom${titles.length > 0 ? ` "${titles.join(', ')}"` : ''}`;
            })()}
            : -R${' '}
            {Number(order.discountAmount).toFixed(2).replace('.', ',')}
          </p>
        </div>
      )}

      {(order.cashbackUsed ?? 0) > 0 && (
        <div className="mb-1.5 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5 flex items-center gap-1.5">
          <Coins size={13} className="text-amber-600 shrink-0" />
          <p className="text-xs text-amber-800">
            Pago com cashback: R${' '}
            {(Number(order.total) + Number(order.cashbackUsed)).toFixed(2).replace('.', ',')}
            {' → -R$ '}
            {Number(order.cashbackUsed).toFixed(2).replace('.', ',')}
            {' = R$ '}
            {Number(order.total).toFixed(2).replace('.', ',')}
          </p>
        </div>
      )}

      {(order.cashbackEarned ?? 0) > 0 && (
        <div className="mb-1.5 bg-green-50 border border-green-100 rounded-lg px-2 py-1.5 flex items-center gap-1.5">
          <Coins size={13} className="text-green-600 shrink-0" />
          <p className="text-xs text-green-700">
            Cashback dado ao cliente: +R$ {Number(order.cashbackEarned).toFixed(2).replace('.', ',')}
          </p>
        </div>
      )}

      {order.paymentMethod && (
        <p className="text-xs text-gray-400 mb-1.5">
          Pagamento: {PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod}
        </p>
      )}

      {order.status === 'aguardando_pagamento' && order.pixPayload ? (
        <PixWaitingPanel order={order} actions={actions} />
      ) : (
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-gray-900">
            R$ {Number(order.total).toFixed(2).replace('.', ',')}
            {order.tipAmount > 0 && (
              <span className="text-xs font-medium text-gray-400">
                {' '}
                + R$ {Number(order.tipAmount).toFixed(2).replace('.', ',')} gorjeta
              </span>
            )}
          </p>

          <div className="flex items-center gap-1.5">
            <select
              value={order.status}
              onChange={(e) => actions.onStatusChange(order, e.target.value as Order['status'])}
              className="text-xs font-medium border border-gray-200 rounded-lg px-2 py-1.5 outline-none"
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
            {/* "Concluir pedido" registra PAGAMENTO — nunca aparece pra
                pedido de mesa. Mesa paga uma vez só, pela conta
                inteira, no botão "Fechar conta" do card da mesa (ver
                ActiveTableCard) — nunca pedido por pedido. Bug real que
                isso corrige: esse botão aparecia aqui também pros
                pedidos dentro de uma mesa ativa, e clicar nele marcava
                aquele pedido como pago por fora do fechamento de conta
                de verdade, sem bater com o total cobrado quando a mesa
                fechava. */}
            {order.orderType !== 'mesa' && (
              <button
                onClick={() => actions.onConclude(order)}
                title="Concluir pedido"
                className="w-7 h-7 rounded-lg bg-green-100 text-green-700 flex items-center justify-center"
              >
                <Check size={14} />
              </button>
            )}
            <button
              onClick={() => actions.onCancel(order)}
              title="Cancelar pedido"
              className="w-7 h-7 rounded-lg bg-red-100 text-red-600 flex items-center justify-center"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Aparece só enquanto um pedido avulso (balcão/entrega) tá esperando o
// cliente pagar via Pix e o admin confirmar o recebimento — sem gateway
// automático no meio, é o admin quem vê o Pix cair no banco dele e clica
// aqui pra liberar o pedido pra cozinha.
function PixWaitingPanel({ order, actions }: { order: Order; actions: OrderActions }) {
  const [copied, setCopied] = useState(false);
  const [msRemaining, setMsRemaining] = useState(() =>
    order.pixExpiresAt ? new Date(order.pixExpiresAt).getTime() - Date.now() : 0,
  );

  useEffect(() => {
    if (!order.pixExpiresAt) return;
    const expiresAtMs = new Date(order.pixExpiresAt).getTime();
    const interval = setInterval(() => {
      setMsRemaining(expiresAtMs - Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [order.pixExpiresAt]);

  async function handleCopy() {
    if (!order.pixPayload) return;
    await navigator.clipboard.writeText(order.pixPayload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const countdownLabel = `${Math.floor(totalSeconds / 60)}:${(totalSeconds % 60).toString().padStart(2, '0')}`;

  return (
    <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-gray-900">
          R$ {(Number(order.total) + Number(order.tipAmount)).toFixed(2).replace('.', ',')}
        </p>
        <span className="text-xs text-orange-700 font-medium">Aguardando Pix do cliente</span>
      </div>

      <div className="flex items-center gap-3">
        <QRCodeSVG value={order.pixPayload!} size={72} />
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg px-2 py-1.5"
            >
              <Copy size={12} />
              {copied ? 'Copiado!' : 'Copiar código Pix'}
            </button>
            {order.pixExpiresAt && (
              <span
                className={`text-xs font-bold tabular-nums ${totalSeconds < 60 ? 'text-red-500' : 'text-orange-700'}`}
              >
                {countdownLabel}
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-400">
            Cliente também vê esse QR no app dele. Confirme só depois de ver o Pix cair no seu
            banco.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => actions.onConfirmPixPayment?.(order)}
          className="flex-1 text-xs font-semibold bg-green-600 text-white rounded-lg px-3 py-2"
        >
          Confirmar pagamento recebido
        </button>
        <button
          onClick={() => actions.onCancel(order)}
          title="Cancelar pedido"
          className="w-8 h-8 rounded-lg bg-red-100 text-red-600 flex items-center justify-center shrink-0"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

function ActiveTableCard({
  group,
  onViewReceipt,
  onCloseAccount,
  onDismissAttention,
  actions,
}: {
  group: ActiveTableGroup;
  onViewReceipt: () => void;
  onCloseAccount: () => void;
  onDismissAttention: () => void;
  actions: OrderActions;
}) {
  const isAwaitingClosing = group.session.status === 'fechamento_solicitado';

  return (
    <div
      onClick={group.needsAttention ? onDismissAttention : undefined}
      className={`border rounded-xl p-4 flex flex-col gap-3 ${
        group.needsAttention
          ? 'attention-blink cursor-pointer'
          : isAwaitingClosing
            ? 'bg-blue-50 border-blue-200'
            : 'bg-white border-gray-100'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Table2 size={15} className="text-gray-400" />
          <p className="text-sm font-semibold text-gray-900">{group.table?.number ?? 'Mesa'}</p>
          {isAwaitingClosing && (
            <span className="text-xs font-semibold text-blue-600">aguardando fechamento</span>
          )}
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button
            onClick={onViewReceipt}
            className="text-xs font-semibold bg-gray-100 text-gray-600 px-2.5 py-1.5 rounded-lg flex items-center gap-1"
          >
            <Receipt size={13} />
            Cupom
          </button>
          <button
            onClick={onCloseAccount}
            className="text-xs font-semibold bg-gray-900 text-white px-2.5 py-1.5 rounded-lg"
          >
            Fechar conta
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-400 -mt-2">
        Aberta há {elapsedSince(group.openedAt)} · Total R${' '}
        {group.total.toFixed(2).replace('.', ',')}
        {group.session.tipAmount > 0 &&
          ` + R$ ${Number(group.session.tipAmount).toFixed(2).replace('.', ',')} gorjeta`}
      </p>

      {group.orders.length === 0 ? (
        <p className="text-xs text-gray-400 italic">Nenhum pedido em preparo agora.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {group.orders.map((order) => (
            <OrderRow key={order.id} order={order} actions={actions} />
          ))}
        </div>
      )}
    </div>
  );
}

function ClosedTableCard({ group, actions }: { group: ClosedTableGroup; actions: OrderActions }) {
  return (
    <div className="border border-gray-100 bg-white rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Table2 size={15} className="text-gray-400" />
          <p className="text-sm font-semibold text-gray-900">{group.tableNumber}</p>
        </div>
        <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
          conta já paga
        </span>
      </div>
      <p className="text-xs text-gray-400 -mt-2">
        Ainda em preparo — continua aqui até a cozinha concluir.
      </p>
      <div className="flex flex-col gap-2.5">
        {group.orders.map((order) => (
          <OrderRow key={order.id} order={order} actions={actions} />
        ))}
      </div>
    </div>
  );
}

function StandaloneOrderCard({
  order,
  actions,
  needsAttention,
  onDismissAttention,
}: {
  order: Order;
  actions: OrderActions;
  needsAttention: boolean;
  onDismissAttention: () => void;
}) {
  const Icon = order.orderType === 'entrega' ? Bike : ShoppingBag;
  const label = order.orderType === 'entrega' ? 'Entrega' : 'Balcão';

  return (
    <div
      onClick={needsAttention ? onDismissAttention : undefined}
      className={`border rounded-xl p-4 flex flex-col gap-2.5 ${
        needsAttention ? 'attention-blink cursor-pointer' : 'bg-white border-gray-100'
      }`}
    >
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <Icon size={15} className="text-gray-400 shrink-0" />
            {order.customer?.avatarUrl && (
              <img
                src={order.customer.avatarUrl}
                alt=""
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
                className="w-4 h-4 rounded-full object-cover shrink-0"
              />
            )}
            <p className="text-sm font-semibold text-gray-900 truncate">{label}</p>
          </div>
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[order.status]}`}
          >
            {STATUS_LABELS[order.status]}
          </span>
        </div>
        <p className="text-xs text-gray-400 truncate">
          {new Date(order.createdAt).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}
          {order.customerName ? ` · ${order.customerName}` : ''}
          {order.customerPhone ? ` · ${order.customerPhone}` : ''}
        </p>
      </div>
      <OrderRow order={order} actions={actions} />
    </div>
  );
}
