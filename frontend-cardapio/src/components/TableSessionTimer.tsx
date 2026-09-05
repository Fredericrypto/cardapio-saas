import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import type { TableSession } from '../types';

interface TableSessionTimerProps {
  session: TableSession;
  onExpiryTick: () => void;
  // 'fixed' (padrão): badge flutuante de canto, posição absoluta.
  // 'inline': só o conteúdo, sem posicionamento — pra encaixar dentro de
  // outro layout (ex: ao lado do nome do restaurante no header).
  variant?: 'fixed' | 'inline';
}

// Badge minimalista de canto, só aparece quando existe um prazo correndo
// (`session.expiresAt` presente) — some sozinho assim que o primeiro
// pedido é feito (o backend para de mandar `expiresAt` na resposta
// nesse caso — ver TablesService.withTimerInfo). Quando o relógio do
// CLIENTE bate o prazo, chama `onExpiryTick` (que reconsulta o backend —
// fonte da verdade — antes de mostrar a tela de expirado, evitando
// mostrar "expirado" só por causa de o relógio do celular estar um
// pouco adiantado).
export function TableSessionTimer({
  session,
  onExpiryTick,
  variant = 'fixed',
}: TableSessionTimerProps) {
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

  const positionClass = variant === 'fixed' ? 'fixed top-3 right-3 z-40 shadow-sm' : '';

  return (
    <div
      className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${positionClass} ${
        isUrgent ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-500'
      }`}
    >
      <Clock size={12} />
      <span>
        {minutes}:{seconds.toString().padStart(2, '0')}
      </span>
    </div>
  );
}
