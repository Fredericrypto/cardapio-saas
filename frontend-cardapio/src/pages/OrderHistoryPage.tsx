import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Table2, ShoppingBag, Bike, FolderClosed, Star } from 'lucide-react';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useTenant } from '../contexts/TenantContext';
import { fetchMyOrderHistory, fetchMyReviewsByOrderIds } from '../lib/customer-api';
import type { MyReview } from '../lib/customer-api';
import {
  groupCustomerOrders,
  groupEntriesByDay,
  formatMoney,
  formatDateTime,
  type DayGroup,
  type MesaHistoryEntry,
  type AvulsoHistoryEntry,
} from '../lib/ordersHistory';
import { BottomNav } from '../components/BottomNav';

const STATUS_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  aguardando_pagamento: { label: 'Aguardando Pix', bg: '#FFEDD5', color: '#C2410C' },
  pendente: { label: 'Pendente', bg: '#FEF3C7', color: '#B45309' },
  confirmado: { label: 'Confirmado', bg: '#DBEAFE', color: '#1D4ED8' },
  preparando: { label: 'Preparando', bg: '#DBEAFE', color: '#1D4ED8' },
  pronto: { label: 'Pronto', bg: '#DCFCE7', color: '#15803D' },
  entregue: { label: 'Entregue', bg: '#DCFCE7', color: '#15803D' },
  cancelado: { label: 'Cancelado', bg: '#FEE2E2', color: '#B91C1C' },
  aberta: { label: 'Em aberto', bg: '#DBEAFE', color: '#1D4ED8' },
  fechamento_solicitado: { label: 'Fechando', bg: '#FEF3C7', color: '#B45309' },
  fechada: { label: 'Fechada', bg: '#DCFCE7', color: '#15803D' },
};

// Histórico completo — organizado por data (Hoje/Ontem/data), com pedidos
// de mesa agrupados por visita (sessão) e pedidos avulsos (balcão/entrega)
// cada um na sua própria linha, igual ao histórico do painel do admin.
export function OrderHistoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { tenant } = useTenant();


  const { token, isLoading: isLoadingAuth } = useCustomerAuth();
  const [dayGroups, setDayGroups] = useState<DayGroup[] | null>(null);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [reviewsByOrderId, setReviewsByOrderId] = useState<Record<string, MyReview>>({});

  useEffect(() => {
    if (!tenant || !token) return;
    fetchMyOrderHistory(tenant.id, token)
      .then((orders) => {
        const groups = groupEntriesByDay(groupCustomerOrders(orders));
        setDayGroups(groups);
        const avulsoOrderIds = groups
          .flatMap((g) => g.avulsoItems)
          .map((item) => item.orderId);
        if (avulsoOrderIds.length > 0) {
          fetchMyReviewsByOrderIds(tenant.id, token, avulsoOrderIds).then(setReviewsByOrderId);
        }
      })
      .finally(() => setIsLoadingOrders(false));
  }, [tenant, token]);

  const isEmpty = useMemo(
    () => !isLoadingOrders && (dayGroups?.length ?? 0) === 0,
    [isLoadingOrders, dayGroups],
  );

  if (!tenant || isLoadingAuth) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24 max-w-md mx-auto">
      <div className="flex items-center gap-3 px-4 py-4 bg-white border-b border-gray-100">
        <button onClick={() => navigate(`/${slug}/conta-cliente/pedidos`)}>
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-display font-bold text-lg">Histórico de pedidos</h1>
      </div>

      <div className="px-4 mt-3 flex flex-col gap-5">
        {isLoadingOrders && <p className="text-xs text-gray-400 px-1">Carregando...</p>}
        {isEmpty && (
          <p className="text-xs text-gray-400 px-1">Você ainda não fez nenhum pedido aqui.</p>
        )}

        {dayGroups?.map((group) => (
          <DayFolder
            key={group.dateKey}
            group={group}
            reviewsByOrderId={reviewsByOrderId}
            onOpenMesa={(sessionId) => navigate(`/${slug}/conta-cliente/pedidos/mesa/${sessionId}`)}
            onOpenAvulso={(orderId) => navigate(`/${slug}/conta-cliente/pedidos/avulso/${orderId}`)}
          />
        ))}
      </div>

      <BottomNav slug={slug!} tenantId={tenant.id} primaryColor={tenant.primaryColor} />
    </div>
  );
}

function DayFolder({
  group,
  reviewsByOrderId,
  onOpenMesa,
  onOpenAvulso,
}: {
  group: DayGroup;
  reviewsByOrderId: Record<string, MyReview>;
  onOpenMesa: (sessionId: string) => void;
  onOpenAvulso: (orderId: string) => void;
}) {
  const total = group.mesaItems.length + group.avulsoItems.length;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 text-gray-500 px-1">
        <FolderClosed size={14} />
        <h2 className="text-xs font-semibold">{group.label}</h2>
        <span className="text-[11px] text-gray-400">
          {total} {total === 1 ? 'pedido' : 'pedidos'}
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        {group.mesaItems.map((item) => (
          <MesaCard key={item.sessionId} item={item} onClick={() => onOpenMesa(item.sessionId)} />
        ))}
        {group.avulsoItems.map((item) => (
          <AvulsoCard
            key={item.orderId}
            item={item}
            review={reviewsByOrderId[item.orderId]}
            onClick={() => onOpenAvulso(item.orderId)}
          />
        ))}
      </div>
    </div>
  );
}

function MesaCard({ item, onClick }: { item: MesaHistoryEntry; onClick: () => void }) {
  const statusStyle = STATUS_STYLES[item.sessionStatus] ?? {
    label: item.sessionStatus,
    bg: '#F3F4F6',
    color: '#374151',
  };

  return (
    <button onClick={onClick} className="w-full bg-white rounded-2xl p-4 text-left">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-1.5">
          <Table2 size={14} className="text-gray-400" />
          <p className="text-sm font-semibold text-gray-900">{item.tableNumber ?? 'Mesa'}</p>
        </div>
        <span
          className="text-[11px] font-semibold px-2 py-1 rounded-full"
          style={{ backgroundColor: statusStyle.bg, color: statusStyle.color }}
        >
          {statusStyle.label}
        </span>
      </div>
      <p className="text-xs text-gray-400 mt-1.5">
        {formatDateTime(item.dateForGrouping)} · {item.orderCount}{' '}
        {item.orderCount === 1 ? 'pedido feito' : 'pedidos feitos'}
      </p>
      <p className="text-sm font-semibold text-gray-700 mt-2">
        {formatMoney(item.total + item.tipAmount)}
      </p>
    </button>
  );
}

function AvulsoCard({
  item,
  review,
  onClick,
}: {
  item: AvulsoHistoryEntry;
  review: MyReview | undefined;
  onClick: () => void;
}) {
  const statusStyle = STATUS_STYLES[item.status] ?? {
    label: item.status,
    bg: '#F3F4F6',
    color: '#374151',
  };
  const Icon = item.orderType === 'entrega' ? Bike : ShoppingBag;

  return (
    <button onClick={onClick} className="w-full bg-white rounded-2xl p-4 text-left">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-1.5">
          <Icon size={14} className="text-gray-400" />
          <p className="text-sm font-semibold text-gray-900 capitalize">
            {item.orderType === 'entrega' ? 'Entrega' : 'Balcão'}
          </p>
        </div>
        <span
          className="text-[11px] font-semibold px-2 py-1 rounded-full"
          style={{ backgroundColor: statusStyle.bg, color: statusStyle.color }}
        >
          {statusStyle.label}
        </span>
      </div>
      <p className="text-xs text-gray-400 mt-1.5">
        {formatDateTime(item.createdAt)} ·{' '}
        {item.items.map((i) => `${i.quantity}x ${i.productName}`).join(', ')}
      </p>
      <div className="flex items-center justify-between mt-2">
        <p className="text-sm font-semibold text-gray-700">{formatMoney(item.total + item.tipAmount)}</p>
        {review && (
          <span className="flex items-center gap-1 text-xs font-semibold text-amber-600">
            <Star size={13} fill="#F59E0B" className="text-amber-500" />
            {review.rating}
          </span>
        )}
      </div>
    </button>
  );
}
