import { ArrowLeft } from 'lucide-react';
import { Tooltip } from './Tooltip';
import { PROMO_FOCUS } from '../lib/promotionTheme';

// Botão "voltar" de VIDRO, colocado FORA do card da imagem (acima dele). Fica dentro
// do mesmo contexto `isolate` do card, então a luz ambiente (PromotionAmbient, que
// transborda do card) passa por trás e o `backdrop-blur` a desfoca — efeito vidro.
// Só apresentação: quem decide para onde voltar é o `onClick` da página.
export function GlassBackButton({
  onClick,
  label,
  tooltip,
  className = '',
}: {
  onClick: () => void;
  /** aria-label do botão. */
  label: string;
  /** Texto do Tooltip (hover e foco). */
  tooltip: string;
  className?: string;
}) {
  return (
    <Tooltip label={tooltip} className="contents">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={`relative flex h-10 w-10 items-center justify-center rounded-full border border-white/50 bg-white/30 text-[#111827] shadow-lg ring-1 ring-black/5 backdrop-blur-xl backdrop-saturate-150 transition hover:scale-105 hover:bg-white/45 motion-reduce:transform-none dark:border-white/15 dark:bg-white/10 dark:text-[#E3E2E6] dark:hover:bg-white/15 ${PROMO_FOCUS} ${className}`}
      >
        <ArrowLeft size={18} strokeWidth={1.5} />
      </button>
    </Tooltip>
  );
}
