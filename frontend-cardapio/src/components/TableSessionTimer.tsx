import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import type { TableSession } from '../types';

interface TableSessionTimerProps {
  session: TableSession;
  onExpiryTick: () => void;
}

// Badge minimalista de canto, só aparece quando existe um prazo correndo
// (`session.expiresAt` presente) — some sozinho assim que o primeiro
// pedido é feito (o backend para de mandar `expiresAt` na resposta
// nesse caso — ver TablesService.withTimerInfo). Quando o relógio do
// CLIENTE bate o prazo, chama `onExpiryTick` (que reconsulta o backend —
// fonte da verdade — antes de mostrar a tela de expirado, evitando
// mostrar "expirado" só por causa de o relógio do celular estar um
// pouco adiantado).
export function TableSessionTimer({ session, onExpiryTick }: TableSessionTimerProps) {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    if (!session.expiresAt) {
      setRemainingMs(null);
      return;
    }
    const deadline = new Date(session.expiresAt).getTime();

    function tick() {
      const remaining = deadline - Date.now();
      setRemainingMs(remaining);
      if (remaining <= 0) {
        onExpiryTick();
      }
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.expiresAt]);

  if (remainingMs == null || remainingMs <= 0) return null;

  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  // Últimos 2 minutos ganham destaque vermelho — aviso visual real, não
  // só decorativo, de que o prazo está acabando de verdade.
  const isUrgent = remainingMs < 120_000;

  return (
    <div
      className={`fixed top-3 right-3 z-40 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm ${
        isUrgent ? 'bg-red-50 text-red-600' : 'bg-white/90 text-gray-600'
      }`}
    >
      <Clock size={13} />
      <span>
        {minutes}:{seconds.toString().padStart(2, '0')} pra pedir
      </span>
    </div>
  );
}
