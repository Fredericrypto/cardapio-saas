import { createContext, useContext } from 'react';
import type { TableSession } from '../types';

interface TableSessionContextValue {
  session: TableSession;
  recheckExpiry: () => Promise<void>;
}

const TableSessionContext = createContext<TableSessionContextValue | null>(null);

export const TableSessionProvider = TableSessionContext.Provider;

// Fora de uma rota `/mesa/:qrCodeToken/*` (fluxo geral de balcão/entrega)
// devolve `null` de propósito — MenuPage/CartPage/PromotionDetailPage
// são compartilhadas entre os dois fluxos, então precisam poder chamar
// isso incondicionalmente e checar `null` elas mesmas. Só páginas
// EXCLUSIVAS do fluxo de mesa (ex: MyAccountPage) podem assumir que
// nunca vem null.
export function useTableSessionContext(): TableSessionContextValue | null {
  return useContext(TableSessionContext);
}
