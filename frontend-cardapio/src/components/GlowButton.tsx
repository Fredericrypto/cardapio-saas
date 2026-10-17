import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import './glass-card.css';

interface GlowButtonProps {
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  // Mostra o giro no lugar do ícone e deixa o botão em modo "carregando".
  loading?: boolean;
  icon?: ReactNode;
  className?: string;
  // Anel com os dois pontos de luz sempre visíveis (mesma luz da borda do painel de avaliações).
  orbit?: boolean;
  ariaLabel?: string;
}

// Botão terracota com anel de luz que circula pela borda (mesmo botão "Entrar" do login do
// painel). O anel é discreto em repouso e acende no hover/foco.
export function GlowButton({
  onClick,
  children,
  disabled = false,
  loading = false,
  icon,
  className = '',
  orbit = false,
  ariaLabel,
}: GlowButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-label={ariaLabel}
      className={`gc-btn ${orbit ? 'gc-btn--orbit' : ''} ${className}`}
    >
      <span className="gc-btn__ring" aria-hidden="true" />
      <span className="gc-btn__halo" aria-hidden="true" />
      <span className="gc-btn__fill">
        {loading ? <Loader2 size={16} strokeWidth={1.75} className="gc-spin" aria-hidden="true" /> : icon}
        {children}
      </span>
    </button>
  );
}
