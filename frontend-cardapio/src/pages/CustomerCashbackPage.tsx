import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CircleDollarSign, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useTenant } from '../contexts/TenantContext';
import { fetchMyCashbackHistory, fetchMyCashbackWallet, type CashbackWallet } from '../lib/customer-api';
import type { CashbackHistoryEntry } from '../lib/customer-api';

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Área "Meu Cashback" da conta — saldo em destaque + extrato completo
// (o que faltava: até aqui só o carrinho mostrava um número, sem
// explicar de onde veio nem pra onde foi). Mesmo princípio visual do
// extrato de qualquer carteira digital (Uber Cash, PicPay): lista
// cronológica, verde pra entrada, vermelho pra saída.
// "3 dias e 4h", "5h 20min", "12 min" — tempo que falta até `iso`.
function timeLeftLabel(iso: string, now: number): string {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return 'venceu';
  const mins = Math.floor(ms / 60_000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const rest = mins % 60;
  if (days >= 1) return hours > 0 ? `${days} ${days === 1 ? 'dia' : 'dias'} e ${hours}h` : `${days} ${days === 1 ? 'dia' : 'dias'}`;
  if (hours >= 1) return `${hours}h ${rest}min`;
  return `${Math.max(1, rest)} min`;
}

export function CustomerCashbackPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const [wallet, setWallet] = useState<CashbackWallet | null>(null);
  const balance = wallet ? wallet.balance : null;
  // Relógio para o tempo restante andar sozinho (a cada 30s).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const [history, setHistory] = useState<CashbackHistoryEntry[] | null>(null);


  const { customer, token, isLoading } = useCustomerAuth();

  useEffect(() => {
    if (!tenant || !token) return;
    fetchMyCashbackWallet(tenant.id, token).then(setWallet);
    fetchMyCashbackHistory(tenant.id, token).then(setHistory);
  }, [tenant, token]);

  if (!tenant || isLoading || !customer) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-10 max-w-md mx-auto">
      <div className="flex items-center gap-3 px-4 py-4 bg-white border-b border-gray-100">
        <button onClick={() => navigate(`/${slug}/conta-cliente/perfil`)}>
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-display font-bold text-lg">Meu Cashback</h1>
      </div>

      <div className="px-4 mt-4 flex flex-col gap-3">
        <div
          className="rounded-2xl p-5 text-white flex flex-col gap-1"
          style={{ backgroundColor: tenant.primaryColor }}
        >
          <p className="text-xs opacity-80 flex items-center gap-1.5">
            <CircleDollarSign size={14} />
            Saldo disponível
          </p>
          <p className="text-3xl font-bold">
            {balance == null ? '...' : `R$ ${balance.toFixed(2).replace('.', ',')}`}
          </p>
          {wallet?.nextExpiresAt && wallet.balance > 0 && (
            <p className="text-xs font-semibold bg-white/20 rounded-lg px-2.5 py-1.5 mt-1 inline-block self-start">
              R$ {wallet.expiringAmount.toFixed(2).replace('.', ',')} vence em{' '}
              {timeLeftLabel(wallet.nextExpiresAt, now)}
            </p>
          )}
          <p className="text-xs opacity-80 mt-1">
            Use no carrinho quando quiser — marque a caixinha "Usar meu saldo de cashback" no
            checkout.
          </p>
        </div>

        <div className="bg-white rounded-2xl overflow-hidden">
          <p className="text-xs font-semibold text-gray-500 px-4 pt-4 pb-2">Extrato</p>

          {history == null && <p className="text-sm text-gray-400 text-center py-8">Carregando...</p>}

          {history != null && history.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8 px-4">
              Você ainda não tem movimentações de cashback. Faça um pedido pra começar a ganhar!
            </p>
          )}

          {(history ?? []).map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-b-0"
            >
              {entry.type === 'earned' ? (
                <ArrowDownCircle size={20} className="text-green-500 shrink-0" />
              ) : (
                <ArrowUpCircle size={20} className="text-red-400 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800 truncate">{entry.description}</p>
                <p className="text-xs text-gray-400">{formatDateTime(entry.createdAt)}</p>
                {entry.type === 'earned' && entry.expired && (
                  <p className="text-[11px] font-semibold text-red-500">
                    Expirou — R$ {Number(entry.remainingAmount ?? 0).toFixed(2).replace('.', ',')} não usados
                  </p>
                )}
                {entry.type === 'earned' &&
                  !entry.expired &&
                  entry.expiresAt &&
                  Number(entry.remainingAmount ?? 0) > 0 && (
                    <p className="text-[11px] font-semibold text-amber-600">
                      Vence em {timeLeftLabel(entry.expiresAt, now)}
                    </p>
                  )}
              </div>
              <p
                className={`text-sm font-bold shrink-0 ${
                  entry.type === 'earned' ? 'text-green-600' : 'text-red-500'
                }`}
              >
                {entry.type === 'earned' ? '+' : '-'} R$ {Number(entry.amount).toFixed(2).replace('.', ',')}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
