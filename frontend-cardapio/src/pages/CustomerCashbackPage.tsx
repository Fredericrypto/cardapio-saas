import type { TranslationKey } from '../i18n/dictionaries/pt-BR';
import { cashbackDescriptionLabel } from '../i18n/cashbackDescription';
import { useI18n } from '../i18n/I18nContext';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CalendarClock, CircleDollarSign, Receipt, Store, Wallet } from 'lucide-react';
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
import { ProfileSubpageShell } from '../components/ProfileSubpageShell';
import { Tooltip } from '../components/Tooltip';
import { MENU_PAGE_BG, MENU_TEXT, MENU_TEXT_BODY, MENU_TEXT_MUTED } from '../lib/menuTheme';
import { PROFILE_CARD, PROFILE_BTN_PRIMARY } from '../lib/profileTheme';

const TABS: { key: CashbackTab; labelKey: TranslationKey }[] = [
  { key: 'disponiveis', labelKey: 'cashback.tab.available' },
  { key: 'expirados', labelKey: 'cashback.tab.expired' },
  { key: 'utilizados', labelKey: 'cashback.tab.used' },
];

function Badge({ tone, children }: { tone: 'green' | 'amber' | 'red' | 'gray'; children: React.ReactNode }) {
  const tones = {
    green: 'bg-green-50 text-green-700 border-green-100 dark:bg-green-500/10 dark:text-green-300 dark:border-green-500/20',
    amber: 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20',
    red: 'bg-red-50 text-red-600 border-red-100 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/20',
    gray: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-white/10 dark:text-[#C4C7C5] dark:border-white/10',
  } as const;
  return (
    <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border ${tones[tone]}`}>
      {children}
    </span>
  );
}

function AvailableCard({ entry, now }: { entry: CashbackHistoryEntry; now: number }) {
  const { t } = useI18n();
  const urgent = entry.expiresAt ? isExpiringWithin24h(entry.expiresAt, now) : false;
  return (
    <div className={`${PROFILE_CARD} p-4 flex flex-col gap-2`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`text-lg font-bold ${MENU_TEXT}`}>{formatBRL(entry.remainingAmount)}</p>
          <p className={`text-xs ${MENU_TEXT_MUTED} truncate`}>
            {cashbackDescriptionLabel(entry.description, t)} · {t('cashback.earnedOn')} {formatDateBR(entry.createdAt)}
          </p>
        </div>
        <Badge tone={urgent ? 'amber' : 'green'}>{urgent ? t('customerCashbackPage.vence_em_breve') : t('customerCashbackPage.valido')}</Badge>
      </div>
      <p className={`text-xs font-semibold flex items-center gap-1.5 ${urgent ? 'text-amber-600 dark:text-amber-300' : MENU_TEXT_BODY}`}>
        <CalendarClock size={13} strokeWidth={1.5} className="shrink-0" />
        {entry.expiresAt ? formatCashbackExpiry(entry.expiresAt, now, undefined, t) : t('customerCashbackPage.sem_data_de_validade')}
      </p>
      {Number(entry.remainingAmount) < Number(entry.amount) && (
        <p className={`text-[11px] ${MENU_TEXT_MUTED}`}>{t('customerCashbackPage.credito_original_de')} {formatBRL(entry.amount)}</p>
      )}
    </div>
  );
}

function ExpiredCard({ entry }: { entry: CashbackHistoryEntry }) {
  const { t } = useI18n();
  return (
    <div className={`${PROFILE_CARD} p-4 flex flex-col gap-2`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`text-lg font-bold ${MENU_TEXT_MUTED} line-through`}>{formatBRL(entry.remainingAmount)}</p>
          <p className={`text-xs ${MENU_TEXT_MUTED} truncate`}>{cashbackDescriptionLabel(entry.description, t)}</p>
        </div>
        <Badge tone="red">{t('customerCashbackPage.expirado')}</Badge>
      </div>
      <div className={`flex flex-col gap-0.5 text-xs ${MENU_TEXT_BODY}`}>
        <p>{t('customerCashbackPage.ganho_em')} {formatDateTimeBR(entry.createdAt, undefined, t)}</p>
        {entry.expiresAt && <p className="font-semibold text-red-500 dark:text-red-400">{t('customerCashbackPage.expirou_dia')} {formatDateTimeBR(entry.expiresAt, undefined, t)}</p>}
        <p className={MENU_TEXT_MUTED}>{t('customerCashbackPage.nao_utilizado_credito_original')} {formatBRL(entry.amount)})</p>
      </div>
    </div>
  );
}

function UsedCard({ entry }: { entry: CashbackHistoryEntry }) {
  const { t } = useI18n();
  const place = [entry.establishmentName, entry.locationName]
    .filter((v, i, a): v is string => Boolean(v) && a.indexOf(v) === i)
    .join(' · ');
  return (
    <div className={`${PROFILE_CARD} p-4 flex flex-col gap-2`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`text-xs ${MENU_TEXT_MUTED}`}>{t('customerCashbackPage.cashback_utilizado')}</p>
          <p className={`text-lg font-bold ${MENU_TEXT}`}>{formatBRL(entry.amount)}</p>
        </div>
        <Badge tone="gray">{t('customerCashbackPage.utilizado')}</Badge>
      </div>
      <div className={`flex flex-col gap-1 text-xs ${MENU_TEXT_BODY}`}>
        <p className="flex items-center gap-1.5">
          <Receipt size={13} strokeWidth={1.5} className={`shrink-0 ${MENU_TEXT_MUTED}`} />
          {t('customerCashbackPage.total_do_pedido')} <span className={`font-semibold ${MENU_TEXT}`}>{entry.orderTotal != null ? formatBRL(entry.orderTotal) : t('customerCashbackPage.indisponivel')}</span>
        </p>
        <p className="flex items-center gap-1.5">
          <CalendarClock size={13} strokeWidth={1.5} className={`shrink-0 ${MENU_TEXT_MUTED}`} />
          {formatDateTimeBR(entry.createdAt, undefined, t)}
        </p>
        {place && (
          <p className="flex items-center gap-1.5">
            <Store size={13} strokeWidth={1.5} className={`shrink-0 ${MENU_TEXT_MUTED}`} />
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
  const { t } = useI18n();
  const { slug } = useParams<{ slug: string }>();
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
      <div className={`flex items-center justify-center h-screen ${MENU_PAGE_BG}`}>
        <div className="w-8 h-8 border-2 border-gray-200 dark:border-white/10 border-t-gray-500 dark:border-t-gray-300 rounded-full animate-spin" />
      </div>
    );
  }

  const emptyText: Record<CashbackTab, string> = {
    disponiveis: t('customerCashbackPage.voce_nao_tem_cashback'),
    expirados: t('customerCashbackPage.nenhum_cashback_expirou_ate'),
    utilizados: t('customerCashbackPage.voce_ainda_nao_usou'),
  };

  return (
    <ProfileSubpageShell tenant={tenant} title={t('profile.cashback')} backTo={`/${slug}/conta-cliente/perfil`}>
      {/* Desktop: saldo fixo à esquerda; abas e extrato à direita. */}
      <div className="flex flex-col gap-3 md:grid md:grid-cols-[320px_minmax(0,1fr)] lg:grid-cols-[360px_minmax(0,1fr)] md:gap-x-8 md:gap-y-4 md:items-start">
        <div
          className="relative overflow-hidden rounded-2xl p-5 md:p-6 text-white flex flex-col gap-1 md:col-start-1 md:row-span-3 md:sticky md:top-24 shadow-sm ring-1 ring-black/5 dark:ring-white/15"
          style={{ backgroundColor: tenant.primaryColor }}
        >
          <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/10" aria-hidden="true" />
          <div className="absolute -left-8 -bottom-12 w-32 h-32 rounded-full bg-white/[0.07]" aria-hidden="true" />
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" aria-hidden="true" />
          <div className="relative flex flex-col gap-1">
            <div className="w-10 h-10 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center mb-2">
              <CircleDollarSign size={20} strokeWidth={1.5} />
            </div>
            <p className="text-xs opacity-80">{t('customerCashbackPage.saldo_disponivel')}</p>
            <p className="text-3xl md:text-4xl font-bold font-display">{balance == null ? '...' : formatBRL(balance)}</p>
            {wallet?.nextExpiresAt && wallet.balance > 0 && (
              <p className="text-xs font-semibold bg-white/20 rounded-lg px-2.5 py-1.5 mt-2 inline-block self-start">
                {formatBRL(wallet.expiringAmount)} · {formatCashbackExpiry(wallet.nextExpiresAt, now)}
              </p>
            )}
            <p className="text-xs opacity-80 mt-2 leading-relaxed">
              {t('customerCashbackPage.use_no_carrinho_quando')}
            </p>
          </div>
        </div>

        <div role="tablist" aria-label={t('customerCashbackPage.categorias_de_cashback')} className={`grid grid-cols-3 gap-1 ${PROFILE_CARD} rounded-xl p-1 md:col-start-2`}>
          {TABS.map((tabItem) => {
            const count = categorized ? categorized[tabItem.key].length : null;
            const active = tab === tabItem.key;
            return (
              <Tooltip key={tabItem.key} label={t(tabItem.labelKey)} className="flex w-full">
                <button
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(tabItem.key)}
                  className={`w-full py-2.5 rounded-lg text-xs font-semibold transition-colors ${active ? PROFILE_BTN_PRIMARY : `${MENU_TEXT_BODY} hover:bg-black/[0.03] dark:hover:bg-white/5`}`}
                  style={active ? { backgroundColor: tenant.primaryColor } : undefined}
                >
                  {t(tabItem.labelKey)}
                  {count != null && <span className={`ml-1 text-[10px] ${active ? 'opacity-80' : MENU_TEXT_MUTED}`}>{count}</span>}
                </button>
              </Tooltip>
            );
          })}
        </div>

        {history == null && <p className={`text-sm ${MENU_TEXT_MUTED} text-center py-8 md:col-start-2`}>{t('common.loading')}</p>}

        {categorized && categorized[tab].length === 0 && (
          <div className={`${PROFILE_CARD} py-10 px-4 flex flex-col items-center gap-2 text-center md:col-start-2`}>
            <Wallet size={22} strokeWidth={1.5} className="text-gray-300 dark:text-[#5F6368]" />
            <p className={`text-sm ${MENU_TEXT_MUTED}`}>{emptyText[tab]}</p>
          </div>
        )}

        {categorized && (
          <div className="flex flex-col gap-2.5 md:grid md:grid-cols-2 md:gap-3 md:items-start md:col-start-2" role="tabpanel">
            {tab === 'disponiveis' && categorized.disponiveis.map((e) => <AvailableCard key={e.id} entry={e} now={now} />)}
            {tab === 'expirados' && categorized.expirados.map((e) => <ExpiredCard key={e.id} entry={e} />)}
            {tab === 'utilizados' && categorized.utilizados.map((e) => <UsedCard key={e.id} entry={e} />)}
          </div>
        )}
      </div>
    </ProfileSubpageShell>
  );
}
