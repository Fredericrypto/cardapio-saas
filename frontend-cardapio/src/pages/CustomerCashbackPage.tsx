import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, CircleDollarSign, Receipt, Store, Wallet } from 'lucide-react';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useTenant } from '../contexts/TenantContext';
import { fetchMyCashbackHistory, fetchMyCashbackWallet, type CashbackWallet } from '../lib/customer-api';
import type { CashbackHistoryEntry } from '../lib/customer-api';
import {
  categorizeCashback,
  formatBRL,
  formatCashbackExpiry,
  formatDateBR,
  formatDateTimeBR,
  isExpiringWithin24h,
  type CashbackTab,
} from '../lib/cashbackFormat';

const TABS: { key: CashbackTab; label: string }[] = [
  { key: 'disponiveis', label: 'Disponíveis' },
  { key: 'expirados', label: 'Expirados' },
  { key: 'utilizados', label: 'Utilizados' },
];

function Badge({ tone, children }: { tone: 'green' | 'amber' | 'red' | 'gray'; children: React.ReactNode }) {
  const tones = {
    green: 'bg-green-50 text-green-700 border-green-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    red: 'bg-red-50 text-red-600 border-red-100',
    gray: 'bg-gray-100 text-gray-600 border-gray-200',
  } as const;
  return (
    <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border ${tones[tone]}`}>
      {children}
    </span>
  );
}

function AvailableCard({ entry, now }: { entry: CashbackHistoryEntry; now: number }) {
  const urgent = entry.expiresAt ? isExpiringWithin24h(entry.expiresAt, now) : false;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-lg font-bold text-gray-900">{formatBRL(entry.remainingAmount)}</p>
          <p className="text-xs text-gray-400 truncate">
            {entry.description} · ganho em {formatDateBR(entry.createdAt)}
          </p>
        </div>
        <Badge tone={urgent ? 'amber' : 'green'}>{urgent ? 'Vence em breve' : 'Válido'}</Badge>
      </div>
      <p className={`text-xs font-semibold flex items-center gap-1.5 ${urgent ? 'text-amber-600' : 'text-gray-500'}`}>
        <CalendarClock size={13} strokeWidth={1.5} className="shrink-0" />
        {entry.expiresAt ? formatCashbackExpiry(entry.expiresAt, now) : 'Sem data de validade'}
      </p>
      {Number(entry.remainingAmount) < Number(entry.amount) && (
        <p className="text-[11px] text-gray-400">Crédito original de {formatBRL(entry.amount)}</p>
      )}
    </div>
  );
}

function ExpiredCard({ entry }: { entry: CashbackHistoryEntry }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-lg font-bold text-gray-400 line-through">{formatBRL(entry.remainingAmount)}</p>
          <p className="text-xs text-gray-400 truncate">{entry.description}</p>
        </div>
        <Badge tone="red">Expirado</Badge>
      </div>
      <div className="flex flex-col gap-0.5 text-xs text-gray-500">
        <p>Ganho em {formatDateTimeBR(entry.createdAt)}</p>
        {entry.expiresAt && <p className="font-semibold text-red-500">Expirou dia {formatDateTimeBR(entry.expiresAt)}</p>}
        <p className="text-gray-400">Não utilizado (crédito original de {formatBRL(entry.amount)})</p>
      </div>
    </div>
  );
}

function UsedCard({ entry }: { entry: CashbackHistoryEntry }) {
  const place = [entry.establishmentName, entry.locationName]
    .filter((v, i, a): v is string => Boolean(v) && a.indexOf(v) === i)
    .join(' · ');
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-gray-400">Cashback utilizado</p>
          <p className="text-lg font-bold text-gray-900">{formatBRL(entry.amount)}</p>
        </div>
        <Badge tone="gray">Utilizado</Badge>
      </div>
      <div className="flex flex-col gap-1 text-xs text-gray-500">
        <p className="flex items-center gap-1.5">
          <Receipt size={13} strokeWidth={1.5} className="shrink-0 text-gray-400" />
          Total do pedido: <span className="font-semibold text-gray-700">{entry.orderTotal != null ? formatBRL(entry.orderTotal) : 'indisponível'}</span>
        </p>
        <p className="flex items-center gap-1.5">
          <CalendarClock size={13} strokeWidth={1.5} className="shrink-0 text-gray-400" />
          {formatDateTimeBR(entry.createdAt)}
        </p>
        {place && (
          <p className="flex items-center gap-1.5">
            <Store size={13} strokeWidth={1.5} className="shrink-0 text-gray-400" />
            {place}
          </p>
        )}
      </div>
    </div>
  );
}

// Área "Meu Cashback": saldo em destaque + o extrato dividido em Disponíveis,
// Expirados e Utilizados. Datas sempre no fuso do estabelecimento (Brasília).
export function CustomerCashbackPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const [wallet, setWallet] = useState<CashbackWallet | null>(null);
  const balance = wallet ? wallet.balance : null;
  // Relógio para o "Vence em Xh Ymin" andar sozinho (a cada 30s).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const [history, setHistory] = useState<CashbackHistoryEntry[] | null>(null);
  const [tab, setTab] = useState<CashbackTab>('disponiveis');

  const { customer, token, isLoading } = useCustomerAuth();

  useEffect(() => {
    if (!tenant || !token) return;
    fetchMyCashbackWallet(tenant.id, token).then(setWallet);
    fetchMyCashbackHistory(tenant.id, token).then(setHistory);
  }, [tenant, token]);

  const categorized = useMemo(() => (history ? categorizeCashback(history, now) : null), [history, now]);

  if (!tenant || isLoading || !customer) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
      </div>
    );
  }

  const emptyText: Record<CashbackTab, string> = {
    disponiveis: 'Você não tem cashback disponível agora. Faça um pedido pra começar a ganhar!',
    expirados: 'Nenhum cashback expirou até agora.',
    utilizados: 'Você ainda não usou cashback em nenhum pedido.',
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-10 max-w-md mx-auto">
      <div className="flex items-center gap-3 px-4 py-4 bg-white border-b border-gray-100">
        <button onClick={() => navigate(`/${slug}/conta-cliente/perfil`)} aria-label="Voltar">
          <ArrowLeft size={20} strokeWidth={1.5} />
        </button>
        <h1 className="font-display font-bold text-lg">Meu Cashback</h1>
      </div>

      <div className="px-4 mt-4 flex flex-col gap-3">
        <div className="rounded-2xl p-5 text-white flex flex-col gap-1" style={{ backgroundColor: tenant.primaryColor }}>
          <p className="text-xs opacity-80 flex items-center gap-1.5">
            <CircleDollarSign size={14} strokeWidth={1.5} />
            Saldo disponível
          </p>
          <p className="text-3xl font-bold">{balance == null ? '...' : formatBRL(balance)}</p>
          {wallet?.nextExpiresAt && wallet.balance > 0 && (
            <p className="text-xs font-semibold bg-white/20 rounded-lg px-2.5 py-1.5 mt-1 inline-block self-start">
              {formatBRL(wallet.expiringAmount)} · {formatCashbackExpiry(wallet.nextExpiresAt, now)}
            </p>
          )}
          <p className="text-xs opacity-80 mt-1">
            Use no carrinho quando quiser — marque a caixinha "Usar meu saldo de cashback" no checkout.
          </p>
        </div>

        <div role="tablist" aria-label="Categorias de cashback" className="grid grid-cols-3 gap-1 bg-white rounded-xl p-1 border border-gray-100">
          {TABS.map((t) => {
            const count = categorized ? categorized[t.key].length : null;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.key)}
                className={`py-2 rounded-lg text-xs font-semibold transition-colors ${active ? 'text-white' : 'text-gray-500'}`}
                style={active ? { backgroundColor: tenant.primaryColor } : undefined}
              >
                {t.label}
                {count != null && <span className={`ml-1 text-[10px] ${active ? 'opacity-80' : 'text-gray-400'}`}>{count}</span>}
              </button>
            );
          })}
        </div>

        {history == null && <p className="text-sm text-gray-400 text-center py-8">Carregando...</p>}

        {categorized && categorized[tab].length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 py-10 px-4 flex flex-col items-center gap-2 text-center">
            <Wallet size={22} strokeWidth={1.5} className="text-gray-300" />
            <p className="text-sm text-gray-400">{emptyText[tab]}</p>
          </div>
        )}

        {categorized && (
          <div className="flex flex-col gap-2.5" role="tabpanel">
            {tab === 'disponiveis' && categorized.disponiveis.map((e) => <AvailableCard key={e.id} entry={e} now={now} />)}
            {tab === 'expirados' && categorized.expirados.map((e) => <ExpiredCard key={e.id} entry={e} />)}
            {tab === 'utilizados' && categorized.utilizados.map((e) => <UsedCard key={e.id} entry={e} />)}
          </div>
        )}
      </div>
    </div>
  );
}
