import { createContext, useContext, type ReactNode } from 'react';
import { usePolling } from '../hooks/usePolling';
import { fetchOrders, fetchPendingWaiterCalls, fetchActiveOverview } from '../lib/admin-api';
import type { Order, WaiterCall, RestaurantTable, TableSession } from '../types';

interface ActiveOverviewItem {
  table: RestaurantTable;
  session: TableSession;
  total: number;
  openedAt: string;
}

interface DashboardDataValue {
  orders: Order[] | null;
  waiterCalls: WaiterCall[] | null;
  activeTables: ActiveOverviewItem[] | null;
  refetchOrders: () => void;
  refetchWaiterCalls: () => void;
  refetchActiveTables: () => void;
}

const DashboardDataContext = createContext<DashboardDataValue | null>(null);

// Fonte única de polling pra pedidos/chamados de garçom/mesas ativas —
// antes disso, o AdminLayout (pro blink do "Painel" no menu) e a
// PainelPage tinham CADA UM seu próprio polling pros mesmos três
// endpoints, rodando em paralelo sem se coordenar. Além de dobrar as
// chamadas ao backend à toa, os dois relógios de polling ficavam fora de
// sincronia entre si (um atualizando a cada 4s, outro a cada 5s, cada um
// no seu próprio ciclo), o que podia fazer o piscar do card e o piscar
// do menu discordarem entre si por alguns segundos. Agora só existe UM
// polling de cada endpoint, no AdminLayout, e tanto o menu quanto a
// PainelPage leem os mesmos dados daqui.
export function DashboardDataProvider({ children }: { children: ReactNode }) {
  const { data: orders, refetch: refetchOrders } = usePolling(fetchOrders, 5000);
  const { data: waiterCalls, refetch: refetchWaiterCalls } = usePolling(fetchPendingWaiterCalls, 4000);
  const { data: activeTables, refetch: refetchActiveTables } = usePolling(fetchActiveOverview, 5000);

  return (
    <DashboardDataContext.Provider
      value={{ orders, waiterCalls, activeTables, refetchOrders, refetchWaiterCalls, refetchActiveTables }}
    >
      {children}
    </DashboardDataContext.Provider>
  );
}

export function useDashboardData(): DashboardDataValue {
  const ctx = useContext(DashboardDataContext);
  if (!ctx) {
    throw new Error('useDashboardData precisa ser usado dentro de DashboardDataProvider.');
  }
  return ctx;
}
