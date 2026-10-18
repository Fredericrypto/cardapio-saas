import { orderStatusLabel, sessionStatusLabel } from '../i18n/labels';
import { useI18n } from '../i18n/I18nContext';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Table2, ShoppingBag, Bike, Star, ChevronDown, ChevronRight, ReceiptText, CalendarClock, ArrowRight, Calendar, Info, Headset } from 'lucide-react';
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
import { PROMO_SERIF, PROMO_INK, PROMO_SAGE, PROMO_EYEBROW } from '../lib/promotionTheme';

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
      title={t('profile.myOrders')}
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


// Superficies de vidro sobrias (mesmo padrao do perfil e do carrinho).
const GLASS = 'bg-[#FFFFFF]/55 dark:bg-[#161617]/60 backdrop-blur-md border border-[#E5E7EB] dark:border-white/10';
const ICON_GRAY = 'border-[#E5E7EB] bg-black/[0.03] text-[#9CA3AF] dark:border-white/10 dark:bg-white/[0.04] dark:text-[#8E918F]';

function StatusPill({ statusKey, text }: { statusKey: string; text: string }) {
  const st = STATUS_STYLES[statusKey] ?? { bg: '#F3F4F6', color: '#374151' };
  return (
    <span
      className="text-[11px] font-semibold px-3 py-1 rounded-full shrink-0 border"
      style={{ backgroundColor: `${st.color}1F`, color: st.color, borderColor: `${st.color}33` }}
    >
      {text}
    </span>
  );
}

type PaneSelection =
  | { kind: 'mesa'; mesa: MesaHistoryEntry }
  | { kind: 'avulso'; avulso: AvulsoHistoryEntry }
  | null;

// Detalhe do pedido selecionado (desktop). Usa so o que o historico ja carregou.
// O cupom completo abre pela linha "Ver cupom fiscal" (mesma navegacao de sempre).
function OrderDetailPane({
  selected,
  reviewsByOrderId,
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
      <div className={`${GLASS} sticky top-24 rounded-3xl py-16 px-6 flex flex-col items-center gap-3 text-center`}>
        <span className={`flex h-12 w-12 items-center justify-center rounded-full border ${ICON_GRAY}`}>
          <ReceiptText size={22} strokeWidth={1.5} />
        </span>
        <p className={`text-sm ${MENU_TEXT_MUTED}`}>{t('profile.myOrders')}</p>
      </div>
    );
  }

  const mesa = selected.kind === 'mesa' ? selected.mesa : null;
  const avulso = selected.kind === 'avulso' ? selected.avulso : null;
  const statusKey = mesa ? mesa.sessionStatus : avulso!.status;
  const statusText = mesa ? sessionStatusLabel(mesa.sessionStatus, t) : orderStatusLabel(avulso!.status, t);
  const typeLabel = mesa
    ? String(mesa.tableNumber ?? t('receiptContent.mesa'))
    : avulso!.orderType === 'entrega'
      ? t('receiptContentStandalone.entrega')
      : t('receiptContentStandalone.balcao');
  const Icon = mesa ? Table2 : avulso!.orderType === 'entrega' ? Bike : ShoppingBag;
  const when = mesa ? mesa.dateForGrouping : avulso!.createdAt;
  const tip = mesa ? mesa.tipAmount : avulso!.tipAmount;
  const orders = mesa ? mesa.total : avulso!.total;
  const grand = orders + tip;
  const review = avulso ? reviewsByOrderId[avulso.orderId] : undefined;
  const openFull = () => (mesa ? onOpenMesa(mesa.sessionId) : onOpenAvulso(avulso!.orderId));

  return (
    <div className={`${GLASS} sticky top-24 overflow-hidden rounded-3xl`}>
      <div
        className={`max-h-[calc(100vh-8rem)] overflow-y-auto p-6 xl:p-8 flex flex-col gap-6 transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none ${
          shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border ${ICON_GRAY}`}>
              <Icon size={24} strokeWidth={1.5} />
            </span>
            <div className="min-w-0">
              <p className={`text-3xl font-light leading-tight truncate capitalize ${PROMO_INK}`} style={{ fontFamily: PROMO_SERIF }}>
                {typeLabel}
              </p>
              <p className={`mt-1 flex items-center gap-1.5 text-xs ${MENU_TEXT_MUTED}`}>
                <CalendarClock size={13} strokeWidth={1.5} />
                {formatDateTime(when)}
              </p>
            </div>
          </div>
          <StatusPill statusKey={statusKey} text={statusText} />
        </div>

        <div>
          <p className={`${PROMO_EYEBROW} ${MENU_TEXT_MUTED}`}>{t('receiptContent.total')}</p>
          <p className={`mt-2 text-5xl xl:text-6xl font-light tabular-nums ${PROMO_SAGE}`} style={{ fontFamily: PROMO_SERIF }}>
            {formatMoney(grand)}
          </p>
        </div>

        {mesa && (
          <div className={`flex items-center gap-4 rounded-2xl p-4 ${GLASS}`}>
            <span className={`min-w-10 h-10 px-2 rounded-lg flex items-center justify-center text-sm font-semibold tabular-nums border ${ICON_GRAY}`}>
              {mesa.orderCount}
            </span>
            <p className={`text-sm font-medium ${MENU_TEXT_SOFT}`}>
              {mesa.orderCount === 1 ? t('orderHistoryPage.pedido_feito') : t('orderHistoryPage.pedidos_feitos')}
            </p>
          </div>
        )}

        {avulso && avulso.items.length > 0 && (
          <ul className={`flex flex-col divide-y divide-[#E5E7EB] dark:divide-white/10 rounded-2xl overflow-hidden ${GLASS}`}>
            {avulso.items.map((i, idx) => (
              <li key={idx} className="flex items-center gap-4 px-4 py-3.5">
                <span className={`min-w-10 h-8 px-2 rounded-lg flex items-center justify-center text-xs font-semibold tabular-nums border ${ICON_GRAY}`}>
                  {i.quantity}x
                </span>
                <span className={`text-sm min-w-0 break-words ${MENU_TEXT}`}>{i.productName}</span>
              </li>
            ))}
          </ul>
        )}

        <div className={`rounded-2xl p-5 ${GLASS}`}>
          <p className={`text-xl font-light ${PROMO_INK}`} style={{ fontFamily: PROMO_SERIF }}>{t('cartUi.summary')}</p>
          <div className="mt-4 flex flex-col gap-3 text-sm">
            <div className={`flex justify-between ${MENU_TEXT_BODY}`}>
              <span>{t('closingPaymentSheet.subtotal')}</span>
              <span className="tabular-nums">{formatMoney(orders)}</span>
            </div>
            {/* TODO: ligar as taxas de servico quando o historico passar a trazer esse valor. */}
            <div className={`flex justify-between ${MENU_TEXT_BODY}`}>
              <span>{t('orderHistoryPage.fees')}</span>
              <span className="tabular-nums">{formatMoney(0)}</span>
            </div>
            {/* TODO: ligar os descontos (cupom/cashback) quando o historico trouxer esse valor. */}
            <div className={`flex justify-between ${MENU_TEXT_MUTED}`}>
              <span>{t('orderHistoryPage.discounts')}</span>
              <span className="tabular-nums">{formatMoney(0)}</span>
            </div>
            {tip > 0 && (
              <div className={`flex justify-between ${MENU_TEXT_BODY}`}>
                <span>{t('closingPaymentSheet.gorjeta')}</span>
                <span className="tabular-nums">{formatMoney(tip)}</span>
              </div>
            )}
            <div className="flex items-baseline justify-between border-t border-dashed border-[#D1D5DB] pt-3 dark:border-white/15">
              <span className={`text-xs uppercase tracking-wider ${MENU_TEXT_SOFT}`}>{t('receiptContent.total')}</span>
              <span className={`text-2xl font-light tabular-nums ${PROMO_SAGE}`} style={{ fontFamily: PROMO_SERIF }}>{formatMoney(grand)}</span>
            </div>
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

        <Tooltip label={t('orderHistoryPage.viewReceipt')} className="flex w-full">
          <button
            onClick={openFull}
            className={`glass-hover w-full flex items-center gap-4 rounded-2xl px-4 py-4 text-left ${GLASS}`}
          >
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${ICON_GRAY}`}>
              <ReceiptText size={18} strokeWidth={1.5} />
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block text-base ${PROMO_INK}`} style={{ fontFamily: PROMO_SERIF }}>{t('orderHistoryPage.viewReceipt')}</span>
              <span className={`block text-xs ${MENU_TEXT_MUTED}`}>{t('orderHistoryPage.viewReceiptHint')}</span>
            </span>
            <ArrowRight size={18} strokeWidth={1.5} className={`shrink-0 ${MENU_TEXT_MUTED}`} />
          </button>
        </Tooltip>

        <div className={`flex flex-wrap items-center gap-4 rounded-2xl px-4 py-4 ${GLASS}`}>
          <Info size={18} strokeWidth={1.5} className={`shrink-0 ${MENU_TEXT_MUTED}`} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className={`text-sm ${MENU_TEXT}`}>{t('orderHistoryPage.supportQuestion')}</p>
            <p className={`text-xs ${MENU_TEXT_MUTED}`}>{t('orderHistoryPage.supportHint')}</p>
          </div>
          {/* TODO: ligar a acao de suporte (abrir contato/chat do restaurante). */}
          <button
            type="button"
            className={`glass-hover inline-flex items-center gap-2 rounded-full border border-[#E5E7EB] px-4 py-2 text-xs font-medium dark:border-white/10 ${MENU_TEXT_SOFT}`}
          >
            <Headset size={15} strokeWidth={1.5} aria-hidden="true" />
            {t('orderHistoryPage.supportAction')}
          </button>
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
    <div className="flex flex-col gap-3">
      <Tooltip label={toggleLabel} className="flex w-full">
        <button onClick={onToggle} aria-expanded={!collapsed} aria-label={toggleLabel} className="w-full flex items-center gap-2 px-1">
          <Calendar size={14} strokeWidth={1.5} className={PROMO_SAGE} />
          <h2 className={`text-xs font-semibold uppercase tracking-wider ${PROMO_SAGE}`}>{group.label}</h2>
          <span className={`text-[11px] ${MENU_TEXT_MUTED} flex-1 text-right`}>
            {total} {total === 1 ? 'pedido' : 'pedidos'}
          </span>
          <ChevronDown size={14} strokeWidth={1.5} className={`${MENU_TEXT_MUTED} transition-transform ${collapsed ? '-rotate-90' : ''}`} />
        </button>
      </Tooltip>

      <div className={`flex flex-col gap-2.5 ${collapsed ? 'hidden' : ''}`}>
        {group.mesaItems.map((item) => (
          <OrderCard
            key={item.sessionId}
            selected={selectedId === item.sessionId}
            accent={accent}
            onClick={() => onOpenMesa(item.sessionId)}
            Icon={Table2}
            title={String(item.tableNumber ?? t('receiptContent.mesa'))}
            meta={`${formatDateTime(item.dateForGrouping)} · ${item.orderCount} ${
              item.orderCount === 1 ? t('orderHistoryPage.pedido_feito') : t('orderHistoryPage.pedidos_feitos')
            }`}
            amount={formatMoney(item.total + item.tipAmount)}
            statusKey={item.sessionStatus}
            statusText={sessionStatusLabel(item.sessionStatus, t)}
          />
        ))}
        {group.avulsoItems.map((item) => {
          const review = reviewsByOrderId[item.orderId];
          const typeLabel = item.orderType === 'entrega' ? t('receiptContentStandalone.entrega') : t('receiptContentStandalone.balcao');
          return (
            <OrderCard
              key={item.orderId}
              selected={selectedId === item.orderId}
              accent={accent}
              onClick={() => onOpenAvulso(item.orderId)}
              Icon={item.orderType === 'entrega' ? Bike : ShoppingBag}
              title={typeLabel}
              meta={`${formatDateTime(item.createdAt)} · ${item.items.map((i) => `${i.quantity}x ${i.productName}`).join(', ')}`}
              amount={formatMoney(item.total + item.tipAmount)}
              statusKey={item.status}
              statusText={orderStatusLabel(item.status, t)}
              rating={review?.rating}
            />
          );
        })}
      </div>
    </div>
  );
}

// Cartao de pedido da lista (mesa ou avulso): vidro, icone cinza, valor em verde salvia.
function OrderCard({
  selected,
  accent,
  onClick,
  Icon,
  title,
  meta,
  amount,
  statusKey,
  statusText,
  rating,
}: {
  selected: boolean;
  accent: string;
  onClick: () => void;
  Icon: typeof Table2;
  title: string;
  meta: string;
  amount: string;
  statusKey: string;
  statusText: string;
  rating?: number;
}) {
  return (
    <Tooltip label={title} className="flex w-full">
      <button
        onClick={onClick}
        aria-pressed={selected}
        className={`relative w-full ${GLASS} rounded-2xl p-4 text-left cursor-pointer md:transition-colors md:hover:bg-black/[0.02] dark:md:hover:bg-white/[0.03]`}
        style={selected ? { borderColor: accent } : undefined}
      >
        <div className="flex items-center gap-4">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border ${ICON_GRAY}`}>
            <Icon size={19} strokeWidth={1.5} />
          </span>
          <div className="min-w-0 flex-1">
            <p className={`text-lg leading-tight capitalize ${PROMO_INK}`} style={{ fontFamily: PROMO_SERIF }}>{title}</p>
            <p className={`mt-0.5 text-xs break-words ${MENU_TEXT_MUTED}`}>{meta}</p>
            <p className={`mt-1 text-sm font-semibold tabular-nums ${PROMO_SAGE}`}>{amount}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {rating != null && (
              <span className="flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-300">
                <Star size={13} strokeWidth={1.5} fill="#F59E0B" className="text-amber-500" />
                {rating}
              </span>
            )}
            <StatusPill statusKey={statusKey} text={statusText} />
            <ChevronRight size={16} strokeWidth={1.5} className={MENU_TEXT_MUTED} />
          </div>
        </div>
      </button>
    </Tooltip>
  );
}
