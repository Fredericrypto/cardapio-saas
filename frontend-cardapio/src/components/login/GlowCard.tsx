import { useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';

// Cartão de vidro da tela de login.
// - Com o mouse em cima: um brilho segue o cursor por dentro do vidro e a borda acende perto dele.
// - Quando o mouse sai: o brilho se desfaz e dois pontos de luz passam a circular só pela borda,
//   devagar, começando exatamente por onde o mouse saiu.
// Toque (celular) não tem "hover": a borda circula o tempo todo. Estilos em login.css (.lg-*).
export function GlowCard({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hovering, setHovering] = useState(false);
  const [orbitKey, setOrbitKey] = useState(0);
  const [startAngle, setStartAngle] = useState(200);

  function place(e: PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    el.style.setProperty('--my', `${e.clientY - rect.top}px`);
  }

  function handleEnter(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== 'mouse') return;
    place(e);
    setHovering(true);
  }

  function handleMove(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== 'mouse') return;
    place(e);
  }

  function handleLeave(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== 'mouse') return;
    const el = ref.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const dx = e.clientX - (rect.left + rect.width / 2);
      const dy = e.clientY - (rect.top + rect.height / 2);
      // Ângulo (a partir do topo, no sentido horário) do ponto de saída; o cometa nasce aí.
      setStartAngle((Math.atan2(dx, -dy) * 180) / Math.PI - 36);
    }
    setOrbitKey((k) => k + 1);
    setHovering(false);
  }

  return (
    <div
      ref={ref}
      className={hovering ? 'lg-card is-hover' : 'lg-card'}
      onPointerEnter={handleEnter}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
    >
      <div className="lg-card__glass" />
      <div className="lg-card__fx" aria-hidden="true">
        <span className="lg-spot" />
        <span className="lg-edge" />
      </div>
      <span
        key={orbitKey}
        aria-hidden="true"
        className="lg-orbit-wrap"
        style={{ '--a0': `${startAngle}deg` } as CSSProperties}
      >
        <span className="lg-orbit-glow">
          <span className="lg-orbit" />
        </span>
        <span className="lg-orbit" />
      </span>
      <div className="lg-card__body">{children}</div>
    </div>
  );
}
