import type { LucideIcon } from 'lucide-react';

interface IconBadgeProps {
  icon: LucideIcon;
  // Sem cor explícita, o distintivo segue o tema (claro: #F3F4F6 / #374151;
  // escuro: #282A2C com borda white/10 / #C4C7C5). Com cor explícita (ex.:
  // cashback #3d3846 / #c0bfbc) o valor recebido vale nos dois modos.
  backgroundColor?: string;
  iconColor?: string;
  size?: number;
}

// Ícone dentro de um quadrado com cantos bem arredondados — o visual de
// "categoria"/"item de menu" que o iFood usa em praticamente toda a UI
// (home, categorias, itens de conta). Reaproveitado em qualquer lista de
// opções da área do cliente. Traço fino (strokeWidth 1.5), padrão do app.
export function IconBadge({ icon: Icon, backgroundColor, iconColor, size = 44 }: IconBadgeProps) {
  const themedBg = backgroundColor === undefined;
  const themedIcon = iconColor === undefined;
  return (
    <div
      className={`flex items-center justify-center rounded-2xl shrink-0 ${
        themedBg ? 'bg-[#F3F4F6] dark:bg-[#282A2C] dark:border dark:border-white/10' : ''
      }`}
      style={{ width: size, height: size, ...(themedBg ? {} : { backgroundColor }) }}
    >
      <Icon
        size={size * 0.5}
        strokeWidth={1.5}
        color={iconColor}
        className={themedIcon ? 'text-[#374151] dark:text-[#C4C7C5]' : undefined}
      />
    </div>
  );
}
