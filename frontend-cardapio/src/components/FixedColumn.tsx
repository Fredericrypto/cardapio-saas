import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

// Coluna que fica FIXA na tela enquanto a página rola (só em telas largas). Não usa `sticky`
// porque ele deixa de funcionar quando algum ancestral tem overflow; aqui a posição é medida
// no espaço reservado (`holder`) e o conteúdo vira `position: fixed` exatamente em cima dele.
// Abaixo de `minWidth` volta ao fluxo normal. Se o conteúdo for mais alto que a tela, rola por dentro.
export function FixedColumn({
  children,
  top = 96,
  minWidth = 1024,
  className = '',
}: {
  children: ReactNode;
  top?: number;
  minWidth?: number;
  className?: string;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ left: number; width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const h = holder.current;
    const i = inner.current;
    if (!h || !i) return;
    const mq = window.matchMedia(`(min-width: ${minWidth}px)`);
    const update = () => {
      if (!mq.matches) {
        setBox(null);
        return;
      }
      const r = h.getBoundingClientRect();
      const next = { left: r.left, width: r.width, height: i.offsetHeight };
      setBox((prev) =>
        prev && prev.left === next.left && prev.width === next.width && prev.height === next.height ? prev : next,
      );
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(h);
    ro.observe(i);
    window.addEventListener('resize', update);
    mq.addEventListener('change', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
      mq.removeEventListener('change', update);
    };
  }, [minWidth]);

  return (
    <div ref={holder} className={className} style={box ? { minHeight: box.height } : undefined}>
      <div
        ref={inner}
        style={
          box
            ? {
                position: 'fixed',
                top,
                left: box.left,
                width: box.width,
                maxHeight: `calc(100vh - ${top + 24}px)`,
                overflowY: 'auto',
                padding: 8,
                margin: -8,
              }
            : undefined
        }
      >
        {children}
      </div>
    </div>
  );
}
