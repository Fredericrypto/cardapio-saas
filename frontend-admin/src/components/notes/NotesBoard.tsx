import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { LayoutItem, Note } from '../../types/notes';
import { NoteCard, type NoteDraftValues } from './NoteCard';
import {
  arrangeItems,
  computeBoardLayout,
  displayHeight,
  dropLoose,
  orderedPinned,
  previewLooseDrop,
  previewPinReorder,
  previewResize,
  reorderPin,
  resizeItems,
  type Rect,
} from '../../lib/noteLayout';

const MIN_W = 180;
const MIN_H = 140;

export interface NotesBoardHandle {
  // "Organizar": Pins na prateleira e as soltas em grade logo abaixo.
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
  // Notas que aparecem (respeita o filtro de tag).
  notes: Note[];
  // TODAS as notas: o layout considera também as escondidas pelo filtro, para
  // nada ficar sobreposto quando o filtro for desligado.
  allNotes: Note[];
  tags: string[];
  editingId: string | null;
  highlightId: string | null;
  onLayout: (items: LayoutItem[]) => void;
  onBusy: (id: string, busy: boolean) => void;
  onBoardWidth: (width: number) => void;
}

interface Gesture {
  id: string;
  mode: 'drag' | 'resize';
  // Ponto atual (canto superior esquerdo no arraste; tamanho no resize).
  x: number;
  y: number;
  w: number;
  h: number;
  hint: 'x' | 'y' | 'auto';
}

// Quadro livre. Todas as posições vêm de lib/noteLayout (Pins numa prateleira
// no topo, soltas onde o usuário largou, ZERO sobreposição). Ao arrastar, a nota
// segue o ponteiro e as vizinhas deslizam em tempo real para abrir espaço.
export const NotesBoard = forwardRef<NotesBoardHandle, Props>(function NotesBoard(props, ref) {
  const { notes, allNotes, tags, editingId, highlightId, onLayout, onBusy, onBoardWidth } = props;
  const boardRef = useRef<HTMLDivElement>(null);
  const [boardW, setBoardW] = useState(900);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const gestureRef = useRef<Gesture | null>(null);

  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setBoardW(el.clientWidth);
      onBoardWidth(el.clientWidth);
    });
    ro.observe(el);
    setBoardW(el.clientWidth);
    onBoardWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [onBoardWidth]);

  const movedNote = gesture ? allNotes.find((n) => n.id === gesture.id) : undefined;

  // Layout a desenhar: parado, durante um arraste (prévia) ou um resize.
  const layout = useMemo<Map<string, Rect>>(() => {
    if (!gesture || !movedNote) return computeBoardLayout(allNotes, boardW);
    if (gesture.mode === 'resize') return previewResize(allNotes, gesture.id, { w: gesture.w, h: gesture.h }, boardW);
    if (movedNote.isPinned) return previewPinReorder(allNotes, gesture.id, { x: gesture.x, y: gesture.y }, boardW);
    return previewLooseDrop(allNotes, gesture.id, { x: gesture.x, y: gesture.y }, boardW, gesture.hint);
  }, [allNotes, boardW, gesture, movedNote]);

  const startGesture = useCallback(
    (e: React.PointerEvent, note: Note, mode: 'drag' | 'resize') => {
      if ((e.target as HTMLElement).closest('button, select, textarea, input, a')) return;
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const rect = computeBoardLayout(allNotes, boardRef.current?.clientWidth ?? 900).get(note.id);
      if (!rect) return;
      const base: Gesture = { id: note.id, mode, x: rect.x, y: rect.y, w: rect.w, h: note.height, hint: 'auto' };
      onBusy(note.id, true);
      gestureRef.current = base;
      setGesture(base);

      const move = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const width = boardRef.current?.clientWidth ?? 900;
        const next: Gesture =
          mode === 'drag'
            ? {
                ...base,
                x: Math.min(Math.max(0, base.x + dx), Math.max(0, width - base.w)),
                y: Math.max(0, base.y + dy),
                hint: Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : Math.abs(dy) > Math.abs(dx) * 1.2 ? 'y' : 'auto',
              }
            : { ...base, w: Math.min(1200, Math.max(MIN_W, base.w + dx)), h: Math.min(1200, Math.max(MIN_H, base.h + dy)) };
        gestureRef.current = next;
        setGesture(next);
      };
      const finish = (commit: boolean) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
        const final = gestureRef.current;
        gestureRef.current = null;
        setGesture(null);
        onBusy(note.id, false);
        if (!commit || !final) return;
        const width = boardRef.current?.clientWidth ?? 900;
        let items: LayoutItem[];
        if (final.mode === 'resize') {
          items = resizeItems(allNotes, note.id, { w: final.w, h: final.h }, width);
        } else if (note.isPinned) {
          items = reorderPin(allNotes, note.id, { x: final.x, y: final.y }, width);
        } else {
          items = dropLoose(allNotes, note.id, { x: final.x, y: final.y }, width, final.hint);
        }
        if (items.length > 0) onLayout(items);
      };
      const up = () => finish(true);
      const cancel = () => finish(false);
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancel);
    },
    [allNotes, onBusy, onLayout],
  );

  useImperativeHandle(ref, () => ({
    arrange() {
      const items = arrangeItems(allNotes, boardRef.current?.clientWidth ?? boardW);
      if (items.length > 0) onLayout(items);
    },
  }));

  const pinRank = useMemo(() => new Map(orderedPinned(allNotes).map((n, i) => [n.id, i + 1])), [allNotes]);

  const bottom = Math.max(
    420,
    ...[...layout.values()].map((r) => r.y + r.h + 140),
    gesture?.mode === 'drag' ? gesture.y + (movedNote ? displayHeight(movedNote) : 0) + 140 : 0,
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
      {notes.map((note) => {
        const rect = layout.get(note.id);
        if (!rect) return null;
        const g = gesture?.id === note.id ? gesture : null;
        const isMoving = g !== null;
        const editing = editingId === note.id;
        // A nota arrastada segue o ponteiro; as demais vão para o lugar da prévia.
        const x = g?.mode === 'drag' ? g.x : rect.x;
        const y = g?.mode === 'drag' ? g.y : rect.y;
        const w = g?.mode === 'resize' ? g.w : rect.w;
        const h = g?.mode === 'resize' ? (note.isMinimized ? rect.h : g.h) : rect.h;
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
              zIndex: isMoving ? 40 : editing ? 35 : note.isPinned ? 20 : 10,
              transition: isMoving ? 'none' : 'left 0.2s ease, top 0.2s ease, width 0.2s ease, height 0.2s ease',
              filter: g?.mode === 'drag' ? 'drop-shadow(0 10px 18px rgba(0,0,0,0.22))' : undefined,
            }}
          >
            <NoteCard
              note={note}
              tags={tags}
              variant="free"
              pinIndex={pinRank.get(note.id)}
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
