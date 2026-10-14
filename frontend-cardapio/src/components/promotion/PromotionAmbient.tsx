import { withAlpha } from '../../lib/promotionPresentation';

// Iluminação ambiente atrás do banner (estilo YouTube). Só decoração:
// aria-hidden, sem interação e sem animação.
// Desempenho: no celular só gradientes (baratos); a foto desfocada, que custa
// mais para pintar, só entra de md para cima e uma única vez (estática).
export function PromotionAmbient({ color, imageUrl }: { color: string; imageUrl?: string | null }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 h-[520px] md:h-[640px] overflow-hidden"
    >
      <div
        className="absolute inset-0 opacity-70 dark:opacity-100"
        style={{
          background: `radial-gradient(70% 60% at 25% 0%, ${withAlpha(color, 0.3)}, transparent 70%), radial-gradient(50% 50% at 92% 8%, ${withAlpha(color, 0.18)}, transparent 70%)`,
        }}
      />
      {imageUrl && (
        <img
          src={imageUrl}
          alt=""
          decoding="async"
          draggable={false}
          className="hidden md:block absolute -top-16 -left-10 w-[60%] h-[420px] object-cover blur-3xl scale-110 saturate-150 opacity-25 dark:opacity-30"
        />
      )}
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-b from-transparent to-[#FFFFFF] dark:to-[#131314]" />
    </div>
  );
}
