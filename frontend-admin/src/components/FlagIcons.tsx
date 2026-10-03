import type { ReactElement } from 'react';

// Bandeiras de Japão, China e Coreia do Sul para os tipos/grupos de categoria
// "Japonês", "Chinês" e "Coreano". Os vetores vêm do pacote open-source
// `flag-icons` (licença MIT, desenhos oficiais das bandeiras) — nada
// desenhado à mão. Proporção 4:3, cantos levemente arredondados.
type FlagProps = { size?: number; className?: string };

function Flag({ size = 20, className, children }: FlagProps & { children: ReactElement }) {
  return (
    <svg
      width={size}
      height={Math.round(size * 0.75)}
      viewBox="0 0 640 480"
      className={className}
      style={{ borderRadius: 2, boxShadow: '0 0 0 1px rgba(0,0,0,0.12)', flexShrink: 0 }}
      role="img"
    >
      {children}
    </svg>
  );
}

export function FlagJP(props: FlagProps) {
  return (
    <Flag {...props}>
      <>
        <defs>
          <clipPath id="fi-jp-a">
            <path fillOpacity=".7" d="M-88 32h640v480H-88z" />
          </clipPath>
        </defs>
        <g fillRule="evenodd" strokeWidth="1pt" clipPath="url(#fi-jp-a)" transform="translate(88 -32)">
          <path fill="#fff" d="M-128 32h720v480h-720z" />
          <circle cx="523.1" cy="344.1" r="194.9" fill="#bc002d" transform="translate(-168.4 8.6)scale(.76554)" />
        </g>
      </>
    </Flag>
  );
}

export function FlagCN(props: FlagProps) {
  return (
    <Flag {...props}>
      <>
        <defs>
          <path id="fi-cn-a" fill="#ff0" d="M-.6.8 0-1 .6.8-1-.3h2z" />
        </defs>
        <path fill="#ee1c25" d="M0 0h640v480H0z" />
        <use href="#fi-cn-a" width="30" height="20" transform="matrix(71.9991 0 0 72 120 120)" />
        <use href="#fi-cn-a" width="30" height="20" transform="matrix(-12.33562 -20.5871 20.58684 -12.33577 240.3 48)" />
        <use href="#fi-cn-a" width="30" height="20" transform="matrix(-3.38573 -23.75998 23.75968 -3.38578 288 95.8)" />
        <use href="#fi-cn-a" width="30" height="20" transform="matrix(6.5991 -23.0749 23.0746 6.59919 288 168)" />
        <use href="#fi-cn-a" width="30" height="20" transform="matrix(14.9991 -18.73557 18.73533 14.99929 240 216)" />
      </>
    </Flag>
  );
}

export function FlagKR(props: FlagProps) {
  return (
    <Flag {...props}>
      <>
        <defs>
          <clipPath id="fi-kr-a">
            <path fillOpacity=".7" d="M-95.8-.4h682.7v512H-95.8z" />
          </clipPath>
        </defs>
        <g fillRule="evenodd" clipPath="url(#fi-kr-a)" transform="translate(89.8 .4)scale(.9375)">
          <path fill="#fff" d="M-95.8-.4H587v512H-95.8Z" />
          <g transform="rotate(-56.3 361.6 -101.3)scale(10.66667)">
            <g id="fi-kr-c">
              <path id="fi-kr-b" fill="#000001" d="M-6-26H6v2H-6Zm0 3H6v2H-6Zm0 3H6v2H-6Z" />
              <use href="#fi-kr-b" width="100%" height="100%" y="44" />
            </g>
            <path stroke="#fff" d="M0 17v10" />
            <path fill="#cd2e3a" d="M0-12a12 12 0 0 1 0 24Z" />
            <path fill="#0047a0" d="M0-12a12 12 0 0 0 0 24A6 6 0 0 0 0 0Z" />
            <circle cy="-6" r="6" fill="#cd2e3a" />
          </g>
          <g transform="rotate(-123.7 191.2 62.2)scale(10.66667)">
            <use href="#fi-kr-c" width="100%" height="100%" />
            <path stroke="#fff" d="M0-23.5v3M0 17v3.5m0 3v3" />
          </g>
        </g>
      </>
    </Flag>
  );
}
