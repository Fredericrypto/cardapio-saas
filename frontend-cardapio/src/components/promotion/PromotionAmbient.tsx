import { withAlpha } from '../../lib/promotionPresentation';

// Luz ambiente estilo YouTube: uma cópia desfocada da própria imagem logo
// ATRÁS dela, do MESMO tamanho da imagem. O raio é igual nos quatro lados
// porque o próprio desfoque (gaussiano) cria o esmaecimento: não há máscara,
// recorte nem bordas retas. (Uma máscara no contêiner corta o que passa da
// borda dele e deixava o contorno quadriculado.)
// Uso: dentro de um `relative` colado na imagem, e dentro de um ancestral
// `isolate` (para o z-index negativo ficar acima do fundo da página e abaixo
// do conteúdo). Só decoração: aria-hidden, estático, sem animação.
// Intensidade: `opacity-40 dark:opacity-50` abaixo. Raio: `blur-xl md:blur-2xl`.
export function PromotionAmbient({ color, imageUrl }: { color: string; imageUrl?: string | null }) {
  const shape = 'rounded-2xl md:rounded-3xl';
  const blur = 'blur-xl md:blur-2xl';
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          decoding="async"
          draggable={false}
          className={`h-full w-full object-cover ${shape} ${blur} saturate-150 opacity-40 dark:opacity-50`}
        />
      ) : (
        <div className={`h-full w-full ${shape} ${blur}`} style={{ background: withAlpha(color, 0.4) }} />
      )}
    </div>
  );
}
