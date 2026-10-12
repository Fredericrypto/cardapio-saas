import type { LucideIcon } from 'lucide-react';

interface IconBadgeProps {
  icon: LucideIcon;
  backgroundColor?: string;
  iconColor?: string;
  size?: number;
}

// Ícone dentro de um quadrado com cantos bem arredondados — o visual de
// "categoria"/"item de menu" que o iFood usa em praticamente toda a UI
// (home, categorias, itens de conta). Reaproveitado em qualquer lista de
// opções da área do cliente.
export function IconBadge({
  icon: Icon,
  backgroundColor = '#F3F4F6',
  iconColor = '#374151',
  size = 44,
}: IconBadgeProps) {
  return (
    <div
      className="flex items-center justify-center rounded-2xl shrink-0"
      style={{ width: size, height: size, backgroundColor }}
    >
      <Icon size={size * 0.5} color={iconColor} />
    </div>
  );
}
