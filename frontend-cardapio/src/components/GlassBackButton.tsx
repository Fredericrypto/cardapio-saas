import { ArrowLeft } from 'lucide-react';
import { Tooltip } from './Tooltip';
import { PROMO_FOCUS } from '../lib/promotionTheme';
import { MENU_BORDER, MENU_TEXT } from '../lib/menuTheme';

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
        className={`relative flex h-10 w-10 items-center justify-center rounded-full border bg-transparent shadow-sm ring-1 ring-black/5 backdrop-blur-md transition hover:scale-105 hover:bg-black/[0.03] motion-reduce:transform-none dark:hover:bg-white/[0.06] ${MENU_BORDER} ${MENU_TEXT} ${PROMO_FOCUS} ${className}`}
      >
        <ArrowLeft size={18} strokeWidth={1.5} />
      </button>
    </Tooltip>
  );
}
