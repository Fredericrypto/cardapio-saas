import { useI18n } from '../i18n/I18nContext';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, Store } from 'lucide-react';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useTenant } from '../contexts/TenantContext';
import { fetchMyOrderHistory } from '../lib/customer-api';
import { groupCustomerOrders } from '../lib/ordersHistory';
import { ProfileSubpageShell } from '../components/ProfileSubpageShell';
import { OrderHistoryWorkspace } from './OrderHistoryPage';
import { useDesktopLayout } from '../lib/useDesktopLayout';
import { Tooltip } from '../components/Tooltip';
import { MENU_PAGE_BG, MENU_TEXT, MENU_TEXT_BODY, MENU_TEXT_MUTED } from '../lib/menuTheme';
import { PROFILE_CARD } from '../lib/profileTheme';
import type { Tenant } from '../types';

// Porta de entrada de "Meus pedidos": um cartão por restaurante (aqui só
// existe um, já que a conta do cliente é por restaurante — ver decisão de
// escopo do projeto). Clicar no cartão abre o histórico completo,
// agrupado por data. Estrutura pensada de propósito em dois passos (em
// vez de já cair direto na lista) pra deixar o caminho aberto: se um dia
// a conta do cliente deixar de ser isolada por restaurante, esta mesma
// tela vira naturalmente uma lista de vários cartões.
//
// No DESKTOP (lg+) esse degrau não existe: a própria tela de pedidos já é o
// histórico em Master-Detail (lista + detalhe lado a lado), sem sub-telas
// empilhadas. O cartão do restaurante continua só no celular/tablet.
export function OrdersHubPage() {
  const { t } = useI18n();
  const { slug } = useParams<{ slug: string }>();
  // Mesmo bug/correção do CustomerProfilePage — ver comentário lá (a mesa
  // ativa é resolvida dentro do ProfileSubpageShell).
  const navigate = useNavigate();
  const { tenant } = useTenant();


  const { token, isLoading: isLoadingAuth } = useCustomerAuth();
  const isDesktop = useDesktopLayout();

  if (!tenant || isLoadingAuth) {
    return (
      <div className={`flex items-center justify-center h-screen ${MENU_PAGE_BG}`}>
        <div className="w-8 h-8 border-2 border-gray-200 dark:border-white/10 border-t-gray-500 dark:border-t-gray-300 rounded-full animate-spin" />
      </div>
    );
  }

  if (!token) {
    return (
      <ProfileSubpageShell
        tenant={tenant}
        title={t('profile.myOrders')}
        backTo={`/${slug}/conta-cliente/perfil`}
        bottomNav
      >
        <div className="flex flex-col items-center justify-center px-6 text-center max-w-md mx-auto py-16">
          <p className={`${MENU_TEXT_BODY} text-sm`}>{t('ordersHub.needLogin')}</p>
          <Tooltip label={t('common.enter')}>
            <button
              onClick={() => navigate(`/${slug}/conta-cliente/entrar`)}
              className="mt-4 text-white px-5 py-2.5 rounded-xl text-sm font-semibold"
              style={{ backgroundColor: tenant.primaryColor }}
            >
              {t('common.enter')}
            </button>
          </Tooltip>
        </div>
      </ProfileSubpageShell>
    );
  }

  return (
    <ProfileSubpageShell
      tenant={tenant}
      title={t('profile.myOrders')}
      backTo={`/${slug}/conta-cliente/perfil`}
      bottomNav
    >
      {isDesktop ? (
        <OrderHistoryWorkspace tenant={tenant} token={token} slug={slug!} />
      ) : (
        <RestaurantOrdersCard tenant={tenant} token={token} slug={slug!} />
      )}
    </ProfileSubpageShell>
  );
}

// Cartão do restaurante (celular/tablet): contagem de pedidos + atalho para o
// histórico. Estado e busca idênticos aos de antes, agora isolados aqui para
// só rodarem quando o cartão é exibido.
function RestaurantOrdersCard({ tenant, token, slug }: { tenant: Tenant; token: string; slug: string }) {
  const { t, formatDate } = useI18n();
  const navigate = useNavigate();
  const [orderCount, setOrderCount] = useState<number | null>(null);
  const [lastOrderAt, setLastOrderAt] = useState<string | null>(null);

  useEffect(() => {
    if (!tenant || !token) return;
    fetchMyOrderHistory(tenant.id, token).then((orders) => {
      const entries = groupCustomerOrders(orders);
      setOrderCount(entries.length);
      const latest = orders[0]?.createdAt ?? null;
      setLastOrderAt(latest);
    });
  }, [tenant, token]);

  return (
      <div className="max-w-2xl">
        <Tooltip label={tenant.name} className="flex w-full">
          <button
            onClick={() => navigate(`/${slug}/conta-cliente/pedidos/historico`)}
            className={`w-full ${PROFILE_CARD} p-4 md:p-5 flex items-center gap-3 text-left md:hover:bg-black/[0.02] dark:md:hover:bg-white/[0.03] md:transition-colors`}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-white overflow-hidden shrink-0"
              style={{ backgroundColor: tenant.primaryColor }}
            >
              {tenant.logoUrl ? (
                <img src={tenant.logoUrl} alt={tenant.name} className="w-full h-full object-cover" />
              ) : (
                <Store size={22} strokeWidth={1.5} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className={`font-display font-bold ${MENU_TEXT} truncate`}>{tenant.name}</p>
              <p className={`text-xs ${MENU_TEXT_MUTED} mt-0.5`}>
                {orderCount === null
                  ? t('ordersHub.loading')
                  : orderCount === 0
                    ? t('ordersHub.none')
                    : `${orderCount === 1 ? t('ordersHub.countOne', { count: orderCount }) : t('ordersHub.count', { count: orderCount })}${
                        lastOrderAt ? t('ordersHub.last', { date: formatDate(lastOrderAt) }) : ''
                      }`}
              </p>
            </div>
            <ChevronRight size={18} strokeWidth={1.5} className="text-gray-300 dark:text-[#5F6368] shrink-0" />
          </button>
        </Tooltip>
      </div>
  );
}
