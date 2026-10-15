import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { PromotionAmbient } from './PromotionAmbient';

// Bloco da imagem da promoção: mostra a imagem INTEIRA (proporção original, sem
// corte) e limita a largura para que a altura nunca passe da altura da tela.
// A conta usa a proporção real da imagem (lida ao carregar):
//   largura máx = (altura da tela - espaço reservado) x proporção
// Assim imagens verticais ficam mais estreitas em vez de exigirem rolagem; as
// horizontais continuam ocupando a largura toda da coluna.
// O espaço reservado cobre o respiro da página e o painel de baixo. Há um piso
// de largura (16rem / 20rem) para a imagem não sumir em janelas muito baixas.
// A luz ambiente da imagem fica colada nela; o painel tem a sua própria.
export function PromotionMedia({
  imageUrl,
  alt,
  primaryColor,
  grayscale = false,
  overlay,
  topBar,
  panel,
}: {
  imageUrl?: string | null;
  alt: string;
  primaryColor: string;
  grayscale?: boolean;
  /** Botões sobre a imagem (voltar/compartilhar). */
  overlay?: ReactNode;
  /** Acima do card, FORA dele (ex.: botão voltar de vidro). Fica no mesmo contexto da
   *  luz ambiente, então a luz passa por trás. */
  topBar?: ReactNode;
  /** Painel colocado abaixo da imagem, alinhado a ela. */
  panel?: ReactNode;
}) {
  const [ratio, setRatio] = useState(16 / 10);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Imagem já em cache: o onLoad pode ter disparado antes de a gente ouvir.
  useEffect(() => {
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth > 0 && el.naturalHeight > 0) {
      setRatio(el.naturalWidth / el.naturalHeight);
    }
  }, [imageUrl]);

  const effectiveRatio = imageUrl ? ratio : 16 / 9;

  return (
    <div
      className="isolate mx-auto w-full max-w-[max(16rem,calc((100dvh_-_14rem)*var(--promo-ratio)))] md:max-w-[max(16rem,calc((100dvh_-_18rem)*var(--promo-ratio)))] lg:max-w-[max(20rem,calc((100dvh_-_24rem)*var(--promo-ratio)))]"
      style={{ '--promo-ratio': effectiveRatio } as React.CSSProperties}
    >
      {/* A luz da imagem fica colada SOMENTE nela (mesmo raio nos 4 lados); o painel
          de baixo tem a luz dele (dentro do próprio painel). Os z-index negativos
          vivem neste contexto `isolate`: acima do fundo, abaixo de todo o conteúdo. */}
      {topBar && <div className="mb-2 flex">{topBar}</div>}
      <div className="relative">
        <PromotionAmbient color={primaryColor} imageUrl={grayscale ? null : imageUrl} />

        <div className="relative overflow-hidden rounded-2xl md:rounded-3xl bg-[#F3F4F6] dark:bg-[#282A2C] ring-1 ring-black/10 dark:ring-white/15 shadow-xl">
          {imageUrl ? (
            <img
              ref={imgRef}
              src={imageUrl}
              alt={alt}
              draggable={false}
              onLoad={(e: { currentTarget: HTMLImageElement }) => {
                const { naturalWidth, naturalHeight } = e.currentTarget;
                if (naturalWidth > 0 && naturalHeight > 0) setRatio(naturalWidth / naturalHeight);
              }}
              className={`block w-full h-auto ${grayscale ? 'grayscale' : ''}`}
            />
          ) : (
            <div
              className="w-full aspect-[16/9]"
              style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}99)` }}
            />
          )}
          {overlay}
        </div>
      </div>

      {panel && <div className="mt-4">{panel}</div>}
    </div>
  );
}
