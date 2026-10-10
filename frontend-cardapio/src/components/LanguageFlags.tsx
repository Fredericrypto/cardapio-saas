import type { ReactElement } from 'react';
import type { LanguageOption } from '../i18n/languages';

// Bandeiras simples em SVG (sem emoji, sem imagem externa). Desenhos
// simplificados das bandeiras do Brasil, dos Estados Unidos e da Espanha.
type FlagProps = { size?: number };

function Frame({ size = 28, children }: FlagProps & { children: ReactElement }) {
  return (
    <svg
      width={size}
      height={Math.round(size * 0.75)}
      viewBox="0 0 640 480"
      style={{ borderRadius: 3, boxShadow: '0 0 0 1px rgba(0,0,0,0.12)', flexShrink: 0 }}
      role="img"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function FlagBR(props: FlagProps) {
  return (
    <Frame {...props}>
      <>
        <rect width="640" height="480" fill="#229e45" />
        <path d="M320 54 590 240 320 426 50 240Z" fill="#f8e509" />
        <circle cx="320" cy="240" r="108" fill="#2b3fb6" />
        <path d="M222 214c70-18 140-6 196 38" stroke="#fff" strokeWidth="18" fill="none" />
      </>
    </Frame>
  );
}

function FlagUS(props: FlagProps) {
  const stripes = Array.from({ length: 7 }, (_, i) => (
    <rect key={i} y={i * 2 * (480 / 13)} width="640" height={480 / 13} fill="#b22234" />
  ));
  const stars: ReactElement[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 6; col++) {
      stars.push(<circle key={`${row}-${col}`} cx={32 + col * 42} cy={30 + row * 40} r="7" fill="#fff" />);
    }
  }
  return (
    <Frame {...props}>
      <>
        <rect width="640" height="480" fill="#fff" />
        {stripes}
        <rect width="272" height={(480 / 13) * 7} fill="#3c3b6e" />
        {stars}
      </>
    </Frame>
  );
}

function FlagES(props: FlagProps) {
  return (
    <Frame {...props}>
      <>
        <rect width="640" height="480" fill="#c60b1e" />
        <rect y="120" width="640" height="240" fill="#ffc400" />
      </>
    </Frame>
  );
}

export function LanguageFlag({ flag, size }: { flag: LanguageOption['flag']; size?: number }) {
  if (flag === 'BR') return <FlagBR size={size} />;
  if (flag === 'US') return <FlagUS size={size} />;
  return <FlagES size={size} />;
}
