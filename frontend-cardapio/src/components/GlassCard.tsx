import { useRef, useState } from 'react';
import type { CSSProperties, PointerEvent, ReactNode } from 'react';
import './glass-card.css';

interface GlassCardProps {
  children: ReactNode;
  // Pontos de luz circulando pela borda (só para o cartão de destaque da página; nos
  // cartões de lista fica desligado para não animar dezenas de bordas ao mesmo tempo).
  orbit?: boolean;
  // Raio dos cantos em px (o vidro, o brilho e a borda de luz acompanham).
  radius?: number;
  // false = sem o brilho que segue o cursor (e sem acender a borda no hover); os pontos de luz
  // da órbita ficam sempre visíveis. Padrão true (comportamento original dos outros usos).
  cursorGlow?: boolean;
  // Classes do invólucro (posição, sticky, margens) e do corpo (padding, layout interno).
  className?: string;
  bodyClassName?: string;
}

// Cartão de vidro com o mesmo efeito do login do painel: com o mouse em cima, um brilho
// segue o cursor por dentro do vidro e a borda acende perto dele; com `orbit`, quando o mouse
// sai, dois pontos de luz passam a circular só pela borda, começando por onde o mouse saiu.
// Toque (celular) não tem "hover": só a órbita (quando ligada). Estilos em glass-card.css (.gc-*).
export function GlassCard({
  children,
  orbit = false,
  radius = 24,
  cursorGlow = true,
  className = '',
  bodyClassName = '',
}: GlassCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [hovering, setHovering] = useState(false);
  const [orbitKey, setOrbitKey] = useState(0);
  const [startAngle, setStartAngle] = useState(200);

  function place(e: PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--gc-mx', `${e.clientX - rect.left}px`);
    el.style.setProperty('--gc-my', `${e.clientY - rect.top}px`);
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
    if (orbit && el) {
      const rect = el.getBoundingClientRect();
      const dx = e.clientX - (rect.left + rect.width / 2);
      const dy = e.clientY - (rect.top + rect.height / 2);
      // Ângulo (a partir do topo, sentido horário) do ponto de saída; o cometa nasce aí.
      setStartAngle((Math.atan2(dx, -dy) * 180) / Math.PI - 36);
      setOrbitKey((k) => k + 1);
    }
    setHovering(false);
  }

  return (
    <div
      ref={ref}
      className={`gc-card ${hovering ? 'is-hover' : ''} ${className}`}
      style={{ '--gc-r': `${radius}px` } as CSSProperties}
      onPointerEnter={cursorGlow ? handleEnter : undefined}
      onPointerMove={cursorGlow ? handleMove : undefined}
      onPointerLeave={cursorGlow ? handleLeave : undefined}
    >
      <div className="gc-card__glass" />
      {cursorGlow && (
        <div className="gc-card__fx" aria-hidden="true">
          <span className="gc-spot" />
          <span className="gc-edge" />
        </div>
      )}
      {orbit && (
        <span
          key={orbitKey}
          aria-hidden="true"
          className="gc-orbit-wrap"
          style={{ '--gc-a0': `${startAngle}deg` } as CSSProperties}
        >
          <span className="gc-orbit-glow">
            <span className="gc-orbit" />
          </span>
          <span className="gc-orbit" />
        </span>
      )}
      <div className={`gc-card__body ${bodyClassName}`}>{children}</div>
    </div>
  );
}
