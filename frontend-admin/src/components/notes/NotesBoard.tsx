import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { LayoutItem, Note } from '../../types/notes';
import { NoteCard, type NoteDraftValues } from './NoteCard';

const MIN_W = 180;
const MIN_H = 140;
const HEADER_H = 44; // altura da nota minimizada (só o cabeçalho)
const GAP = 20;

export interface NotesBoardHandle {
  // "Organizar": alinha tudo numa grade, como os ícones da área de trabalho.
  arrange: () => void;
}

export interface CardHandlers {
  onStartEdit: (id: string) => void;
  onCancelEdit: (id: string) => void;
  onSave: (id: string, values: NoteDraftValues) => void;
  onTogglePin: (id: string) => void;
  onToggleMinimize: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleCheck: (id: string, line: number) => void;
}

interface Props extends CardHandlers {
  notes: Note[];
  tags: string[];
  editingId: string | null;
  highlightId: string | null;
  onLayout: (items: LayoutItem[]) => void;
  onBusy: (id: string, busy: boolean) => void;
}

interface Live {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const displayHeight = (n: Note, editing: boolean) => (n.isMinimized && !editing ? HEADER_H : n.height);

export const NotesBoard = forwardRef<NotesBoardHandle, Props>(function NotesBoard(props, ref) {
  const { notes, tags, editingId, highlightId, onLayout, onBusy } = props;
  const boardRef = useRef<HTMLDivElement>(null);
  const [boardW, setBoardW] = useState(900);
  const [live, setLive] = useState<Live | null>(null);
  const liveRef = useRef<Live | null>(null);

  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoardW(el.clientWidth));
    ro.observe(el);
    setBoardW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Arraste: o movimento é local (fluido) e só vai ao servidor ao soltar.
  const startGesture = useCallback(
    (e: React.PointerEvent, note: Note, mode: 'drag' | 'resize') => {
      if ((e.target as HTMLElement).closest('button, select, textarea, input, a')) return;
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const base: Live = { id: note.id, x: note.posX, y: note.posY, w: note.width, h: note.height };
      onBusy(note.id, true);
      liveRef.current = base;
      setLive(base);

      const move = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const board = boardRef.current?.clientWidth ?? 900;
        const next: Live =
          mode === 'drag'
            ? {
                ...base,
                x: Math.min(Math.max(0, base.x + dx), Math.max(0, board - 80)),
                y: Math.max(0, base.y + dy),
              }
            : { ...base, w: Math.min(1200, Math.max(MIN_W, base.w + dx)), h: Math.min(1200, Math.max(MIN_H, base.h + dy)) };
        liveRef.current = next;
        setLive(next);
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        const final = liveRef.current;
        liveRef.current = null;
        setLive(null);
        onBusy(note.id, false);
        if (final && (final.x !== base.x || final.y !== base.y || final.w !== base.w || final.h !== base.h)) {
          onLayout([{ id: note.id, posX: Math.round(final.x), posY: Math.round(final.y), width: Math.round(final.w), height: Math.round(final.h) }]);
        }
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    },
    [onBusy, onLayout],
  );

  useImperativeHandle(ref, () => ({
    arrange() {
      const ordered = [...notes].sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || +new Date(a.createdAt) - +new Date(b.createdAt));
      if (ordered.length === 0) return;
      const cellW = Math.max(...ordered.map((n) => n.width)) + GAP;
      const cols = Math.max(1, Math.floor((boardW - GAP) / cellW));
      const items: LayoutItem[] = [];
      let y = GAP;
      for (let i = 0; i < ordered.length; i += cols) {
        const row = ordered.slice(i, i + cols);
        row.forEach((n, c) => items.push({ id: n.id, posX: GAP + c * cellW, posY: y, width: n.width, height: n.height }));
        y += Math.max(...row.map((n) => displayHeight(n, false))) + GAP;
      }
      onLayout(items);
    },
  }));

  const bottom = Math.max(
    420,
    ...notes.map((n) => {
      const l = live?.id === n.id ? live : null;
      return (l ? l.y : n.posY) + (l ? l.h : displayHeight(n, editingId === n.id)) + 140;
    }),
  );

  return (
    <div
      ref={boardRef}
      className="relative rounded-2xl border border-gray-200 bg-white overflow-x-auto overflow-y-hidden"
      style={{
        height: bottom,
        backgroundImage: 'radial-gradient(#d4d4d8 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }}
    >
      {notes.map((note, idx) => {
        const isLive = live?.id === note.id;
        const editing = editingId === note.id;
        const x = isLive ? live!.x : note.posX;
        const y = isLive ? live!.y : note.posY;
        const w = isLive ? live!.w : note.width;
        const h = isLive ? live!.h : displayHeight(note, editing);
        return (
          <div
            key={note.id}
            className="absolute"
            style={{
              left: x,
              top: y,
              // Em edição o card cresce o suficiente para caber a barra de
              // ferramentas, o texto e os botões.
              width: editing ? Math.max(w, 320) : w,
              height: editing ? Math.max(h, 340) : h,
              zIndex: isLive ? 40 : editing ? 35 : note.isPinned ? 20 : 10 + (idx % 8),
              transition: isLive ? 'none' : 'left 0.18s ease, top 0.18s ease',
            }}
          >
            <NoteCard
              note={note}
              tags={tags}
              variant="free"
              editing={editing}
              highlighted={highlightId === note.id}
              isDraft={note.id === 'draft'}
              onDragStart={(e) => startGesture(e, note, 'drag')}
              onResizeStart={(e) => startGesture(e, note, 'resize')}
              onStartEdit={() => props.onStartEdit(note.id)}
              onCancelEdit={() => props.onCancelEdit(note.id)}
              onSave={(v) => props.onSave(note.id, v)}
              onTogglePin={() => props.onTogglePin(note.id)}
              onToggleMinimize={() => props.onToggleMinimize(note.id)}
              onDelete={() => props.onDelete(note.id)}
              onToggleCheck={(line) => props.onToggleCheck(note.id, line)}
            />
          </div>
        );
      })}
      {notes.length === 0 && (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-gray-400 pointer-events-none">
          Nenhuma anotação ainda. Use "Nova Anotação" para deixar o primeiro recado.
        </p>
      )}
    </div>
  );
});
