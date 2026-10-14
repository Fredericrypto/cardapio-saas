import { useEffect, useState } from 'react';
import { useTenant } from '../contexts/TenantContext';
import { useTableSessionContext } from '../contexts/TableSessionContext';
import { useSelectedLocation } from './useSelectedLocation';
import { fetchLocationById } from '../lib/menu-api';
import type { Location } from '../types';

// Loja ativa do cliente, nos dois fluxos — mesma resolução do MenuPage e do
// PromotionDetailPage: mesa => a loja da própria mesa escaneada; fluxo geral
// => a loja escolhida. `isReady` só vira true quando dá pra buscar promoções
// com a locationId certa (promoção restrita a loja some da lista sem ela).
export function useActiveMenuLocation(isTableFlow: boolean): { location: Location | null; isReady: boolean } {
  const { tenant } = useTenant();
  const session = useTableSessionContext()?.session ?? null;
  const { location: selectedLocation, isLoading } = useSelectedLocation(!isTableFlow ? tenant?.id : undefined);

  const [tableLocation, setTableLocation] = useState<Location | null>(null);
  const tableLocationId = session?.table?.locationId;
  useEffect(() => {
    if (!isTableFlow || !tenant || !tableLocationId) return;
    let stale = false;
    fetchLocationById(tenant.id, tableLocationId).then((loc) => {
      if (!stale) setTableLocation(loc);
    });
    return () => {
      stale = true;
    };
  }, [isTableFlow, tenant, tableLocationId]);

  const location = isTableFlow ? tableLocation : selectedLocation;
  const isReady = isTableFlow
    ? !tableLocationId || tableLocation?.id === tableLocationId
    : Boolean(tenant) && !isLoading;
  return { location, isReady };
}
