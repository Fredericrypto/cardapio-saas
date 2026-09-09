// Mesmo azul clássico usado no painel do admin (#1D9BF0) — cor única de
// destaque reservada só pra isso, em todo o app, dos dois lados
// (admin e cliente). Nunca aparece sozinho: sempre ao lado de um avatar
// ou nome, nunca como indicador de outra coisa.
export const VERIFIED_BLUE = '#1D9BF0';

interface VerifiedBadgeProps {
  // 'icon': só o selinho (pra colar no canto de um avatar).
  // 'inline': selinho + texto "Verificado" (usado só nos dois lugares
  // que o Felipe definiu: "Aí na Mesa" do admin — já feito — e aqui, no
  // perfil do cliente).
  variant?: 'icon' | 'inline';
  size?: number;
}

export function VerifiedBadge({ variant = 'icon', size = 14 }: VerifiedBadgeProps) {
  if (variant === 'inline') {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs font-semibold"
        style={{ color: VERIFIED_BLUE }}
      >
        <CheckIcon size={size} />
        Verificado
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center justify-center rounded-full shrink-0"
      style={{ backgroundColor: VERIFIED_BLUE, width: size, height: size }}
      title="Cliente verificado"
    >
      <CheckIcon size={size * 0.6} color="white" />
    </span>
  );
}

function CheckIcon({ size, color = 'currentColor' }: { size: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={4}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
