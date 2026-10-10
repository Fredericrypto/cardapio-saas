import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Note } from '../../types/notes';
import { NoteCard } from './NoteCard';
import type { CardHandlers } from './NotesBoard';
import { orderedPinned, previewCardsOrder } from '../../lib/noteLayout';

interface Props extends CardHandlers {
  // Notas exibidas (respeita o filtro de tag).
  notes: Note[];
  tags: string[];
  editingId: string | null;
  highlightId: string | null;
  // Soltou `activeId` sobre `overId`: quem manda salvar a nova ordem.
  onReorder: (activeId: string, overId: string) => void;
  onBusy: (id: string, busy: boolean) => void;
}

interface Drag {
  id: string;
  pointerX: number;
  pointerY: number;
  // Onde, dentro do card, o usuário o segurou.
  grabX: number;
  grabY: number;
  overId: string | null;
}

// Modo Cards: fixadas primeiro (Pin 1, Pin 2...), depois as soltas. Arrastar um
// card pela alça do cabeçalho reordena DENTRO do grupo, estilo Trello: o card
// segue o ponteiro e os outros deslizam (animação FLIP) para abrir espaço.
export function NotesGrid({ notes, tags, editingId, highlightId, onReorder, onBusy, ...handlers }: Props) {
  const gridRef = useRef<HTMLDivElement>(null);
  const wrapRefs = useRef(new Map<string, HTMLDivElement>());
  const lastPos = useRef(new Map<string, { x: number; y: number }>());
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);

  const ordered = useMemo(
    () => (drag ? previewCardsOrder(notes, drag.id, drag.overId) : previewCardsOrder(notes, '', null)),
    [notes, drag],
  );
  const pinRank = useMemo(() => new Map(orderedPinned(notes).map((n, i) => [n.id, i + 1])), [notes]);

  // Depois de cada render: (1) anima quem mudou de lugar (FLIP) e (2) prende o
  // card arrastado ao ponteiro. Usa offsetLeft/Top, que ignoram transform.
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const gridRect = grid.getBoundingClientRect();
    for (const [id, el] of wrapRefs.current) {
      const x = el.offsetLeft;
      const y = el.offsetTop;
      const prev = lastPos.current.get(id);
      if (drag && id === drag.id) {
        el.style.transform = `translate(${drag.pointerX - drag.grabX - (gridRect.left + x)}px, ${drag.pointerY - drag.grabY - (gridRect.top + y)}px)`;
        el.style.zIndex = '40';
      } else {
        el.style.transform = '';
        el.style.zIndex = '';
        if (prev && (prev.x !== x || prev.y !== y) && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          el.animate([{ transform: `translate(${prev.x - x}px, ${prev.y - y}px)` }, { transform: 'translate(0, 0)' }], {
            duration: 200,
            easing: 'ease',
          });
        }
      }
      lastPos.current.set(id, { x, y });
    }
  });

  const startDrag = useCallback(
    (e: React.PointerEvent, note: Note) => {
      if ((e.target as HTMLElement).closest('button, select, textarea, input, a')) return;
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      const wrap = wrapRefs.current.get(note.id);
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const base: Drag = {
        id: note.id,
        pointerX: e.clientX,
        pointerY: e.clientY,
        grabX: e.clientX - rect.left,
        grabY: e.clientY - rect.top,
        overId: null,
      };
      onBusy(note.id, true);
      dragRef.current = base;
      setDrag(base);

      const overAt = (x: number, y: number): string | null => {
        for (const [id, el] of wrapRefs.current) {
          if (id === note.id) continue;
          const other = notes.find((n) => n.id === id);
          if (!other || other.isPinned !== note.isPinned) continue;
          const r = el.getBoundingClientRect();
          if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return id;
        }
        return dragRef.current?.overId ?? null;
      };
      const move = (ev: PointerEvent) => {
        const next: Drag = { ...base, pointerX: ev.clientX, pointerY: ev.clientY, overId: overAt(ev.clientX, ev.clientY) };
        dragRef.current = next;
        setDrag(next);
      };
      const finish = (commit: boolean) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
        const final = dragRef.current;
        dragRef.current = null;
        setDrag(null);
        onBusy(note.id, false);
        if (commit && final?.overId) onReorder(note.id, final.overId);
      };
      const up = () => finish(true);
      const cancel = () => finish(false);
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancel);
    },
    [notes, onBusy, onReorder],
  );

  if (notes.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-16">
        Nenhuma anotação ainda. Use "Nova Anotação" para deixar o primeiro recado.
      </p>
    );
  }

  return (
    <div ref={gridRef} className="relative grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
      {ordered.map((note) => (
        <div
          key={note.id}
          ref={(el) => {
            if (el) wrapRefs.current.set(note.id, el);
            else {
              wrapRefs.current.delete(note.id);
              lastPos.current.delete(note.id);
            }
          }}
          className="min-w-0"
          style={drag?.id === note.id ? { filter: 'drop-shadow(0 10px 18px rgba(0,0,0,0.22))' } : undefined}
        >
          <NoteCard
            note={note}
            tags={tags}
            variant="card"
            pinIndex={pinRank.get(note.id)}
            isDraft={note.id === 'draft'}
            editing={editingId === note.id}
            highlighted={highlightId === note.id}
            onDragStart={note.id === 'draft' ? undefined : (e) => startDrag(e, note)}
            onStartEdit={() => handlers.onStartEdit(note.id)}
            onCancelEdit={() => handlers.onCancelEdit(note.id)}
            onSave={(v) => handlers.onSave(note.id, v)}
            onTogglePin={() => handlers.onTogglePin(note.id)}
            onToggleMinimize={() => handlers.onToggleMinimize(note.id)}
            onDelete={() => handlers.onDelete(note.id)}
            onToggleCheck={(line) => handlers.onToggleCheck(note.id, line)}
          />
        </div>
      ))}
    </div>
  );
}
