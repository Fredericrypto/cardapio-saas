import { useEffect } from 'react';

interface FloatingNoticeProps {
  message: string;
  onDone: () => void;
  durationMs?: number;
}

// Aviso flutuante minimalista no topo da tela (não ocupa espaço no
// layout, não bloqueia toque) que some sozinho após `durationMs`
// (padrão 6s). Substitui a faixa preta fixa que ficava presa na tela.
export function FloatingNotice({ message, onDone, durationMs = 6000 }: FloatingNoticeProps) {
  useEffect(() => {
    const t = setTimeout(onDone, durationMs);
    return () => clearTimeout(t);
  }, [onDone, durationMs]);

  return (
    <div
      role="status"
      className="pointer-events-none fixed top-3 left-0 right-0 z-[60] flex justify-center px-4"
    >
      <p className="max-w-sm rounded-full bg-gray-900/90 px-4 py-2 text-center text-xs font-medium leading-snug text-white shadow-lg backdrop-blur-sm">
        {message}
      </p>
    </div>
  );
}
