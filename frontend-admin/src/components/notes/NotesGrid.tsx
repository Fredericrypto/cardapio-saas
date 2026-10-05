import type { Note } from '../../types/notes';
import { NoteCard } from './NoteCard';
import type { CardHandlers } from './NotesBoard';

interface Props extends CardHandlers {
  notes: Note[];
  tags: string[];
  editingId: string | null;
  highlightId: string | null;
}

// Visualização em lista/grid de cards: usada quando o usuário escolhe ou
// automaticamente em telas pequenas. Fixadas primeiro.
export function NotesGrid({ notes, tags, editingId, highlightId, ...handlers }: Props) {
  if (notes.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-16">
        Nenhuma anotação ainda. Use "Nova Anotação" para deixar o primeiro recado.
      </p>
    );
  }
  const ordered = [...notes].sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || +new Date(b.createdAt) - +new Date(a.createdAt));
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
      {ordered.map((note) => (
        <NoteCard
          key={note.id}
          note={note}
          tags={tags}
          variant="card"
          isDraft={note.id === 'draft'}
          editing={editingId === note.id}
          highlighted={highlightId === note.id}
          onStartEdit={() => handlers.onStartEdit(note.id)}
          onCancelEdit={() => handlers.onCancelEdit(note.id)}
          onSave={(v) => handlers.onSave(note.id, v)}
          onTogglePin={() => handlers.onTogglePin(note.id)}
          onToggleMinimize={() => handlers.onToggleMinimize(note.id)}
          onDelete={() => handlers.onDelete(note.id)}
          onToggleCheck={(line) => handlers.onToggleCheck(note.id, line)}
        />
      ))}
    </div>
  );
}
