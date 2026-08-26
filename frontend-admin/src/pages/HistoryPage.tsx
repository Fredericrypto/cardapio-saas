import { useMemo, useState } from 'react';
import { History, Flag, ShoppingBag, Bike, Table2, Search, FolderClosed, Gift } from 'lucide-react';
import { usePolling } from '../hooks/usePolling';
import {
  fetchHistory,
  searchHistoryArchive,
  setHistorySessionFlagged,
  setHistoryOrderFlagged,
  fetchCashbackCreditHistory,
  fetchCashbackConsumptionHistory,
  fetchCashbackTotals,
  fetchFidelityHistory,
} from '../lib/admin-api';
import { HistoryReceiptModal } from '../components/HistoryReceiptModal';
import type { HistorySessionEntry, HistoryOrderEntry, HistoryResponse } from '../types';

type ReceiptItem =
  | { kind: 'mesa'; entry: HistorySessionEntry; timestamp: string }
  | { kind: 'avulso'; entry: HistoryOrderEntry; timestamp: string };

interface DayGroup {
  dateKey: string;
  label: string;
  mesaItems: Extract<ReceiptItem, { kind: 'mesa' }>[];
  avulsoItems: Extract<ReceiptItem, { kind: 'avulso' }>[];
}

function formatMoney(value: number): string {
  return `R$ ${Number(value).toFixed(2).replace('.', ',')}`;
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dayKeyAndLabel(dateStr: string): { key: string; label: string } {
  const d = new Date(dateStr);
  const key = d.toISOString().slice(0, 10);
  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);

  if (isSameDay(d, now)) return { key, label: 'Hoje' };
  if (isSameDay(d, yesterday)) return { key, label: 'Ontem' };
  return {
    key,
    label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
  };
}

function searchableText(item: ReceiptItem): string {
  const label =
    item.kind === 'mesa'
      ? item.entry.tableNumber ?? 'mesa'
      : item.entry.orderType === 'entrega'
        ? 'entrega'
        : 'balcão balcao';
  const customerName = item.entry.customerName ?? '';
  const d = new Date(item.timestamp);
  const dateVariants = [
    d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    d.toLocaleDateString('pt-BR', { month: 'long' }),
  ].join(' ');
  return `${label} ${customerName} ${dateVariants}`.toLowerCase();
}

function getExpirationLabel(expiresAt: string | null): { label: string; isUrgent: boolean } | null {
  if (!expiresAt) return null;
  const msRemaining = new Date(expiresAt).getTime() - Date.now();
  if (msRemaining <= 0) return { label: 'expira a qualquer momento', isUrgent: true };

  const hoursRemaining = msRemaining / (1000 * 60 * 60);
  const daysRemaining = msRemaining / (1000 * 60 * 60 * 24);
  const isUrgent = daysRemaining <= 7;

  if (daysRemaining <= 1) {
    const h = Math.max(1, Math.ceil(hoursRemaining));
    return { label: `expira em ${h}h`, isUrgent };
  }
  const dRounded = Math.ceil(daysRemaining);
  return { label: `expira em ${dRounded} dias`, isUrgent };
}

export function HistoryPage() {
  const [tab, setTab] = useState<'pedidos' | 'cashback' | 'fidelidade'>('pedidos');

  return (
    <div className="p-6 max-w-5xl mx-auto flex flex-col gap-5">
      <div className="flex items-center gap-2.5">
        <History size={22} className="text-gray-700" />
        <div>
          <h1 className="font-display font-bold text-lg text-gray-900">Histórico</h1>
          <p className="text-xs text-gray-400">
            Cupons de contas fechadas, cashback e carimbos de fidelidade.
          </p>
        </div>
      </div>

      <div className="flex gap-1.5 border-b border-gray-100">
        {(
          [
            { key: 'pedidos', label: 'Pedidos' },
            { key: 'cashback', label: 'Cashback' },
            { key: 'fidelidade', label: 'Fidelidade' },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3.5 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'pedidos' && <OrdersHistoryTab />}
      {tab === 'cashback' && <CashbackHistoryTab />}
      {tab === 'fidelidade' && <FidelityHistoryTab />}
    </div>
  );
}

function groupItemsByDay(items: ReceiptItem[]): DayGroup[] {
  const groupsByKey = new Map<string, DayGroup>();
  for (const item of items) {
    if (!item.timestamp) continue;
    const { key, label } = dayKeyAndLabel(item.timestamp);
    let group = groupsByKey.get(key);
    if (!group) {
      group = { dateKey: key, label, mesaItems: [], avulsoItems: [] };
      groupsByKey.set(key, group);
    }
    if (item.kind === 'mesa') group.mesaItems.push(item);
    else group.avulsoItems.push(item);
  }
  return Array.from(groupsByKey.values());
}

function OrdersHistoryTab() {
  const { data, isLoading, error, refetch } = usePolling(fetchHistory, 60000);
  const [openReceipt, setOpenReceipt] = useState<ReceiptItem | null>(null);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const sessions = data?.sessions ?? [];
  const standaloneOrders = data?.standaloneOrders ?? [];
  const isEmpty = !isLoading && !error && sessions.length === 0 && standaloneOrders.length === 0;

  const allItems: ReceiptItem[] = useMemo(
    () =>
      [
        ...sessions.map((entry): ReceiptItem => ({
          kind: 'mesa',
          entry,
          timestamp: entry.closedAt ?? '',
        })),
        ...standaloneOrders.map((entry): ReceiptItem => ({
          kind: 'avulso',
          entry,
          timestamp: entry.createdAt,
        })),
      ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [sessions, standaloneOrders],
  );

  const normalizedQuery = query.trim().toLowerCase();
  const filteredItems = normalizedQuery
    ? allItems.filter((item) => searchableText(item).includes(normalizedQuery))
    : allItems;

  const dayGroups: DayGroup[] = useMemo(() => groupItemsByDay(filteredItems), [filteredItems]);

  const noSearchResults = !isLoading && !error && !isEmpty && dayGroups.length === 0;

  async function handleToggleFlag(item: ReceiptItem, event: React.MouseEvent) {
    event.stopPropagation();
    const key = item.kind === 'mesa' ? item.entry.sessionId : item.entry.orderId;
    setTogglingKey(key);
    try {
      if (item.kind === 'mesa') {
        await setHistorySessionFlagged(item.entry.sessionId, !item.entry.flagged);
      } else {
        await setHistoryOrderFlagged(item.entry.orderId, !item.entry.flagged);
      }
      await refetch();
    } finally {
      setTogglingKey(null);
    }
  }

  return (
    <div className="flex flex-col gap-5 pt-1">
      <p className="text-xs text-gray-400 -mt-2">
        Cupons de contas fechadas e pedidos finalizados. Somem automaticamente depois de 30 dias —
        não é possível excluir manualmente.
      </p>

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por mesa, cliente, data ou hora..."
          className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-gray-200 outline-none focus:border-gray-400"
        />
      </div>

      {isLoading && <p className="text-sm text-gray-400 py-8 text-center">Carregando...</p>}

      {!isLoading && Boolean(error) && (
        <p className="text-sm text-red-500 py-8 text-center">
          Não foi possível carregar o histórico. Verifique se o backend está rodando e tente
          novamente.
        </p>
      )}

      {isEmpty && (
        <p className="text-sm text-gray-400 py-12 text-center">
          Nenhum cupom ainda. Contas fechadas e pedidos finalizados aparecerão aqui.
        </p>
      )}

      {noSearchResults && (
        <p className="text-sm text-gray-400 py-12 text-center">
          Nenhum cupom encontrado para "{query}".
        </p>
      )}

      <div className="flex flex-col gap-6">
        {dayGroups.map((group) => (
          <DayFolder
            key={group.dateKey}
            group={group}
            togglingKey={togglingKey}
            onOpen={setOpenReceipt}
            onToggleFlag={handleToggleFlag}
          />
        ))}
      </div>

      {openReceipt && (
        <HistoryReceiptModal
          target={
            openReceipt.kind === 'mesa'
              ? { kind: 'mesa', entry: openReceipt.entry }
              : { kind: 'avulso', entry: openReceipt.entry }
          }
          onClose={() => setOpenReceipt(null)}
        />
      )}

      <ArchiveSearchPanel onOpenReceipt={setOpenReceipt} />
    </div>
  );
}

// Cupons somem da lista de cima depois de 30 dias, mas continuam
// existindo no banco (soft-delete — nunca apagamos dado financeiro de
// verdade). Esse painel busca DIRETO no arquivo, incluindo os já
// escondidos, pra nunca deixar o estabelecimento sem acesso a um cupom
// antigo se precisar (disputa de cliente, conferência, imposto). Exige
// nome do cliente OU um intervalo de datas — nunca lista "tudo desde o
// início" de uma vez.
function ArchiveSearchPanel({ onOpenReceipt }: { onOpenReceipt: (item: ReceiptItem) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [results, setResults] = useState<HistoryResponse | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch() {
    setError(null);
    if (!query.trim() && !dateFrom && !dateTo) {
      setError('Informe o nome do cliente ou um intervalo de datas.');
      return;
    }
    setIsSearching(true);
    try {
      const data = await searchHistoryArchive({
        query: query.trim() || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      setResults(data);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Não foi possível buscar. Tenta de novo.');
    } finally {
      setIsSearching(false);
    }
  }

  const resultItems: ReceiptItem[] = useMemo(() => {
    if (!results) return [];
    return [
      ...results.sessions.map((entry): ReceiptItem => ({ kind: 'mesa', entry, timestamp: entry.closedAt ?? '' })),
      ...results.standaloneOrders.map((entry): ReceiptItem => ({ kind: 'avulso', entry, timestamp: entry.createdAt })),
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [results]);

  const resultGroups = useMemo(() => groupItemsByDay(resultItems), [resultItems]);

  return (
    <div className="border-t border-gray-100 pt-5 mt-2">
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-2 text-sm font-semibold text-gray-500"
      >
        <Search size={15} />
        Buscar cupom antigo (mais de 30 dias)
      </button>

      {isOpen && (
        <div className="flex flex-col gap-3 mt-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nome do cliente..."
              className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 outline-none focus:border-gray-400"
            />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-gray-200 outline-none focus:border-gray-400"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-gray-200 outline-none focus:border-gray-400"
            />
            <button
              onClick={handleSearch}
              disabled={isSearching}
              className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold disabled:opacity-50"
            >
              {isSearching ? 'Buscando...' : 'Buscar'}
            </button>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          {results && resultGroups.length === 0 && !error && (
            <p className="text-sm text-gray-400 py-4 text-center">Nenhum cupom encontrado.</p>
          )}

          {resultGroups.length > 0 && (
            <div className="flex flex-col gap-6 mt-1">
              {resultGroups.map((group) => (
                <DayFolder
                  key={group.dateKey}
                  group={group}
                  togglingKey={null}
                  onOpen={onOpenReceipt}
                  // Cupons do arquivo não podem ser marcados/desmarcados
                  // como importantes por aqui — ação sem efeito visual
                  // nessa lista de propósito, pra não confundir com a
                  // lista principal.
                  onToggleFlag={() => {}}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DayFolder({
  group,
  togglingKey,
  onOpen,
  onToggleFlag,
}: {
  group: DayGroup;
  togglingKey: string | null;
  onOpen: (item: ReceiptItem) => void;
  onToggleFlag: (item: ReceiptItem, event: React.MouseEvent) => void;
}) {
  const total = group.mesaItems.length + group.avulsoItems.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-gray-500">
        <FolderClosed size={15} />
        <h2 className="text-sm font-semibold">{group.label}</h2>
        <span className="text-xs text-gray-400">
          {total} {total === 1 ? 'cupom' : 'cupons'}
        </span>
      </div>

      {group.mesaItems.length > 0 && (
        <div className="flex flex-col gap-2 pl-1">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Mesas</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {group.mesaItems.map((item) => (
              <ReceiptCard
                key={item.entry.sessionId}
                item={item}
                isToggling={togglingKey === item.entry.sessionId}
                onOpen={() => onOpen(item)}
                onToggleFlag={(e) => onToggleFlag(item, e)}
              />
            ))}
          </div>
        </div>
      )}

      {group.avulsoItems.length > 0 && (
        <div className="flex flex-col gap-2 pl-1">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Balcão / Entrega
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {group.avulsoItems.map((item) => (
              <ReceiptCard
                key={item.entry.orderId}
                item={item}
                isToggling={togglingKey === item.entry.orderId}
                onOpen={() => onOpen(item)}
                onToggleFlag={(e) => onToggleFlag(item, e)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ReceiptCard({
  item,
  isToggling,
  onOpen,
  onToggleFlag,
}: {
  item: ReceiptItem;
  isToggling: boolean;
  onOpen: () => void;
  onToggleFlag: (event: React.MouseEvent) => void;
}) {
  const flagged = item.entry.flagged;
  const customerName = item.entry.customerName;
  const expiration = getExpirationLabel(item.entry.expiresAt);

  const label =
    item.kind === 'mesa'
      ? item.entry.tableNumber ?? 'Mesa'
      : item.entry.orderType === 'entrega'
        ? 'Entrega'
        : 'Balcão';

  const Icon = item.kind === 'mesa' ? Table2 : item.entry.orderType === 'entrega' ? Bike : ShoppingBag;

  const total = item.kind === 'mesa' ? item.entry.total + item.entry.tipAmount : item.entry.total;

  return (
    <button
      onClick={onOpen}
      className={`relative text-left border rounded-2xl p-4 flex flex-col gap-3 transition-colors ${
        flagged
          ? 'bg-red-50 border-red-200 hover:bg-red-100'
          : 'bg-white border-gray-100 hover:bg-gray-50'
      }`}
    >
      <span
        onClick={onToggleFlag}
        title={flagged ? 'Remover marcação de importante' : 'Marcar como importante'}
        className={`absolute top-3 right-3 w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-colors ${
          flagged
            ? 'bg-red-500 text-white hover:bg-red-600'
            : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
        } ${isToggling ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <Flag size={13} fill={flagged ? 'currentColor' : 'none'} />
      </span>

      <div className="flex items-center gap-2 pr-8">
        <Icon size={18} className={flagged ? 'text-red-500 shrink-0' : 'text-gray-400 shrink-0'} />
        <p className="text-sm font-bold text-gray-900 truncate">{label}</p>
      </div>

      {customerName && <p className="text-xs text-gray-500 -mt-2 truncate">{customerName}</p>}

      <p className="text-xs text-gray-400">{formatDateTime(item.timestamp)}</p>

      <div className="border-t border-dashed border-gray-200" />

      <div>
        <p className="text-xl font-bold text-gray-900">{formatMoney(total)}</p>
        {item.kind === 'mesa' && item.entry.tipAmount > 0 && (
          <p className="text-xs text-gray-400">inclui {formatMoney(item.entry.tipAmount)} gorjeta</p>
        )}
      </div>

      {expiration && (
        <p
          className={`text-xs ${expiration.isUrgent ? 'text-red-500 font-medium' : 'text-gray-300'}`}
        >
          {expiration.label}
        </p>
      )}
    </button>
  );
}

function formatDateTimeFull(dateStr: string): string {
  return new Date(dateStr).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const CASHBACK_SOURCE_LABELS: Record<string, string> = {
  order: 'Cashback de pedido',
  loyalty_reward: 'Prêmio de fidelidade',
  admin_adjustment: 'Ajuste manual',
};

function CashbackHistoryTab() {
  const { data: credits, isLoading: loadingCredits } = usePolling(fetchCashbackCreditHistory, 60000);
  const { data: consumptions, isLoading: loadingConsumptions } = usePolling(
    fetchCashbackConsumptionHistory,
    60000,
  );
  const { data: totals, isLoading: loadingTotals } = usePolling(fetchCashbackTotals, 60000);
  const [subTab, setSubTab] = useState<'ganhos' | 'usados'>('ganhos');

  const isLoading = loadingCredits || loadingConsumptions || loadingTotals;

  return (
    <div className="flex flex-col gap-4 pt-1">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-xs text-gray-400">Total já dado de cashback</p>
          <p className="text-xl font-bold text-gray-900 mt-1">
            R$ {(totals?.totalCredited ?? 0).toFixed(2).replace('.', ',')}
          </p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-xs text-gray-400">Total já usado pelos clientes</p>
          <p className="text-xl font-bold text-gray-900 mt-1">
            R$ {(totals?.totalConsumed ?? 0).toFixed(2).replace('.', ',')}
          </p>
        </div>
      </div>

      <div className="flex gap-1.5">
        <button
          onClick={() => setSubTab('ganhos')}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
            subTab === 'ganhos' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'
          }`}
        >
          Quem recebeu
        </button>
        <button
          onClick={() => setSubTab('usados')}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
            subTab === 'usados' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'
          }`}
        >
          Quem usou
        </button>
      </div>

      {isLoading && <p className="text-sm text-gray-400 py-8 text-center">Carregando...</p>}

      {!isLoading && subTab === 'ganhos' && (
        <>
          {(credits ?? []).length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">Ninguém recebeu cashback ainda.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {(credits ?? []).map((c) => (
                <div key={c.id} className="bg-white border border-gray-100 rounded-xl p-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {c.customerName ?? 'Cliente'}
                    </p>
                    <p className="text-xs text-gray-400">
                      {CASHBACK_SOURCE_LABELS[c.sourceType] ?? c.sourceType}
                      {c.locationName ? ` · ${c.locationName}` : ''} · {formatDateTimeFull(c.createdAt)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-green-600">
                      + R$ {Number(c.originalAmount).toFixed(2).replace('.', ',')}
                    </p>
                    {Number(c.remainingAmount) < Number(c.originalAmount) && (
                      <p className="text-[11px] text-gray-400">
                        restam R$ {Number(c.remainingAmount).toFixed(2).replace('.', ',')}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {!isLoading && subTab === 'usados' && (
        <>
          {(consumptions ?? []).length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">Ninguém usou cashback ainda.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {(consumptions ?? [])
                .filter((c) => !c.reversed)
                .map((c) => (
                  <div key={c.id} className="bg-white border border-gray-100 rounded-xl p-3.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {c.customerName ?? 'Cliente'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {c.locationName ? `${c.locationName} · ` : ''}
                        {formatDateTimeFull(c.createdAt)}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-red-600 shrink-0">
                      - R$ {Number(c.amount).toFixed(2).replace('.', ',')}
                    </p>
                  </div>
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FidelityHistoryTab() {
  const { data, isLoading } = usePolling(fetchFidelityHistory, 60000);

  return (
    <div className="flex flex-col gap-2 pt-1">
      {isLoading && <p className="text-sm text-gray-400 py-8 text-center">Carregando...</p>}

      {!isLoading && (data ?? []).length === 0 && (
        <p className="text-sm text-gray-400 py-12 text-center">
          Nenhum carimbo de fidelidade ainda.
        </p>
      )}

      {(data ?? []).map((entry) => (
        <div
          key={entry.id}
          className="bg-white border border-gray-100 rounded-xl p-3.5 flex items-center justify-between gap-3"
        >
          <div className="min-w-0 flex items-center gap-2.5">
            <Gift size={16} className="text-gray-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {entry.customerName ?? 'Cliente'} — {entry.programName}
              </p>
              <p className="text-xs text-gray-400">
                {entry.locationName ? `${entry.locationName} · ` : ''}
                {formatDateTimeFull(entry.createdAt)}
              </p>
            </div>
          </div>
          {entry.rewardGranted && (
            <span
              className={`text-[11px] font-semibold px-2 py-1 rounded-full shrink-0 ${
                entry.rewardStatus === 'resgatado'
                  ? 'bg-green-50 text-green-700'
                  : 'bg-amber-50 text-amber-700'
              }`}
            >
              {entry.rewardStatus === 'resgatado' ? 'Cartão completo — entregue' : 'Cartão completo'}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
