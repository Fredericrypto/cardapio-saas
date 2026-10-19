// Ramo botânico em traço fino, decorativo (mesmo desenho do perfil do cliente).
// Folhas em pares ao longo de um caule curvo. Sem interação e escondido dos
// leitores de tela; quem posiciona e define a cor/opacidade é o chamador.
const LEAVES = [
  { x: 215, y: 237, r: -163, s: 1.05 },
  { x: 215, y: 237, r: -73, s: 1.0 },
  { x: 187, y: 185, r: -163, s: 1.0 },
  { x: 187, y: 185, r: -73, s: 0.95 },
  { x: 157, y: 132, r: -165, s: 0.95 },
  { x: 157, y: 132, r: -75, s: 0.9 },
  { x: 125, y: 78, r: -165, s: 0.85 },
  { x: 125, y: 78, r: -75, s: 0.8 },
  { x: 90, y: 20, r: -118, s: 0.8 },
];

export function MenuBotanical({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 260 300"
      fill="none"
      stroke="currentColor"
      strokeWidth="0.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M240 290C200 200 150 120 90 20" />
      {LEAVES.map((leaf, i) => (
        <g key={i} transform={`translate(${leaf.x} ${leaf.y}) rotate(${leaf.r}) scale(${leaf.s})`}>
          <path d="M0 0C8-11 26-15 42 0C26 15 8 11 0 0Z" />
          <path d="M0 0L38 0" />
        </g>
      ))}
    </svg>
  );
}
