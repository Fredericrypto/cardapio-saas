import type { Location } from '../types';
import { computeIsOpenNow, getMinutesUntilClose, getNextOpening, isOpen24hNow, type NextOpening } from './schedule';

// Textos do aviso de loja fechada: chaves store.closedEstablishment / store.closedHint.

// Visual atenuado (cinza) dos itens quando a loja está fechada. Só ESTILO: os
// cards continuam clicáveis para abrir e ler os detalhes.
export const CLOSED_MUTED_CLASS = 'grayscale opacity-70';


// ---------------------------------------------------------------------------
// STATUS DA LOJA NO MOMENTO EXATO
//
// `getStoreStatus` é a ÚNICA fonte do selo Aberto/Fechado, do texto de horário
// e da previsão do próximo expediente no app do cliente. Recalcula no aparelho
// com o MESMO algoritmo do servidor (lib/schedule.ts é cópia idêntica de
// backend/src/common/utils/schedule.ts), sempre no fuso America/Sao_Paulo e a
// partir do `now` recebido — quem renderiza passa o relógio de `useMinuteClock`,
// que vira na virada de cada minuto. Assim a loja que fecha às 23:00 mostra
// "Fechado" às 23:00:00, sem esperar nova requisição ao servidor.
// ---------------------------------------------------------------------------
export type StoreStatusSource = Pick<
  Location,
  'isOpen' | 'isOpenNow' | 'openingHours' | 'scheduleOpenState'
>;

export interface StoreStatus {
  isOpen: boolean;
  // Aberto 24h agora (só quando está aberto).
  isOpen24h: boolean;
  // Minutos até fechar quando faltam 60 ou menos; senão null.
  closingInMinutes: number | null;
  // Próxima abertura pela matriz de horários (só quando está fechado).
  nextOpening: NextOpening | null;
}

export function getStoreStatus(location: StoreStatusSource | null | undefined, now: Date = new Date()): StoreStatus {
  // Sem loja carregada ainda: comportamento antigo (assume aberto, sem aviso).
  if (!location) return { isOpen: true, isOpen24h: false, closingInMinutes: null, nextOpening: null };

  const hours = location.openingHours ?? null;
  // O servidor sempre manda `isOpen`; se por algum motivo faltar, confia no
  // `isOpenNow` calculado por ele em vez de inventar um valor.
  const isOpen =
    typeof location.isOpen === 'boolean'
      ? computeIsOpenNow(location.isOpen, hours, location.scheduleOpenState, now)
      : Boolean(location.isOpenNow);

  const minutes = getMinutesUntilClose(isOpen, hours, now);
  return {
    isOpen,
    isOpen24h: isOpen && isOpen24hNow(hours, now),
    closingInMinutes: minutes != null && minutes <= 60 ? minutes : null,
    nextOpening: isOpen ? null : getNextOpening(hours, now),
  };
}
