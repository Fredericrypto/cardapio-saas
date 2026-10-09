import { useEffect, useState } from 'react';
import { fetchLocationById } from '../lib/menu-api';
import { useSelectedLocation } from './useSelectedLocation';
import { useTableSessionContext } from '../contexts/TableSessionContext';
import type { Location } from '../types';

// Loja "ativa" da tela — mesma regra do MenuPage/CartPage: no fluxo de mesa é a
// loja da mesa escaneada; no fluxo geral é a loja escolhida pelo cliente.
// Usada pelas telas de detalhe para saber se a loja está aberta (trava de pedido).
export function useActiveLocation(tenantId: string | undefined, isTableFlow: boolean): Location | null {
  const session = useTableSessionContext()?.session ?? null;
  const { location: selectedLocation } = useSelectedLocation(!isTableFlow ? tenantId : undefined);
  const [tableLocation, setTableLocation] = useState<Location | null>(null);
  const tableLocationId = session?.table?.locationId;

  useEffect(() => {
    if (!isTableFlow || !tenantId || !tableLocationId) return;
    let cancelled = false;
    fetchLocationById(tenantId, tableLocationId)
      .then((loc) => {
        if (!cancelled) setTableLocation(loc);
      })
      .catch(() => {
        // sem a loja, a tela segue sem a trava; o carrinho ainda bloqueia no checkout
      });
    return () => {
      cancelled = true;
    };
  }, [isTableFlow, tenantId, tableLocationId]);

  return isTableFlow ? tableLocation : selectedLocation;
}
