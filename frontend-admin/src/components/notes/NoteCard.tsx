import { useEffect, useRef, useState } from 'react';
import {
  Bold,
  Check,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Italic,
  List,
  ListChecks,
  Palette,
  Pencil,
  Pin,
  PinOff,
  Trash2,
  Underline,
  X,
} from 'lucide-react';
import type { Note } from '../../types/notes';
import { continueList, progress, toggleLinePrefix, toggleWrap, type EditResult } from '../../lib/noteFormat';
import { BG_SWATCHES, TAG_STYLES, TEXT_COLORS, formatDateTime } from './notePalette';
import { NoteBody } from './NoteBody';

export interface NoteDraftValues {
  content: string;
  color: string;
  textColor: string;
  tag: string;
}

interface Props {
  note: Note;
  tags: string[];
  isDraft?: boolean;
  variant: 'free' | 'card';
  editing: boolean;
  highlighted?: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (values: NoteDraftValues) => void;
  onTogglePin: () => void;
  onToggleMinimize: () => void;
  onDelete: () => void;
  onToggleCheck: (line: number) => void;
  // Só no mural livre:
  onDragStart?: (e: React.PointerEvent) => void;
  onResizeStart?: (e: React.PointerEvent) => void;
}

const iconBtn =
  'w-7 h-7 rounded-lg flex items-center justify-center opacity-70 hover:opacity-100 hover:bg-black/10 transition-colors shrink-0';

export function NoteCard(props: Props) {
  const { note, tags, isDraft, variant, editing, highlighted } = props;
  const [draft, setDraft] = useState<NoteDraftValues>({
    content: note.content,
    color: note.color,
    textColor: note.textColor,
    tag: note.tag,
  });
  const [showPalette, setShowPalette] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // Ao entrar no modo edição, parte do conteúdo salvo e foca o texto.
  useEffect(() => {
    if (editing) {
      setDraft({ content: note.content, color: note.color, textColor: note.textColor, tag: note.tag });
      setShowPalette(false);
      setTimeout(() => areaRef.current?.focus(), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const color = editing ? draft.color : note.color;
  const textColor = editing ? draft.textColor : note.textColor;
  const tagStyle = TAG_STYLES[editing ? draft.tag : note.tag] ?? TAG_STYLES.Geral;
  const prog = progress(editing ? draft.content : note.content);
  const edited = note.lastEditedByName && note.contentUpdatedAt !== note.createdAt;

  function applyEdit(result: EditResult | null) {
    if (!result) return;
    setDraft((d) => ({ ...d, content: result.value }));
    requestAnimationFrame(() => {
      const el = areaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(result.selStart, result.selEnd);
    });
  }
  const sel = () => ({ s: areaRef.current?.selectionStart ?? 0, e: areaRef.current?.selectionEnd ?? 0 });
  const wrap = (marker: string) => {
    const { s, e } = sel();
    applyEdit(toggleWrap(draft.content, s, e, marker));
  };
  const prefix = (kind: 'bullet' | 'check') => {
    const { s, e } = sel();
    applyEdit(toggleLinePrefix(draft.content, s, e, kind));
  };

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape') {
      e.preventDefault();
      props.onCancelEdit();
    } else if (mod && e.key === 'Enter') {
      e.preventDefault();
      props.onSave(draft);
    } else if (mod && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      wrap('**');
    } else if (mod && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      wrap('_');
    } else if (mod && e.key.toLowerCase() === 'u') {
      e.preventDefault();
      wrap('__');
    } else if (e.key === 'Enter' && !e.shiftKey && !mod) {
      const { s, e: end } = sel();
      if (s === end) {
        const result = continueList(draft.content, s);
        if (result) {
          e.preventDefault();
          applyEdit(result);
        }
      }
    }
  }

  const minimized = note.isMinimized && !editing;

  return (
    <div
      id={`note-${note.id}`}
      className={`relative flex flex-col rounded-2xl shadow-md border border-black/10 overflow-hidden transition-shadow ${
        highlighted ? 'ring-4 ring-sky-400/70 shadow-xl' : 'hover:shadow-lg'
      } ${variant === 'card' ? 'w-full' : 'h-full'}`}
      style={{ backgroundColor: color, color: textColor, ['--note-bg' as string]: color }}
    >
      {/* ---------- cabeçalho: alça de arraste + ações ---------- */}
      <div
        className={`flex items-center gap-0.5 px-1.5 py-1.5 border-b border-black/10 select-none ${
          variant === 'free' && !editing ? 'cursor-grab active:cursor-grabbing touch-none' : ''
        }`}
        onPointerDown={variant === 'free' && !editing ? props.onDragStart : undefined}
      >
        {variant === 'free' && <GripVertical size={15} className="opacity-45 shrink-0 ml-0.5" aria-hidden />}
        <span className="flex-1 min-w-0 text-[11px] font-semibold px-1 truncate opacity-80">
          {isDraft ? 'Nova anotação' : minimized && note.content.trim() ? note.content.split('\n')[0].replace(/^[-*] (\[[ xX]\] )?/, '') : ''}
        </span>
        {prog.total > 0 && (
          <span className="text-[10px] font-semibold opacity-75 px-1.5" title="Tarefas concluídas">
            {prog.done}/{prog.total}
          </span>
        )}
        {editing && (
          <button type="button" className={iconBtn} title="Cores" aria-label="Cores da anotação" onClick={() => setShowPalette((v) => !v)}>
            <Palette size={15} />
          </button>
        )}
        {!isDraft && (
          <>
            <button
              type="button"
              className={iconBtn}
              title={note.isPinned ? 'Desafixar' : 'Fixar no topo'}
              aria-label={note.isPinned ? 'Desafixar anotação' : 'Fixar anotação no topo'}
              aria-pressed={note.isPinned}
              onClick={props.onTogglePin}
            >
              {note.isPinned ? <PinOff size={15} /> : <Pin size={15} />}
            </button>
            {!editing && (
              <button type="button" className={iconBtn} title="Editar" aria-label="Editar anotação" onClick={props.onStartEdit}>
                <Pencil size={15} />
              </button>
            )}
            <button
              type="button"
              className={iconBtn}
              title={note.isMinimized ? 'Expandir' : 'Minimizar'}
              aria-label={note.isMinimized ? 'Expandir anotação' : 'Minimizar anotação'}
              onClick={props.onToggleMinimize}
            >
              {note.isMinimized ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </button>
            <button type="button" className={iconBtn} title="Excluir" aria-label="Excluir anotação" onClick={props.onDelete}>
              <Trash2 size={15} />
            </button>
          </>
        )}
      </div>

      {!minimized && (
        <>
          {editing && showPalette && (
            // Painel flutuante sobre o corpo: não empurra o texto para baixo e
            // usa cores neutras para ficar legível em qualquer fundo de nota.
            <div
              className="absolute left-2 right-2 top-[46px] z-30 rounded-xl bg-white shadow-xl border border-gray-200 p-3 flex flex-col gap-2.5"
              style={{ color: '#374151' }}
            >
              <div>
                <p className="text-[10px] font-semibold text-gray-500 mb-1.5">Cor de fundo</p>
                <div className="flex flex-wrap gap-1.5">
                  {BG_SWATCHES.map((sw) => (
                    <button
                      key={sw.bg}
                      type="button"
                      title={sw.name}
                      aria-label={`Fundo ${sw.name}`}
                      aria-pressed={draft.color === sw.bg}
                      onClick={() => setDraft((d) => ({ ...d, color: sw.bg, textColor: sw.text }))}
                      className={`w-6 h-6 rounded-full border-2 ${draft.color === sw.bg ? 'border-gray-800 scale-110' : 'border-gray-300'}`}
                      style={{ backgroundColor: sw.bg }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-gray-500 mb-1.5">Cor da fonte</p>
                <div className="flex flex-wrap gap-1.5">
                  {TEXT_COLORS.map((tc) => (
                    <button
                      key={tc.value}
                      type="button"
                      title={tc.name}
                      aria-label={`Fonte ${tc.name}`}
                      aria-pressed={draft.textColor === tc.value}
                      onClick={() => setDraft((d) => ({ ...d, textColor: tc.value }))}
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] font-bold ${
                        draft.textColor === tc.value ? 'border-gray-800 scale-110' : 'border-gray-300'
                      }`}
                      style={{ backgroundColor: tc.value, color: tc.value === '#FFFFFF' ? '#111827' : '#FFFFFF' }}
                    >
                      A
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPalette(false)}
                className="self-end text-[11px] font-semibold text-gray-600 px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200"
              >
                Pronto
              </button>
            </div>
          )}

          {/* ---------- corpo ---------- */}
          <div className={`px-3 py-2.5 ${variant === 'free' ? 'flex-1 min-h-0 overflow-y-auto' : 'min-h-[88px]'}`}>
            {editing ? (
              <div className="flex flex-col gap-2 h-full">
                <div className="flex items-center gap-0.5">
                  <button type="button" className={iconBtn} title="Negrito (Ctrl+B)" aria-label="Negrito" onClick={() => wrap('**')}>
                    <Bold size={15} />
                  </button>
                  <button type="button" className={iconBtn} title="Itálico (Ctrl+I)" aria-label="Itálico" onClick={() => wrap('_')}>
                    <Italic size={15} />
                  </button>
                  <button type="button" className={iconBtn} title="Sublinhado (Ctrl+U)" aria-label="Sublinhado" onClick={() => wrap('__')}>
                    <Underline size={15} />
                  </button>
                  <span className="w-px h-4 bg-black/15 mx-1" />
                  <button type="button" className={iconBtn} title="Lista" aria-label="Lista com marcadores" onClick={() => prefix('bullet')}>
                    <List size={15} />
                  </button>
                  <button type="button" className={iconBtn} title="Checklist" aria-label="Checklist" onClick={() => prefix('check')}>
                    <ListChecks size={15} />
                  </button>
                </div>
                <textarea
                  ref={areaRef}
                  value={draft.content}
                  onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
                  onKeyDown={onKeyDown}
                  onFocus={() => setShowPalette(false)}
                  maxLength={5000}
                  placeholder="Escreva o recado… (use a lista e o checklist acima)"
                  className="w-full flex-1 min-h-[96px] resize-none bg-black/[0.06] rounded-xl p-2.5 text-sm leading-snug outline-none placeholder:opacity-50"
                  style={{ color: 'inherit' }}
                />
              </div>
            ) : (
              <NoteBody content={note.content} onToggleCheck={props.onToggleCheck} textColor={textColor} />
            )}
          </div>

          {/* ---------- edição: ações ---------- */}
          {editing && (
            <div className="px-2.5 pb-2 flex flex-wrap items-center gap-x-1.5 gap-y-1.5">
              <select
                value={draft.tag}
                onChange={(e) => setDraft((d) => ({ ...d, tag: e.target.value }))}
                aria-label="Setor"
                className="text-xs font-semibold rounded-lg px-1.5 py-1.5 bg-black/10 outline-none"
                style={{ color: 'inherit' }}
              >
                {tags.map((t) => (
                  <option key={t} value={t} style={{ color: '#111827' }}>
                    #{t}
                  </option>
                ))}
              </select>
              <div className="flex-1 min-w-0" />
              <button type="button" onClick={props.onCancelEdit} className="flex items-center gap-1 text-xs font-semibold px-2 py-1.5 rounded-lg hover:bg-black/10">
                <X size={13} /> Cancelar
              </button>
              <button
                type="button"
                onClick={() => props.onSave(draft)}
                disabled={!draft.content.trim()}
                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-black/80 text-white disabled:opacity-40"
              >
                <Check size={13} /> Salvar
              </button>
            </div>
          )}

          {/* ---------- rodapé: autor, data e setor ---------- */}
          {!isDraft && (
            <div className="px-3 py-2 border-t border-black/10 flex items-end gap-2 text-[10.5px] leading-tight">
              <div className="flex-1 min-w-0 opacity-80">
                <p className="truncate">
                  <span className="font-semibold">{note.authorName}</span> · {formatDateTime(note.createdAt)}
                </p>
                {edited && (
                  <p className="truncate opacity-85">
                    Editada por <span className="font-semibold">{note.lastEditedByName}</span> · {formatDateTime(note.contentUpdatedAt)}
                  </p>
                )}
              </div>
              <span className="shrink-0 font-bold rounded-full px-2 py-0.5" style={{ backgroundColor: tagStyle.bg, color: tagStyle.fg }}>
                #{note.tag}
              </span>
            </div>
          )}
        </>
      )}

      {variant === 'free' && !minimized && !editing && (
        <div
          onPointerDown={props.onResizeStart}
          role="separator"
          aria-label="Redimensionar anotação"
          className="absolute right-0 bottom-0 w-5 h-5 cursor-nwse-resize touch-none flex items-end justify-end p-1 opacity-45 hover:opacity-90"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <path d="M9 3 3 9M9 6.5 6.5 9" />
          </svg>
        </div>
      )}
    </div>
  );
}
