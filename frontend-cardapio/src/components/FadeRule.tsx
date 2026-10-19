// Filetes e vidro com "fading away" (mesmo recurso da borda da navbar): o traço some nas pontas
// em vez de terminar seco. FadeRule = filete; GlassFade = desfoque de vidro que entra suave.
const FADE_H = 'linear-gradient(90deg, transparent, currentColor 18%, currentColor 82%, transparent)';
const FADE_V = 'linear-gradient(180deg, transparent, currentColor 18%, currentColor 82%, transparent)';

export function FadeRule({
  orientation = 'horizontal',
  className = '',
  tone = 'text-black/15 dark:text-white/15',
}: {
  orientation?: 'horizontal' | 'vertical';
  className?: string;
  /** Cor do filete (usa currentColor). */
  tone?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none block ${orientation === 'vertical' ? 'w-px' : 'h-px'} ${tone} ${className}`}
      style={{ background: orientation === 'vertical' ? FADE_V : FADE_H }}
    />
  );
}

// Camada de desfoque (backdrop-blur) que começa transparente na borda de cima e chega ao
// desfoque total em `fadeRem` — sem a linha reta onde o vidro começava. Fica ATRÁS do conteúdo
// do pai (-z-10): o pai precisa criar contexto de empilhamento (ex.: `relative z-10`).
// Quem usa define a posição pelas classes (`inset-0`, `top-0 inset-x-0 -bottom-4`...).
export function GlassFade({ className = '', fadeRem = 2 }: { className?: string; fadeRem?: number }) {
  const mask = `linear-gradient(to bottom, transparent, #000 ${fadeRem}rem)`;
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute -z-10 backdrop-blur-md ${className}`}
      style={{ WebkitMaskImage: mask, maskImage: mask }}
    />
  );
}
