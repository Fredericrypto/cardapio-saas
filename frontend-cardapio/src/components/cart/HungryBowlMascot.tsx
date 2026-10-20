import { useId } from 'react';
import './hungry-bowl.css';

interface HungryBowlMascotProps {
  /** Largura/altura renderizadas (número em px ou string CSS, ex.: '100%'). */
  size?: number | string;
  className?: string;
  /** true = pose estática (o prefers-reduced-motion do sistema já é respeitado sozinho). */
  reducedMotion?: boolean;
  /** Decorativo (padrão): escondido de leitores de tela. */
  decorative?: boolean;
  /** Texto acessível, usado só quando `decorative` for false. */
  label?: string;
}

// "Hungry Little Bowl": tigela de cerâmica original, vazia e curiosa. SVG inline, sem rede,
// sem dependência, neutra (não usa a cor do restaurante). Animação 100% CSS (hungry-bowl.css).
export function HungryBowlMascot({
  size = 170,
  className = '',
  reducedMotion = false,
  decorative = true,
  label,
}: HungryBowlMascotProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const gid = (name: string) => `hb-${name}-${uid}`;
  const ref = (name: string) => `url(#${gid(name)})`;
  const BROWN = '#49372F';
  const OUTLINE = '#E2CFB5';

  const eye = (x: number) => (
    <g transform={`translate(${x} 118)`}>
      <ellipse rx="8" ry="10.5" fill={BROWN} />
      <circle cx="-2.8" cy="-3.6" r="3.2" fill="#FFFFFF" />
      <circle cx="3" cy="3.8" r="1.5" fill="#FFFFFF" opacity="0.85" />
    </g>
  );

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={`hb${reducedMotion ? ' hb--static' : ''}${className ? ` ${className}` : ''}`}
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : label}
      focusable="false"
    >
      <defs>
        <linearGradient id={gid('body')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#EAD9C2" />
          <stop offset="0.14" stopColor="#FFF4E5" />
          <stop offset="0.68" stopColor="#FFF4E5" />
          <stop offset="1" stopColor="#E5D2BA" />
        </linearGradient>
        <linearGradient id={gid('side')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#E5D2BA" stopOpacity="0.55" />
          <stop offset="0.24" stopColor="#E5D2BA" stopOpacity="0" />
          <stop offset="0.76" stopColor="#E5D2BA" stopOpacity="0" />
          <stop offset="1" stopColor="#E5D2BA" stopOpacity="0.65" />
        </linearGradient>
        <linearGradient id={gid('rim')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FFF1DE" />
          <stop offset="0.5" stopColor="#FFFBF3" />
          <stop offset="1" stopColor="#F4E3CB" />
        </linearGradient>
        <linearGradient id={gid('inner')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#D6BFA0" />
          <stop offset="1" stopColor="#EEDDC6" />
        </linearGradient>
      </defs>

      <ellipse className="hb-shadow" cx="100" cy="177" rx="54" ry="7" fill="#000000" opacity="0.16" />

      <g className="hb-body">
        <ellipse cx="100" cy="169" rx="28" ry="6" fill="#E5D2BA" />
        <path
          d="M40 78 C40 130 62 168 100 168 C138 168 160 130 160 78 Z"
          fill={ref('body')}
          stroke={OUTLINE}
          strokeWidth="1.2"
        />
        <path d="M40 78 C40 130 62 168 100 168 C138 168 160 130 160 78 Z" fill={ref('side')} />
        <path d="M52 104 C50 124 57 143 71 157" fill="none" stroke="#FFFFFF" strokeOpacity="0.6" strokeWidth="4" strokeLinecap="round" />

        {/* Boca da tigela: a parte de dentro (vazia) aparece mais quando ela "olha" para baixo. */}
        <g className="hb-open">
          <ellipse cx="100" cy="78" rx="60" ry="14" fill={ref('rim')} stroke={OUTLINE} strokeWidth="1.2" />
          <ellipse cx="100" cy="79" rx="53" ry="10.5" fill={ref('inner')} />
          <ellipse cx="100" cy="85" rx="30" ry="2.6" fill="#FFFFFF" opacity="0.32" />
        </g>

        <g className="hb-face">
          <g className="hb-cheeks">
            <ellipse cx="66" cy="129" rx="9" ry="5.5" fill="#F2B8A0" />
            <ellipse cx="134" cy="129" rx="9" ry="5.5" fill="#F2B8A0" />
          </g>
          <g className="hb-look">
            <g className="hb-blink">
              {eye(80)}
              {eye(120)}
            </g>
          </g>
          <path className="hb-m1" d="M94.5 139.5 Q100 143.5 105.5 139.5" fill="none" stroke={BROWN} strokeWidth="2.4" strokeLinecap="round" />
          <path className="hb-m2" d="M95.5 142 Q100 138.5 104.5 142" fill="none" stroke={BROWN} strokeWidth="2.4" strokeLinecap="round" />
          <path className="hb-m3" d="M93 138 Q100 147 107 138" fill="none" stroke={BROWN} strokeWidth="2.4" strokeLinecap="round" />
        </g>

        <rect className="hb-arm hb-arm--l" x="37" y="120" width="14" height="30" rx="7" fill="#FFF4E5" stroke={OUTLINE} strokeWidth="1.2" />
        <rect className="hb-arm hb-arm--r" x="149" y="120" width="14" height="30" rx="7" fill="#FFF4E5" stroke={OUTLINE} strokeWidth="1.2" />
      </g>
    </svg>
  );
}
