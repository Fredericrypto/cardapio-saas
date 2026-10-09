// Contrato do módulo Anotações + notificações internas (espelha o backend).

export interface Note {
  id: string;
  content: string;
  color: string;
  textColor: string;
  width: number;
  height: number;
  posX: number;
  posY: number;
  isPinned: boolean;
  isMinimized: boolean;
  authorName: string;
  lastEditedByName: string | null;
  tag: string;
  contentUpdatedAt: string;
  createdAt: string;
  updatedAt: string;
}

export type NoteDraft = Partial<Pick<Note, 'content' | 'color' | 'textColor' | 'tag' | 'width' | 'height' | 'posX' | 'posY' | 'isPinned' | 'isMinimized'>>;

export interface LayoutItem {
  id: string;
  posX: number;
  posY: number;
  width?: number;
  height?: number;
}

export type InternalNotificationType = 'note_created' | 'note_updated' | 'note_deleted';
export type NotificationTarget = 'owner' | 'owner_manager' | 'all';

export interface InternalNotification {
  id: string;
  type: InternalNotificationType;
  title: string;
  message: string;
  tag: string | null;
  authorName: string;
  authorRole: string;
  // Identidade de quem disparou a ação.
  authorAvatarUrl: string | null;
  authorVerified: boolean;
  authorRoleLabel: string; // "CEO", "Gerente", nome do cargo ou "Sistema"
  isSystem: boolean;
  targetRole: NotificationTarget;
  noteId: string | null;
  isRead: boolean;
  createdAt: string;
}
