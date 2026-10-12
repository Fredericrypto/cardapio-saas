import type { Location } from '../types';
import { getStoreStatus, type StoreStatus, type StoreStatusSource } from '../lib/storeStatus';
import { useMinuteClock } from './useMinuteClock';

// Status da loja recalculado na virada de cada minuto (fuso America/Sao_Paulo).
// Use em qualquer tela que decida algo com "aberto/fechado" — assim o selo, o
// bloqueio do carrinho e o texto de horário concordam entre si.
export function useStoreStatus(location: Location | StoreStatusSource | null | undefined): StoreStatus {
  return getStoreStatus(location, useMinuteClock());
}
