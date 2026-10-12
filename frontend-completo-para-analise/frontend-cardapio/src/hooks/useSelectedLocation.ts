import { useCallback, useEffect, useState } from 'react';
import { fetchLocations, fetchLocationById } from '../lib/menu-api';
import type { Location } from '../types';

function storageKey(tenantId: string): string {
  return `cardapio_selected_location_${tenantId}`;
}

// Standalone, fora do hook — usado por telas que precisam corrigir
// qual loja está selecionada ANTES de navegar pro cardápio genérico
// (ex: TableSessionGate, quando não consegue abrir uma mesa e manda o
// cliente pro cardápio geral — sem isso, cairia na última loja
// escolhida manualmente antes, que pode ser uma filial completamente
// diferente da que o cliente está fisicamente na frente agora). O
// cardápio genérico lê esse mesmo localStorage sozinho ao montar, via
// `useSelectedLocation` abaixo — não precisa reagir na hora aqui.
export function presetSelectedLocationId(tenantId: string, locationId: string) {
  localStorage.setItem(storageKey(tenantId), locationId);
}

// Guarda qual loja o cliente escolheu (balcão/entrega) — persistido no
// localStorage, sobrevive fechar e reabrir o navegador. Mesa não usa
// isso: resolve sozinha pela mesa escaneada, sem escolha nenhuma.
export function useSelectedLocation(tenantId: string | undefined) {
  const [location, setLocationState] = useState<Location | null>(null);
  const [locations, setLocations] = useState<Location[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;

    async function load() {
      const allLocations = await fetchLocations(tenantId!);
      if (cancelled) return;
      setLocations(allLocations);

      const savedId = localStorage.getItem(storageKey(tenantId!));
      if (savedId) {
        const saved = allLocations.find((l) => l.id === savedId);
        if (saved) {
          setLocationState(saved);
          setIsLoading(false);
          return;
        }
      }

      // Só uma loja? Nem precisa escolher — usa ela direto.
      if (allLocations.length === 1) {
        localStorage.setItem(storageKey(tenantId!), allLocations[0].id);
        setLocationState(allLocations[0]);
      }
      setIsLoading(false);
    }

    load().catch(() => setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const selectLocation = useCallback(
    (loc: Location) => {
      if (!tenantId) return;
      localStorage.setItem(storageKey(tenantId), loc.id);
      setLocationState(loc);
    },
    [tenantId],
  );

  const clearLocation = useCallback(() => {
    if (!tenantId) return;
    localStorage.removeItem(storageKey(tenantId));
    setLocationState(null);
  }, [tenantId]);

  // Reconsulta os dados frescos da loja escolhida (aberto/fechado,
  // horário) sem precisar escolher de novo — usado quando o cardápio já
  // está aberto e só quer atualizar o status.
  const refreshLocation = useCallback(async () => {
    if (!tenantId || !location) return;
    const fresh = await fetchLocationById(tenantId, location.id);
    setLocationState(fresh);
  }, [tenantId, location?.id]);

  return { location, locations, isLoading, selectLocation, clearLocation, refreshLocation };
}
