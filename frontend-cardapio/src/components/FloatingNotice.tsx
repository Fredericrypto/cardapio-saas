import { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface FloatingNoticeProps {
  message: string;
  onDone?: () => void;
  durationMs?: number;
  // Aviso fixo: NÃO some sozinho — quem renderiza decide quando tirar (ex:
  // "Garçom chamado" só sai quando o admin dispensa o chamado no painel).
  persistent?: boolean;
}

// Aviso estilo notificação push: horizontal, centralizado no topo da
// tela, bordas levemente arredondadas, some sozinho após `durationMs`
// (padrão 6s). Renderizado num portal em `document.body` — quem chama
// pode estar dentro de um ancestral com `transform`/`filter` (ex: o
// header do cardápio), e nesse caso `position: fixed` deixa de ser
// relativo à tela e o aviso ficava espremido do lado do ícone.
export function FloatingNotice({ message, onDone, durationMs = 6000, persistent = false }: FloatingNoticeProps) {
  useEffect(() => {
    if (persistent || !onDone) return;
    const t = setTimeout(onDone, durationMs);
    return () => clearTimeout(t);
  }, [onDone, durationMs, persistent]);

  return createPortal(
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-4"
      style={{ top: 'max(0.75rem, env(safe-area-inset-top))' }}
    >
      <p className="w-full max-w-sm rounded-xl bg-gray-900/95 px-4 py-3 text-center text-sm font-medium leading-snug text-white shadow-lg">
        {message}
      </p>
    </div>,
    document.body,
  );
}
