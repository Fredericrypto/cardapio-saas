import { BadgeCheck, Settings2 } from 'lucide-react';
import type { InternalNotification } from '../../types/notes';

// Avatar + nome + selo de verificado + cargo de quem disparou a ação.
// Sem foto: inicial sobre a cor do cargo (nunca emoji). "Sistema" usa ícone.

const VERIFIED_BLUE = '#1D9BF0'; // mesmo azul do selo de verificado do resto do painel

function initialOf(name: string): string {
  return (name.trim().charAt(0) || '?').toUpperCase();
}

export function NotificationAvatar({
  n,
  size = 36,
}: {
  n: Pick<InternalNotification, 'authorName' | 'authorAvatarUrl' | 'isSystem'>;
  size?: number;
}) {
  const style = { width: size, height: size };
  if (n.authorAvatarUrl) {
    return (
      <img
        src={n.authorAvatarUrl}
        alt=""
        style={style}
        className="rounded-full object-cover shrink-0 bg-gray-100"
        draggable={false}
      />
    );
  }
  return (
    <span
      style={{ ...style, fontSize: Math.round(size * 0.4) }}
      className="rounded-full shrink-0 bg-gray-900 text-white font-bold flex items-center justify-center"
      aria-hidden="true"
    >
      {n.isSystem ? <Settings2 size={Math.round(size * 0.5)} strokeWidth={1.5} /> : initialOf(n.authorName)}
    </span>
  );
}

export function NotificationAuthorLine({
  n,
  compact = false,
}: {
  n: Pick<InternalNotification, 'authorName' | 'authorVerified' | 'authorRoleLabel'>;
  compact?: boolean;
}) {
  return (
    <span className="flex items-center gap-1 min-w-0">
      <span className={`truncate font-semibold text-gray-700 ${compact ? 'text-[11px]' : 'text-xs'}`}>{n.authorName}</span>
      {n.authorVerified && (
        <BadgeCheck
          size={compact ? 12 : 14}
          strokeWidth={1.5}
          style={{ color: VERIFIED_BLUE }}
          className="shrink-0"
          aria-label="Verificado"
        />
      )}
      <span className={`shrink-0 text-gray-400 ${compact ? 'text-[11px]' : 'text-xs'}`}>· {n.authorRoleLabel}</span>
    </span>
  );
}
