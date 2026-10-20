import type { CSSProperties, ReactNode } from 'react';
import './food-friends.css';

interface FoodFriendsProps {
  className?: string;
  /** true = poses estáticas (o prefers-reduced-motion do sistema já é respeitado sozinho). */
  reducedMotion?: boolean;
}

const INK = '#4A2F27';
const OUT = { stroke: INK, strokeWidth: 3, strokeLinejoin: 'round', strokeLinecap: 'round' } as const;

type MouthKind = 'smile' | 'open' | 'cat';

function Mouth({ cx, y, kind }: { cx: number; y: number; kind: MouthKind }) {
  if (kind === 'open') {
    return (
      <path
        d={`M${cx - 4.2} ${y - 0.5} Q${cx} ${y + 9.5} ${cx + 4.2} ${y - 0.5}Z`}
        fill="#B8453F"
        stroke={INK}
        strokeWidth="2"
        strokeLinejoin="round"
      />
    );
  }
  const d =
    kind === 'cat'
      ? `M${cx - 6} ${y} Q${cx - 3} ${y + 4.5} ${cx} ${y} Q${cx + 3} ${y + 4.5} ${cx + 6} ${y}`
      : `M${cx - 3.8} ${y} Q${cx} ${y + 5} ${cx + 3.8} ${y}`;
  return <path d={d} fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />;
}

// Rostinho compartilhado: bochechas, olhos que piscam e olham de lado, boca.
function Face({ cx = 50, cy, gap = 11, mouth = 'smile' }: { cx?: number; cy: number; gap?: number; mouth?: MouthKind }) {
  return (
    <g>
      <ellipse cx={cx - gap - 6} cy={cy + 5} rx="4.4" ry="2.9" fill="#F59BA6" opacity="0.75" />
      <ellipse cx={cx + gap + 6} cy={cy + 5} rx="4.4" ry="2.9" fill="#F59BA6" opacity="0.75" />
      <g className="fx-blink">
        <g className="fx-look">
          {[cx - gap, cx + gap].map((x) => (
            <g key={x}>
              <ellipse cx={x} cy={cy} rx="4.2" ry="5" fill={INK} />
              <circle cx={x - 1.4} cy={cy - 1.8} r="1.7" fill="#FFFFFF" />
            </g>
          ))}
        </g>
      </g>
      <Mouth cx={cx} y={cy + 9} kind={mouth} />
    </g>
  );
}

const Sandwich = () => (
  <>
    <g {...OUT}>
      <rect x="12" y="70" width="76" height="16" rx="8" fill="#F1CF94" />
      <path d="M20 66 H88 L96 76 H20Z" fill="#FFD04D" />
      <rect x="16" y="64" width="68" height="7" rx="3.5" fill="#F0685A" />
      <path d="M10 62 Q16 72 24 64 Q32 72 40 64 Q48 72 56 64 Q64 72 72 64 Q80 72 90 62 V56 H10Z" fill="#8FD16B" />
      <path d="M12 60 Q10 24 50 24 Q90 24 88 60Z" fill="#FBE4B8" />
    </g>
    <Face cy={44} gap={11} />
  </>
);

const Burger = () => (
  <>
    <g {...OUT}>
      <path d="M14 66 H86 Q86 86 50 86 Q14 86 14 66Z" fill="#F2A93B" />
      <rect x="10" y="52" width="80" height="14" rx="7" fill="#7A4A32" />
      <path d="M18 52 H82 L74 63 L64 54 L54 64 L44 54 L34 63Z" fill="#FFD24A" />
      <path d="M14 52 Q14 22 50 22 Q86 22 86 52Z" fill="#F2A93B" />
    </g>
    <g fill="#FFF3D6">
      <ellipse cx="28" cy="38" rx="2.4" ry="1.3" transform="rotate(-20 28 38)" />
      <ellipse cx="72" cy="36" rx="2.4" ry="1.3" transform="rotate(20 72 36)" />
      <ellipse cx="40" cy="27" rx="2.4" ry="1.3" />
      <ellipse cx="60" cy="27" rx="2.4" ry="1.3" />
    </g>
    <Face cy={38} gap={10} mouth="cat" />
  </>
);

const Pizza = () => (
  <>
    <g {...OUT}>
      <path d="M16 26 Q50 16 84 26 L50 92Z" fill="#FFD34D" />
      <path d="M12 22 Q50 10 88 22 L84 30 Q50 20 16 30Z" fill="#E8993E" />
      <circle cx="42" cy="60" r="4.2" fill="#E5483E" strokeWidth="2" />
      <circle cx="59" cy="61" r="4.2" fill="#E5483E" strokeWidth="2" />
      <circle cx="50" cy="75" r="3.8" fill="#E5483E" strokeWidth="2" />
    </g>
    <Face cy={42} gap={9} mouth="open" />
  </>
);

const Cupcake = () => (
  <>
    <g {...OUT}>
      <path d="M26 62 H74 L68 90 H32Z" fill="#E85D5D" />
      <path d="M38 64 L40 88 M50 64 V88 M62 64 L60 88" strokeWidth="2" opacity="0.45" fill="none" />
      <path d="M20 64 Q14 44 32 42 Q32 24 50 24 Q68 24 68 42 Q86 44 80 64Z" fill="#FFC8D8" />
      <path d="M50 20 Q52 12 58 10" fill="none" strokeWidth="2.2" />
      <circle cx="50" cy="20" r="5.5" fill="#E8394A" strokeWidth="2.4" />
    </g>
    <g stroke="none">
      <rect x="30" y="47" width="5" height="2.4" rx="1.2" fill="#FFD24A" transform="rotate(-25 32 48)" />
      <rect x="66" y="46" width="5" height="2.4" rx="1.2" fill="#7CC4F2" transform="rotate(25 68 47)" />
      <rect x="42" y="31" width="5" height="2.4" rx="1.2" fill="#8FD16B" transform="rotate(15 44 32)" />
      <rect x="58" y="33" width="5" height="2.4" rx="1.2" fill="#FFD24A" transform="rotate(-15 60 34)" />
    </g>
    <Face cy={52} gap={11} />
  </>
);

const BubbleTea = () => (
  <>
    <path d="M62 30 L72 6" stroke={INK} strokeWidth="8" strokeLinecap="round" />
    <path d="M62 30 L72 6" stroke="#E8A0B0" strokeWidth="3.4" strokeLinecap="round" />
    <g {...OUT}>
      <path d="M27 36 H73 L68 88 Q67.5 91 65 91 H35 Q32.5 91 32 88Z" fill="#FDE3EA" />
      <path d="M29.2 62 H70.8 L68 88 Q67.5 91 65 91 H35 Q32.5 91 32 88Z" fill="#E7BFA5" stroke="none" />
      <path d="M27 36 H73 L68 88 Q67.5 91 65 91 H35 Q32.5 91 32 88Z" fill="none" />
      <circle cx="40" cy="83" r="3.2" fill="#5B3A2E" strokeWidth="1.5" />
      <circle cx="51" cy="85" r="3.2" fill="#5B3A2E" strokeWidth="1.5" />
      <circle cx="61" cy="82" r="3.2" fill="#5B3A2E" strokeWidth="1.5" />
      <circle cx="45" cy="74" r="3.2" fill="#5B3A2E" strokeWidth="1.5" />
      <circle cx="57" cy="74" r="3.2" fill="#5B3A2E" strokeWidth="1.5" />
      <path d="M30 30 Q28 13 50 13 Q72 13 70 30Z" fill="#FFFFFF" />
      <rect x="22" y="30" width="56" height="8" rx="4" fill="#FFFFFF" />
    </g>
    <Face cy={47} gap={9} />
  </>
);

const IceCream = () => (
  <>
    <g {...OUT}>
      <path d="M28 58 H72 L50 94Z" fill="#E8B56E" />
      <path d="M36 62 L52 86 M48 60 L62 74 M62 60 L44 80" strokeWidth="1.8" opacity="0.5" fill="none" />
      <path d="M44 28 Q46 12 54 8 Q52 16 58 28Z" fill="#FFC9DC" />
      <path d="M36 40 Q36 24 50 24 Q64 24 64 40Z" fill="#FFC9DC" />
      <path
        d="M22 60 Q16 34 50 34 Q84 34 78 60 Q74 68 68 62 Q62 70 56 63 Q50 70 44 63 Q38 70 32 62 Q26 68 22 60Z"
        fill="#FFB7CF"
      />
    </g>
    <Face cy={48} gap={10} />
  </>
);

const Taco = () => (
  <>
    <g {...OUT}>
      <path d="M12 50 Q14 22 28 30 Q34 14 50 22 Q66 14 72 30 Q86 22 88 50Z" fill="#86CC5E" />
      <circle cx="30" cy="36" r="3.2" fill="#EF5B4B" strokeWidth="1.5" />
      <circle cx="69" cy="35" r="3.2" fill="#EF5B4B" strokeWidth="1.5" />
      <circle cx="50" cy="30" r="3.2" fill="#EF5B4B" strokeWidth="1.5" />
      <path d="M8 78 Q8 36 50 36 Q92 36 92 78Z" fill="#F6C463" />
    </g>
    <path d="M18 70 Q18 50 38 45" fill="none" stroke="#FFFFFF" strokeOpacity="0.55" strokeWidth="3" strokeLinecap="round" />
    <Face cy={57} gap={12} mouth="open" />
  </>
);

const Fries = () => (
  <>
    <g {...OUT}>
      {(
        [
          [24, 24, 38],
          [34, 12, 50],
          [44, 20, 42],
          [54, 8, 54],
          [64, 18, 44],
        ] as const
      ).map(([x, y, h]) => (
        <rect key={x} x={x} y={y} width="10" height={h} rx="3.5" fill="#FFD54F" />
      ))}
      <path d="M22 56 H78 L73 92 H27Z" fill="#F0605F" />
    </g>
    <Face cy={72} gap={10} />
  </>
);

const Pancakes = () => (
  <>
    <g {...OUT}>
      <rect x="10" y="58" width="80" height="24" rx="12" fill="#EDB765" />
      <rect x="14" y="40" width="72" height="22" rx="11" fill="#F2C27B" />
      <path d="M20 42 Q16 22 50 22 Q84 22 80 42Z" fill="#FFFFFF" />
      <path d="M44 16 Q50 8 56 16 Q56 26 50 28 Q44 26 44 16Z" fill="#EF4B58" strokeWidth="2.4" />
      <path d="M45 13 L50 9 L55 13 L50 15Z" fill="#6FBF5A" strokeWidth="1.5" />
    </g>
    <Face cy={52} gap={11} />
  </>
);

const Toast = () => (
  <>
    <g {...OUT}>
      <path d="M22 88 V46 Q8 42 10 28 Q12 14 32 16 Q50 6 68 16 Q88 14 90 28 Q92 42 78 46 V88 Q78 90 76 90 H24 Q22 90 22 88Z" fill="#F3C98B" />
    </g>
    <g transform="translate(50 54) scale(0.8) translate(-50 -54)">
      <path d="M22 88 V46 Q8 42 10 28 Q12 14 32 16 Q50 6 68 16 Q88 14 90 28 Q92 42 78 46 V88 Q78 90 76 90 H24 Q22 90 22 88Z" fill="#FFE9BF" />
    </g>
    <Face cy={64} gap={12} mouth="open" />
    {/* Bracinhos redondinhos: o esquerdo acena para cima, o direito dá um tchauzinho curto. */}
    <g transform="translate(20 66)">
      <g className="fx-arm fx-arm--l" {...OUT}>
        <rect x="-5" y="0" width="10" height="15" rx="5" fill="#F3C98B" />
      </g>
    </g>
    <g transform="translate(80 66)">
      <g className="fx-arm fx-arm--r" {...OUT}>
        <rect x="-5" y="0" width="10" height="15" rx="5" fill="#F3C98B" />
      </g>
    </g>
  </>
);

interface Spec {
  draw: () => ReactNode;
  look: 1 | -1; // quem está na metade esquerda olha para a direita, e vice-versa
  bd: number; // atraso do movimento do corpo (s)
  ed: number; // atraso da piscada
  ld: number; // atraso do olhar de lado
  blink: 'a' | 'b';
  lk: 'a' | 'b';
}

const FRIENDS: Spec[] = [
  { draw: Sandwich, look: 1, bd: 0, ed: -0.4, ld: -2.0, blink: 'a', lk: 'a' },
  { draw: Burger, look: 1, bd: -1.7, ed: -2.1, ld: -0.5, blink: 'b', lk: 'b' },
  { draw: Pizza, look: 1, bd: -0.6, ed: -3.3, ld: -3.9, blink: 'a', lk: 'b' },
  { draw: Cupcake, look: 1, bd: -2.9, ed: -1.1, ld: -1.4, blink: 'b', lk: 'a' },
  { draw: BubbleTea, look: 1, bd: -1.2, ed: -4.2, ld: -2.8, blink: 'a', lk: 'a' },
  { draw: IceCream, look: -1, bd: -3.6, ed: -0.9, ld: -4.6, blink: 'b', lk: 'b' },
  { draw: Taco, look: -1, bd: -0.3, ed: -2.6, ld: -1.9, blink: 'a', lk: 'a' },
  { draw: Fries, look: -1, bd: -2.2, ed: -3.8, ld: -0.8, blink: 'b', lk: 'b' },
  { draw: Pancakes, look: -1, bd: -4.1, ed: -1.6, ld: -3.1, blink: 'a', lk: 'a' },
  { draw: Toast, look: -1, bd: -1.0, ed: -0.2, ld: -2.5, blink: 'b', lk: 'b' },
];

// Fileira de comidinhas fofas (SVG inline, sem rede, sem dependência). Decorativa: aria-hidden.
export function FoodFriends({ className = '', reducedMotion = false }: FoodFriendsProps) {
  return (
    <div
      aria-hidden="true"
      className={`ec-friends fx-row${reducedMotion ? ' fx-static' : ''}${className ? ` ${className}` : ''}`}
    >
      {FRIENDS.map((f, i) => (
        <svg
          key={i}
          viewBox="0 0 100 100"
          focusable="false"
          className={`fx fx-b${i + 1} fx-blink-${f.blink} fx-look-${f.lk}`}
          style={{ '--look': f.look, '--bd': `${f.bd}s`, '--ed': `${f.ed}s`, '--ld': `${f.ld}s` } as CSSProperties}
        >
          <ellipse cx="50" cy="95" rx="30" ry="3.5" fill="#000000" opacity="0.12" />
          <g className="fx-body">{f.draw()}</g>
        </svg>
      ))}
    </div>
  );
}
