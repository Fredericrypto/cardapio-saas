import { orderStatusLabel, sessionStatusLabel } from '../i18n/labels';
import { useI18n } from '../i18n/I18nContext';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Table2, ShoppingBag, Bike, FolderClosed, Star, ChevronDown, ChevronRight, ReceiptText, CalendarClock, ArrowRight } from 'lucide-react';
import { useDesktopLayout } from '../lib/useDesktopLayout';
import type { Tenant } from '../types';
import { identityOf } from '../lib/identity';
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
import { ProfileSubpageShell } from '../components/ProfileSubpageShell';
import { Tooltip } from '../components/Tooltip';
import { MENU_PAGE_BG, MENU_TEXT, MENU_TEXT_SOFT, MENU_TEXT_BODY, MENU_TEXT_MUTED } from '../lib/menuTheme';
import { PROFILE_CARD, PROFILE_CARD_GLASS, PROFILE_BTN_PRIMARY } from '../lib/profileTheme';

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  aguardando_pagamento: { bg: '#FFEDD5', color: '#C2410C' },
  pendente: { bg: '#FEF3C7', color: '#B45309' },
  confirmado: { bg: '#DBEAFE', color: '#1D4ED8' },
  preparando: { bg: '#DBEAFE', color: '#1D4ED8' },
  pronto: { bg: '#DCFCE7', color: '#15803D' },
  entregue: { bg: '#DCFCE7', color: '#15803D' },
  cancelado: { bg: '#FEE2E2', color: '#B91C1C' },
  aberta: { bg: '#DBEAFE', color: '#1D4ED8' },
  fechamento_solicitado: { bg: '#FEF3C7', color: '#B45309' },
  fechada: { bg: '#DCFCE7', color: '#15803D' },
};

// Histórico completo — organizado por data (Hoje/Ontem/data), com pedidos
// de mesa agrupados por visita (sessão) e pedidos avulsos (balcão/entrega)
// cada um na sua própria linha, igual ao histórico do painel do admin.
export function OrderHistoryPage() {
  const { t } = useI18n();
  const { slug } = useParams<{ slug: string }>();
  const { tenant } = useTenant();
  const isDesktop = useDesktopLayout();

  const { token, isLoading: isLoadingAuth } = useCustomerAuth();

  if (!tenant || isLoadingAuth) {
    return (
      <div className={`flex items-center justify-center h-screen ${MENU_PAGE_BG}`}>
        <div className="w-8 h-8 border-2 border-gray-200 dark:border-white/10 border-t-gray-500 dark:border-t-gray-300 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <ProfileSubpageShell
      tenant={tenant}
      title={t('orderHistoryPage.historico_de_pedidos')}
      // No desktop o histórico É a tela de pedidos (lista + detalhe lado a
      // lado): não existe mais o degrau intermediário, voltar vai ao perfil.
      backTo={isDesktop ? `/${slug}/conta-cliente/perfil` : `/${slug}/conta-cliente/pedidos`}
      bottomNav
    >
      <OrderHistoryWorkspace tenant={tenant} token={token} slug={slug!} />
    </ProfileSubpageShell>
  );
}

// Conteúdo do histórico. Abaixo de `lg` é exatamente a lista de antes (tocar
// num pedido abre a sub-tela). A partir de `lg` vira Master-Detail: lista à
// esquerda e o detalhe do pedido selecionado ao lado, na mesma página.
export function OrderHistoryWorkspace({
  tenant,
  token,
  slug,
}: {
  tenant: Tenant;
  token: string | null;
  slug: string;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const isDesktop = useDesktopLayout();
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

  // Datas recolhidas (cada dia minimiza separadamente, igual às categorias
  // de "Todos"). Persiste no aparelho — sobrevive a sair do perfil e a
  // fechar o app — por conta e por loja (02/10).
  const collapseKey = tenant ? `historico_recolhido_${identityOf(token)}_${tenant.id}` : null;
  const [collapsedDays, setCollapsedDays] = useState<string[]>([]);
  useEffect(() => {
    if (!collapseKey) return;
    try {
      const raw = localStorage.getItem(collapseKey);
      setCollapsedDays(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      setCollapsedDays([]);
    }
  }, [collapseKey]);
  function toggleDay(dateKey: string) {
    setCollapsedDays((prev) => {
      const next = prev.includes(dateKey) ? prev.filter((k) => k !== dateKey) : [...prev, dateKey];
      try {
        if (collapseKey) localStorage.setItem(collapseKey, JSON.stringify(next));
      } catch {
        // armazenamento bloqueado: continua funcionando nesta visita
      }
      return next;
    });
  }

  const isEmpty = useMemo(
    () => !isLoadingOrders && (dayGroups?.length ?? 0) === 0,
    [isLoadingOrders, dayGroups],
  );

  const openMesa = (sessionId: string) => navigate(`/${slug}/conta-cliente/pedidos/mesa/${sessionId}`);
  const openAvulso = (orderId: string) => navigate(`/${slug}/conta-cliente/pedidos/avulso/${orderId}`);

  // Seleção do detalhe (só desktop). Sem escolha explícita vale o primeiro
  // pedido da lista, para o painel nunca nascer vazio.
  const [selection, setSelection] = useState<{ kind: 'mesa' | 'avulso'; id: string } | null>(null);
  const selected = useMemo(() => {
    const mesaItems = dayGroups?.flatMap((g) => g.mesaItems) ?? [];
    const avulsoItems = dayGroups?.flatMap((g) => g.avulsoItems) ?? [];
    if (selection?.kind === 'mesa') {
      const hit = mesaItems.find((m) => m.sessionId === selection.id);
      if (hit) return { kind: 'mesa' as const, mesa: hit };
    }
    if (selection?.kind === 'avulso') {
      const hit = avulsoItems.find((a) => a.orderId === selection.id);
      if (hit) return { kind: 'avulso' as const, avulso: hit };
    }
    const firstGroup = dayGroups?.find((g) => g.mesaItems.length + g.avulsoItems.length > 0);
    if (firstGroup?.mesaItems[0]) return { kind: 'mesa' as const, mesa: firstGroup.mesaItems[0] };
    if (firstGroup?.avulsoItems[0]) return { kind: 'avulso' as const, avulso: firstGroup.avulsoItems[0] };
    return null;
  }, [dayGroups, selection]);
  const selectedId =
    selected?.kind === 'mesa' ? selected.mesa.sessionId : selected?.kind === 'avulso' ? selected.avulso.orderId : null;

  const list = (
    <div className={`flex flex-col gap-5 ${isDesktop ? '' : 'max-w-3xl'}`}>
      {isLoadingOrders && <p className={`text-xs ${MENU_TEXT_MUTED} px-1`}>{t('common.loading')}</p>}
      {isEmpty && (
        <p className={`text-xs ${MENU_TEXT_MUTED} px-1`}>{t('orderHistoryPage.voce_ainda_nao_fez')}</p>
      )}

      {dayGroups?.map((group) => (
        <DayFolder
          key={group.dateKey}
          group={group}
          collapsed={collapsedDays.includes(group.dateKey)}
          onToggle={() => toggleDay(group.dateKey)}
          reviewsByOrderId={reviewsByOrderId}
          accent={tenant.primaryColor}
          selectedId={isDesktop ? selectedId : null}
          onOpenMesa={(sessionId) => (isDesktop ? setSelection({ kind: 'mesa', id: sessionId }) : openMesa(sessionId))}
          onOpenAvulso={(orderId) => (isDesktop ? setSelection({ kind: 'avulso', id: orderId }) : openAvulso(orderId))}
        />
      ))}
    </div>
  );

  if (!isDesktop) return list;

  return (
    <div className="grid grid-cols-[minmax(340px,440px)_minmax(0,1fr)] xl:grid-cols-[minmax(380px,480px)_minmax(0,1fr)] gap-8 items-start">
      {list}
      <OrderDetailPane
        selected={selected}
        reviewsByOrderId={reviewsByOrderId}
        accent={tenant.primaryColor}
        onOpenMesa={openMesa}
        onOpenAvulso={openAvulso}
      />
    </div>
  );
}

type PaneSelection =
  | { kind: 'mesa'; mesa: MesaHistoryEntry }
  | { kind: 'avulso'; avulso: AvulsoHistoryEntry }
  | null;

// Detalhe do pedido selecionado (desktop). Usa só o que o histórico já
// carregou — nenhuma chamada nova. O cupom completo abre pelo botão de largura
// total no rodapé do painel (a navegação é a mesma de sempre).
function OrderDetailPane({
  selected,
  reviewsByOrderId,
  accent,
  onOpenMesa,
  onOpenAvulso,
}: {
  selected: PaneSelection;
  reviewsByOrderId: Record<string, MyReview>;
  accent: string;
  onOpenMesa: (sessionId: string) => void;
  onOpenAvulso: (orderId: string) => void;
}) {
  const { t } = useI18n();

  const paneId = selected ? (selected.kind === 'mesa' ? selected.mesa.sessionId : selected.avulso.orderId) : null;

  // Transição suave a cada troca de pedido: o conteúdo reentra com fade +
  // deslize curto (dois quadros para o navegador pintar o estado inicial).
  const [shown, setShown] = useState(false);
  useEffect(() => {
    setShown(false);
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setShown(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [paneId]);

  if (!selected) {
    return (
      <div className={`${PROFILE_CARD_GLASS} sticky top-24 py-16 px-6 flex flex-col items-center gap-3 text-center`}>
        <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-black/5 dark:bg-white/10">
          <ReceiptText size={22} strokeWidth={1.5} className={MENU_TEXT_MUTED} />
        </div>
        <p className={`text-sm ${MENU_TEXT_MUTED}`}>{t('profile.myOrders')}</p>
      </div>
    );
  }

  const mesa = selected.kind === 'mesa' ? selected.mesa : null;
  const avulso = selected.kind === 'avulso' ? selected.avulso : null;

  const statusKey = mesa ? mesa.sessionStatus : avulso!.status;
  const statusStyle = STATUS_STYLES[statusKey] ?? { bg: '#F3F4F6', color: '#374151' };
  const statusText = mesa ? sessionStatusLabel(mesa.sessionStatus, t) : orderStatusLabel(avulso!.status, t);
  const typeLabel = mesa
    ? String(mesa.tableNumber ?? t('receiptContent.mesa'))
    : avulso!.orderType === 'entrega'
      ? t('receiptContentStandalone.entrega')
      : t('receiptContentStandalone.balcao');
  const Icon = mesa ? Table2 : avulso!.orderType === 'entrega' ? Bike : ShoppingBag;
  const when = mesa ? mesa.dateForGrouping : avulso!.createdAt;
  const tip = mesa ? mesa.tipAmount : avulso!.tipAmount;
  const grand = mesa ? mesa.total + mesa.tipAmount : avulso!.total + avulso!.tipAmount;
  const review = avulso ? reviewsByOrderId[avulso.orderId] : undefined;
  const refCode = String(paneId).replace(/-/g, '').slice(0, 6).toUpperCase();
  const openFull = () => (mesa ? onOpenMesa(mesa.sessionId) : onOpenAvulso(avulso!.orderId));

  return (
    <div className={`${PROFILE_CARD} sticky top-24 overflow-hidden shadow-sm`}>
      <div
        className={`max-h-[calc(100vh-8rem)] overflow-y-auto transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none ${
          shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
        }`}
      >
        {/* Cabeçalho + total em destaque, com um véu da cor do restaurante. */}
        <div
          className="p-6 xl:p-8"
          style={{ background: `linear-gradient(135deg, ${accent}26 0%, ${accent}0D 55%, transparent 100%)` }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border border-black/5 dark:border-white/10"
                style={{ backgroundColor: `${accent}26` }}
              >
                <Icon size={22} strokeWidth={1.5} className={MENU_TEXT} />
              </div>
              <div className="min-w-0">
                <p className={`font-display text-xl font-bold ${MENU_TEXT} truncate capitalize`}>{typeLabel}</p>
                <p className={`flex items-center gap-1.5 text-xs ${MENU_TEXT_MUTED} mt-1`}>
                  <CalendarClock size={14} strokeWidth={1.5} />
                  {formatDateTime(when)}
                </p>
              </div>
            </div>
            <span
              className="text-[11px] font-semibold px-3 py-1.5 rounded-full shrink-0"
              style={{ backgroundColor: statusStyle.bg, color: statusStyle.color }}
            >
              {statusText}
            </span>
          </div>

          <div className="mt-7">
            <p className={`text-[11px] font-semibold uppercase tracking-wider ${MENU_TEXT_MUTED}`}>
              {t('receiptContent.total')}
            </p>
            <p className={`font-display text-4xl xl:text-5xl font-bold tabular-nums ${MENU_TEXT} mt-1.5`}>
              {formatMoney(grand)}
            </p>
          </div>
        </div>

        <div className="p-6 xl:p-8 flex flex-col gap-6">
          {mesa && (
            <div className="flex items-center gap-4 rounded-2xl border border-[#E5E7EB] dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.04] p-4">
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center font-display text-xl font-bold tabular-nums shrink-0 ${MENU_TEXT}`}
                style={{ backgroundColor: `${accent}1F` }}
              >
                {mesa.orderCount}
              </div>
              <p className={`text-sm font-medium ${MENU_TEXT_SOFT}`}>
                {mesa.orderCount === 1 ? t('orderHistoryPage.pedido_feito') : t('orderHistoryPage.pedidos_feitos')}
              </p>
            </div>
          )}

          {avulso && avulso.items.length > 0 && (
            <ul className="flex flex-col divide-y divide-[#F3F4F6] dark:divide-white/10 rounded-2xl border border-[#E5E7EB] dark:border-white/10 overflow-hidden">
              {avulso.items.map((i, idx) => (
                <li key={idx} className="flex items-center gap-3.5 px-4 py-3">
                  <span
                    className={`min-w-9 h-9 px-2 rounded-lg flex items-center justify-center text-xs font-bold tabular-nums shrink-0 ${MENU_TEXT}`}
                    style={{ backgroundColor: `${accent}1F` }}
                  >
                    {i.quantity}x
                  </span>
                  <span className={`text-sm font-medium min-w-0 break-words ${MENU_TEXT}`}>{i.productName}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Totais em formato de cupom. */}
          <div className="rounded-2xl border border-dashed border-[#D1D5DB] dark:border-white/15 p-5 flex flex-col gap-3">
            {tip > 0 && (
              <div className={`flex justify-between text-sm ${MENU_TEXT_BODY}`}>
                <span>{t('closingPaymentSheet.gorjeta')}</span>
                <span className="tabular-nums">{formatMoney(tip)}</span>
              </div>
            )}
            <div className={`flex justify-between items-baseline font-display font-bold ${MENU_TEXT}`}>
              <span>{t('receiptContent.total')}</span>
              <span className="text-xl tabular-nums">{formatMoney(grand)}</span>
            </div>
          </div>

          {review && (
            <div className="flex items-center gap-2" aria-label={String(review.rating)}>
              <div className="flex items-center gap-0.5">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <Star
                    key={idx}
                    size={18}
                    strokeWidth={1.5}
                    fill={idx < Math.round(review.rating) ? '#F59E0B' : 'none'}
                    className={idx < Math.round(review.rating) ? 'text-amber-500' : MENU_TEXT_MUTED}
                  />
                ))}
              </div>
              <span className="text-sm font-semibold text-amber-600 dark:text-amber-300 tabular-nums">{review.rating}</span>
            </div>
          )}

          <Tooltip label={typeLabel} className="flex w-full">
            <button
              onClick={openFull}
              className={`w-full flex items-center justify-between gap-3 rounded-xl px-5 py-3.5 text-sm ${PROFILE_BTN_PRIMARY}`}
              style={{ backgroundColor: accent }}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <ReceiptText size={18} strokeWidth={1.5} className="shrink-0" />
                <span className="truncate">
                  {t('receiptContentStandalone.ref')} #{refCode}
                </span>
              </span>
              <ArrowRight size={18} strokeWidth={1.5} className="shrink-0" />
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

function DayFolder({
  group,
  collapsed,
  onToggle,
  reviewsByOrderId,
  accent,
  selectedId,
  onOpenMesa,
  onOpenAvulso,
}: {
  group: DayGroup;
  collapsed: boolean;
  onToggle: () => void;
  reviewsByOrderId: Record<string, MyReview>;
  accent: string;
  // Id do pedido destacado (só no Master-Detail do desktop).
  selectedId: string | null;
  onOpenMesa: (sessionId: string) => void;
  onOpenAvulso: (orderId: string) => void;
}) {
  const { t } = useI18n();
  const total = group.mesaItems.length + group.avulsoItems.length;
  const toggleLabel = collapsed
    ? t('orderHistoryPage.mostrar_pedidos_de_label', { label: group.label })
    : t('orderHistoryPage.esconder_pedidos_de_label', { label: group.label });

  return (
    <div className="flex flex-col gap-2.5">
      {/* Mesmo cabeçalho das categorias do cardápio: ícone, nome e seta de
          recolher/expandir. */}
      <Tooltip label={toggleLabel} className="flex w-full">
        <button
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={toggleLabel}
          className={`w-full flex items-center gap-2 px-1 ${MENU_TEXT_SOFT}`}
        >
          <FolderClosed size={16} strokeWidth={1.5} />
          <h2 className="text-sm font-semibold">{group.label}</h2>
          <span className={`text-[11px] ${MENU_TEXT_MUTED} flex-1 text-left`}>
            {total} {total === 1 ? 'pedido' : 'pedidos'}
          </span>
          <ChevronDown
            size={16}
            strokeWidth={1.5}
            className={`${MENU_TEXT_MUTED} transition-transform ${collapsed ? '-rotate-90' : ''}`}
          />
        </button>
      </Tooltip>

      <div className={`flex flex-col gap-2.5 ${collapsed ? 'hidden' : ''}`}>
        {group.mesaItems.map((item) => (
          <MesaCard
            key={item.sessionId}
            item={item}
            selected={selectedId === item.sessionId}
            accent={accent}
            onClick={() => onOpenMesa(item.sessionId)}
          />
        ))}
        {group.avulsoItems.map((item) => (
          <AvulsoCard
            key={item.orderId}
            item={item}
            review={reviewsByOrderId[item.orderId]}
            selected={selectedId === item.orderId}
            accent={accent}
            onClick={() => onOpenAvulso(item.orderId)}
          />
        ))}
      </div>
    </div>
  );
}

function MesaCard({
  item,
  selected,
  accent,
  onClick,
}: {
  item: MesaHistoryEntry;
  selected: boolean;
  accent: string;
  onClick: () => void;
}) {
  const { t } = useI18n();
  const statusStyle = STATUS_STYLES[item.sessionStatus] ?? {
    bg: '#F3F4F6',
    color: '#374151',
  };

  return (
    <Tooltip label={String(item.tableNumber ?? t('receiptContent.mesa'))} className="flex w-full">
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={`relative w-full ${PROFILE_CARD} p-4 text-left cursor-pointer overflow-hidden md:hover:bg-black/[0.02] dark:md:hover:bg-white/[0.03] md:transition-all md:duration-200`}
      style={selected ? { borderColor: accent, backgroundColor: `${accent}12` } : undefined}
    >
      {selected && (
        <span className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: accent }} aria-hidden="true" />
      )}
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-1.5">
          <Table2 size={14} strokeWidth={1.5} className={MENU_TEXT_MUTED} />
          <p className={`text-sm font-semibold ${MENU_TEXT}`}>{item.tableNumber ?? t('receiptContent.mesa')}</p>
        </div>
        <span
          className="text-[11px] font-semibold px-2 py-1 rounded-full"
          style={{ backgroundColor: statusStyle.bg, color: statusStyle.color }}
        >
          {sessionStatusLabel(item.sessionStatus, t)}
        </span>
      </div>
      <p className={`text-xs ${MENU_TEXT_MUTED} mt-1.5`}>
        {formatDateTime(item.dateForGrouping)} · {item.orderCount}{' '}
        {item.orderCount === 1 ? t('orderHistoryPage.pedido_feito') : t('orderHistoryPage.pedidos_feitos')}
      </p>
      <div className="flex items-center justify-between mt-2">
        <p className={`text-sm font-semibold ${MENU_TEXT_BODY}`}>{formatMoney(item.total + item.tipAmount)}</p>
        <ChevronRight
          size={16}
          strokeWidth={1.5}
          className={`${MENU_TEXT_MUTED} transition-transform ${selected ? 'translate-x-0.5' : ''}`}
        />
      </div>
    </button>
    </Tooltip>
  );
}

function AvulsoCard({
  item,
  review,
  selected,
  accent,
  onClick,
}: {
  item: AvulsoHistoryEntry;
  review: MyReview | undefined;
  selected: boolean;
  accent: string;
  onClick: () => void;
}) {
  const { t } = useI18n();
  const statusStyle = STATUS_STYLES[item.status] ?? {
    bg: '#F3F4F6',
    color: '#374151',
  };
  const Icon = item.orderType === 'entrega' ? Bike : ShoppingBag;
  const typeLabel = item.orderType === 'entrega' ? t('receiptContentStandalone.entrega') : t('receiptContentStandalone.balcao');

  return (
    <Tooltip label={typeLabel} className="flex w-full">
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={`relative w-full ${PROFILE_CARD} p-4 text-left cursor-pointer overflow-hidden md:hover:bg-black/[0.02] dark:md:hover:bg-white/[0.03] md:transition-all md:duration-200`}
      style={selected ? { borderColor: accent, backgroundColor: `${accent}12` } : undefined}
    >
      {selected && (
        <span className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: accent }} aria-hidden="true" />
      )}
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-1.5">
          <Icon size={14} strokeWidth={1.5} className={MENU_TEXT_MUTED} />
          <p className={`text-sm font-semibold ${MENU_TEXT} capitalize`}>
            {typeLabel}
          </p>
        </div>
        <span
          className="text-[11px] font-semibold px-2 py-1 rounded-full"
          style={{ backgroundColor: statusStyle.bg, color: statusStyle.color }}
        >
          {orderStatusLabel(item.status, t)}
        </span>
      </div>
      <p className={`text-xs ${MENU_TEXT_MUTED} mt-1.5`}>
        {formatDateTime(item.createdAt)} ·{' '}
        {item.items.map((i) => `${i.quantity}x ${i.productName}`).join(', ')}
      </p>
      <div className="flex items-center justify-between mt-2">
        <p className={`text-sm font-semibold ${MENU_TEXT_BODY}`}>{formatMoney(item.total + item.tipAmount)}</p>
        <div className="flex items-center gap-2">
          {review && (
            <span className="flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-300">
              <Star size={13} strokeWidth={1.5} fill="#F59E0B" className="text-amber-500" />
              {review.rating}
            </span>
          )}
          <ChevronRight
            size={16}
            strokeWidth={1.5}
            className={`${MENU_TEXT_MUTED} transition-transform ${selected ? 'translate-x-0.5' : ''}`}
          />
        </div>
      </div>
    </button>
    </Tooltip>
  );
}
