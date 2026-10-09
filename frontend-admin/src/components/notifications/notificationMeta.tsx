import { Pencil, StickyNote, Trash2 } from 'lucide-react';
import type { InternalNotification } from '../../types/notes';

// Ícones de traço fino por tipo de ação (nunca emoji).
export function NotificationIcon({ type, size = 16 }: { type: InternalNotification['type']; size?: number }) {
  if (type === 'note_deleted') return <Trash2 size={size} strokeWidth={1.5} />;
  if (type === 'note_updated') return <Pencil size={size} strokeWidth={1.5} />;
  return <StickyNote size={size} strokeWidth={1.5} />;
}

export const TYPE_TONE: Record<InternalNotification['type'], string> = {
  note_created: 'bg-emerald-50 text-emerald-600',
  note_updated: 'bg-amber-50 text-amber-600',
  note_deleted: 'bg-red-50 text-red-600',
};

export function formatNotificationTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function targetPath(n: InternalNotification): string {
  return n.type !== 'note_deleted' && n.noteId ? `/anotacoes?nota=${n.noteId}` : '/anotacoes';
}
