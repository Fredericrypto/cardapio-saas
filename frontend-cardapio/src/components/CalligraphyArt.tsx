import type { CSSProperties, ReactNode } from 'react';

// Caligrafia em PNG usada como MÁSCARA: a tinta vira a cor do texto atual (currentColor), então
// acompanha o tema claro/escuro sozinha. `accentSrc` é uma 2ª camada (mesmo tamanho) na cor
// terracota — usada p/ destacar "sabor.". Proporção fixa = sem salto de layout ao carregar.
function maskStyle(src: string): CSSProperties {
  return {
    WebkitMaskImage: `url(${src})`,
    maskImage: `url(${src})`,
    WebkitMaskSize: '100% 100%',
    maskSize: '100% 100%',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
  };
}

export function CalligraphyArt({
  src,
  accentSrc,
  width,
  height,
  alt,
  className = '',
  children,
}: {
  src: string;
  accentSrc?: string;
  width: number;
  height: number;
  alt: string;
  className?: string;
  children?: ReactNode; // sobreposto (ex.: coração), posicionado em % da imagem
}) {
  return (
    <div role="img" aria-label={alt} className={`relative w-full ${className}`} style={{ aspectRatio: `${width} / ${height}` }}>
      <span aria-hidden="true" className="absolute inset-0 bg-current" style={maskStyle(src)} />
      {accentSrc && <span aria-hidden="true" className="absolute inset-0 bg-[#d97757]" style={maskStyle(accentSrc)} />}
      {children}
    </div>
  );
}
