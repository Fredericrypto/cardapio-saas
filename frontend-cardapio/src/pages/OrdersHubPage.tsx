import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Store } from 'lucide-react';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useTenant } from '../contexts/TenantContext';
import { fetchMyOrderHistory } from '../lib/customer-api';
import { groupCustomerOrders } from '../lib/ordersHistory';
import { BottomNav } from '../components/BottomNav';

// Porta de entrada de "Meus pedidos": um cartão por restaurante (aqui só
// existe um, já que a conta do cliente é por restaurante — ver decisão de
// escopo do projeto). Clicar no cartão abre o histórico completo,
// agrupado por data. Estrutura pensada de propósito em dois passos (em
// vez de já cair direto na lista) pra deixar o caminho aberto: se um dia
// a conta do cliente deixar de ser isolada por restaurante, esta mesma
// tela vira naturalmente uma lista de vários cartões.
export function OrdersHubPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { tenant } = useTenant();


  const { token, isLoading: isLoadingAuth } = useCustomerAuth();
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

  if (!tenant || isLoadingAuth) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center max-w-md mx-auto pb-20">
        <p className="text-gray-500 text-sm">Você precisa entrar na sua conta pra ver seus pedidos.</p>
        <button
          onClick={() => navigate(`/${slug}/conta-cliente/entrar`)}
          className="mt-4 text-white px-5 py-2.5 rounded-xl text-sm font-semibold"
          style={{ backgroundColor: tenant.primaryColor }}
        >
          Entrar
        </button>
        <BottomNav slug={slug!} tenantId={tenant.id} primaryColor={tenant.primaryColor} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24 max-w-md mx-auto">
      <div className="flex items-center gap-3 px-4 py-4 bg-white border-b border-gray-100">
        <button onClick={() => navigate(`/${slug}/conta-cliente/perfil`)}>
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-display font-bold text-lg">Meus pedidos</h1>
      </div>

      <div className="px-4 mt-3">
        <button
          onClick={() => navigate(`/${slug}/conta-cliente/pedidos/historico`)}
          className="w-full bg-white rounded-2xl p-4 flex items-center gap-3 text-left"
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-white overflow-hidden shrink-0"
            style={{ backgroundColor: tenant.primaryColor }}
          >
            {tenant.logoUrl ? (
              <img src={tenant.logoUrl} alt={tenant.name} className="w-full h-full object-cover" />
            ) : (
              <Store size={22} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display font-bold text-gray-900 truncate">{tenant.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {orderCount === null
                ? 'Carregando pedidos...'
                : orderCount === 0
                  ? 'Nenhum pedido ainda'
                  : `${orderCount} ${orderCount === 1 ? 'pedido' : 'pedidos'}${
                      lastOrderAt
                        ? ` · último em ${new Date(lastOrderAt).toLocaleDateString('pt-BR')}`
                        : ''
                    }`}
            </p>
          </div>
          <ChevronRight size={18} className="text-gray-300 shrink-0" />
        </button>
      </div>

      <BottomNav slug={slug!} tenantId={tenant.id} primaryColor={tenant.primaryColor} />
    </div>
  );
}
