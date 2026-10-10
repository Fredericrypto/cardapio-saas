import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LayoutGrid, PanelsTopLeft, Plus, StickyNote, Wand2 } from 'lucide-react';
import {
  createNote,
  deleteNote,
  fetchNoteTags,
  fetchNotes,
  updateNote,
  updateNotesLayout,
} from '../lib/admin-api';
import { toggleCheckLine } from '../lib/noteFormat';
import { useAuth } from '../contexts/AuthContext';
import type { LayoutItem, Note } from '../types/notes';
import { NotesBoard, type NotesBoardHandle } from '../components/notes/NotesBoard';
import { NotesGrid } from '../components/notes/NotesGrid';
import type { NoteDraftValues } from '../components/notes/NoteCard';
import { DEFAULT_NOTE_COLORS } from '../components/notes/notePalette';
import { scrollMainToTop } from '../lib/layout';
import { applyLayoutItems, pinNote, reorderCards, unpinNote } from '../lib/noteLayout';

const VIEW_KEY = 'notes_view';
const FALLBACK_TAGS = ['Geral', 'Cozinha', 'Caixa', 'Urgente'];
const DRAFT_ID = 'draft';

function useIsNarrow(): boolean {
  const query = '(max-width: 767px)';
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

function apiMessage(err: unknown, fallback: string): string {
  const m = (err as { response?: { data?: { message?: string | string[] } } }).response?.data?.message;
  return Array.isArray(m) ? m.join(' ') : (m ?? fallback);
}

export function NotesPage() {
  const { tenant } = useAuth();
  const [params, setParams] = useSearchParams();
  const [notes, setNotes] = useState<Note[]>([]);
  const [tags, setTags] = useState<string[]>(FALLBACK_TAGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [view, setView] = useState<'mural' | 'cards'>(() => (localStorage.getItem(VIEW_KEY) === 'cards' ? 'cards' : 'mural'));
  const [tagFilter, setTagFilter] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Note | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const boardRef = useRef<NotesBoardHandle>(null);
  const busyRef = useRef<Set<string>>(new Set());
  // Largura do quadro (px): os Pins quebram de linha conforme ela. Vale a última medida.
  const boardWidthRef = useRef(900);
  const onBoardWidth = useCallback((w: number) => {
    boardWidthRef.current = w;
  }, []);
  const narrow = useIsNarrow();
  // Em telas pequenas o quadro livre não é prático: vira cards sozinho.
  const effectiveView = narrow ? 'cards' : view;

  const load = useCallback(async () => {
    try {
      const fresh = await fetchNotes();
      // Não atropela o que o usuário está arrastando/editando agora.
      setNotes((prev) => {
        const keep = new Map(prev.filter((n) => busyRef.current.has(n.id)).map((n) => [n.id, n]));
        return fresh.map((n) => keep.get(n.id) ?? n);
      });
      setError(null);
    } catch (err) {
      setError(apiMessage(err, 'Não foi possível carregar as anotações.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    fetchNoteTags().then(setTags).catch(() => undefined);
  }, [load]);

  // Mantém o mural em sincronia com o resto da equipe (a cada 20 s, só com a aba visível).
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible' && !editingId && busyRef.current.size === 0) void load();
    }, 20_000);
    const onVisible = () => document.visibilityState === 'visible' && !editingId && void load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load, editingId]);

  // Vindo de uma notificação (?nota=ID): rola até a anotação e a destaca.
  const targetId = params.get('nota');
  useEffect(() => {
    if (!targetId || loading) return;
    const exists = notes.some((n) => n.id === targetId);
    if (exists) {
      setTagFilter('');
      setHighlightId(targetId);
      setTimeout(() => document.getElementById(`note-${targetId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
      setTimeout(() => setHighlightId(null), 4000);
    } else {
      setInfo('Essa anotação já foi excluída.');
    }
    setParams({}, { replace: true });
  }, [targetId, loading, notes, setParams]);

  useEffect(() => {
    if (!info) return;
    const t = setTimeout(() => setInfo(null), 5000);
    return () => clearTimeout(t);
  }, [info]);

  const patchLocal = useCallback((id: string, patch: Partial<Note>) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }, []);

  const setBusy = useCallback((id: string, busy: boolean) => {
    if (busy) busyRef.current.add(id);
    else busyRef.current.delete(id);
  }, []);

  // Um gesto (arrastar, fixar, reordenar...) = UMA requisição com todas as notas
  // afetadas (posição, fixação e ordem juntas): nunca fica metade aplicada.
  const commitLayout = useCallback(
    (items: LayoutItem[]) => {
      if (items.length === 0) return;
      setNotes((prev) => applyLayoutItems(prev, items));
      // A anotação ainda não salva (rascunho) só existe na tela.
      setDraft((prev) => (prev ? applyLayoutItems([prev], items)[0] : prev));
      const persisted = items.filter((i) => i.id !== DRAFT_ID);
      if (persisted.length === 0) return;
      updateNotesLayout(persisted).catch((err) => {
        setError(apiMessage(err, 'Não foi possível salvar a posição.'));
        void load();
      });
    },
    [load],
  );

  function newNote() {
    if (draft) return;
    const offset = (notes.length % 8) * 28;
    const now = new Date().toISOString();
    setDraft({
      id: DRAFT_ID,
      content: '',
      ...DEFAULT_NOTE_COLORS,
      width: 320,
      height: 340,
      posX: 24 + offset,
      posY: 24 + offset,
      isPinned: false,
      isMinimized: false,
      // Nota nova entra no início das soltas (igual ao backend).
      sortOrder: notes.filter((n) => !n.isPinned).reduce((m, n) => Math.min(m, n.sortOrder), 1) - 1,
      authorName: '',
      lastEditedByName: null,
      tag: 'Geral',
      contentUpdatedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    setEditingId(DRAFT_ID);
    setTagFilter('');
    if (effectiveView === 'mural') scrollMainToTop();
  }

  const savingIds = useRef<Set<string>>(new Set());

  async function save(id: string, values: NoteDraftValues) {
    const content = values.content.trimEnd();
    if (!content.trim()) return;
    // Anti-duplicidade: duplo clique em "Salvar" (ou Ctrl+Enter + clique) não
    // pode mandar o mesmo POST/PATCH duas vezes — cada nota tem no máximo UM
    // salvamento em andamento.
    if (savingIds.current.has(id)) return;
    savingIds.current.add(id);
    try {
      if (id === DRAFT_ID && draft) {
        const created = await createNote({
          content,
          color: values.color,
          textColor: values.textColor,
          tag: values.tag,
          posX: draft.posX,
          posY: draft.posY,
          width: draft.width,
          height: draft.height,
        });
        setNotes((prev) => [created, ...prev]);
        setDraft(null);
      } else {
        const saved = await updateNote(id, { content, color: values.color, textColor: values.textColor, tag: values.tag });
        patchLocal(id, saved);
      }
      setEditingId(null);
      setError(null);
    } catch (err) {
      setError(apiMessage(err, 'Não foi possível salvar a anotação.'));
    } finally {
      savingIds.current.delete(id);
    }
  }

  function cancel(id: string) {
    if (id === DRAFT_ID) setDraft(null);
    setEditingId(null);
  }

  // Fixar: a nota vai para o primeiro slot livre da prateleira (Pin 1, 2, 3...)
  // e quem estava no caminho é empurrado. Desafixar: volta à área comum.
  function togglePin(id: string) {
    const all = draft ? [draft, ...notes] : notes;
    const note = all.find((n) => n.id === id);
    if (!note || id === DRAFT_ID) return;
    const width = boardWidthRef.current;
    commitLayout(note.isPinned ? unpinNote(all, id, width) : pinNote(all, id, width));
  }

  // Modo Cards: soltou um card sobre outro do mesmo grupo.
  function reorderNotes(activeId: string, overId: string) {
    const all = draft ? [draft, ...notes] : notes;
    commitLayout(reorderCards(all, activeId, overId));
  }

  function toggleMinimize(id: string) {
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    patchLocal(id, { isMinimized: !note.isMinimized });
    updateNote(id, { isMinimized: !note.isMinimized }).catch((err) => {
      setError(apiMessage(err, 'Não foi possível minimizar a anotação.'));
      void load();
    });
  }

  function remove(id: string) {
    if (id === DRAFT_ID) return cancel(id);
    if (savingIds.current.has(`del:${id}`)) return;
    if (!window.confirm('Excluir esta anotação? Essa ação não pode ser desfeita e avisa a equipe.')) return;
    savingIds.current.add(`del:${id}`);
    const snapshot = notes;
    setNotes((prev) => prev.filter((n) => n.id !== id));
    deleteNote(id)
      .catch((err) => {
        setNotes(snapshot);
        setError(apiMessage(err, 'Não foi possível excluir a anotação.'));
      })
      .finally(() => savingIds.current.delete(`del:${id}`));
  }

  // Marcar tarefa direto no card: é uma edição de conteúdo, então avisa a equipe
  // (os avisos seguidos da mesma pessoa são agrupados pelo servidor).
  function toggleCheck(id: string, line: number) {
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    const content = toggleCheckLine(note.content, line);
    if (content === note.content) return;
    patchLocal(id, { content });
    updateNote(id, { content })
      .then((saved) => patchLocal(id, saved))
      .catch((err) => {
        setError(apiMessage(err, 'Não foi possível atualizar a tarefa.'));
        void load();
      });
  }

  function chooseView(next: 'mural' | 'cards') {
    setView(next);
    localStorage.setItem(VIEW_KEY, next);
  }

  const visible = useMemo(() => {
    const base = draft ? [draft, ...notes] : notes;
    return tagFilter ? base.filter((n) => n.tag === tagFilter || n.id === DRAFT_ID) : base;
  }, [notes, draft, tagFilter]);

  const handlers = {
    onStartEdit: (id: string) => setEditingId(id),
    onCancelEdit: cancel,
    onSave: (id: string, v: NoteDraftValues) => void save(id, v),
    onTogglePin: togglePin,
    onToggleMinimize: toggleMinimize,
    onDelete: remove,
    onToggleCheck: toggleCheck,
  };
  const busyIds = useCallback((id: string, busy: boolean) => setBusy(id, busy), [setBusy]);

  return (
    <div className="p-6 max-w-[1400px] flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-gray-900 flex items-center gap-2">
            <StickyNote size={20} />
            Anotações
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Recados, avisos e checklists da equipe. Ficam salvos até alguém excluir.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!narrow && (
            <div className="flex rounded-xl border border-gray-200 bg-white p-0.5" role="group" aria-label="Visualização">
              <button
                onClick={() => chooseView('mural')}
                aria-pressed={effectiveView === 'mural'}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${effectiveView === 'mural' ? 'bg-gray-900 text-white' : 'text-gray-500'}`}
              >
                <PanelsTopLeft size={14} /> Mural
              </button>
              <button
                onClick={() => chooseView('cards')}
                aria-pressed={effectiveView === 'cards'}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${effectiveView === 'cards' ? 'bg-gray-900 text-white' : 'text-gray-500'}`}
              >
                <LayoutGrid size={14} /> Cards
              </button>
            </div>
          )}
          {effectiveView === 'mural' && (
            <button
              onClick={() => boardRef.current?.arrange()}
              disabled={notes.length === 0}
              title="Alinhar todas as anotações numa grade"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-600 disabled:opacity-40"
            >
              <Wand2 size={14} /> Organizar
            </button>
          )}
          <button
            onClick={newNote}
            disabled={Boolean(draft)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white shadow-md hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: tenant?.primaryColor ?? '#3d3846' }}
          >
            <Plus size={17} strokeWidth={2.5} />
            Nova Anotação
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {['', ...tags].map((t) => (
          <button
            key={t || 'todas'}
            onClick={() => setTagFilter(t)}
            aria-pressed={tagFilter === t}
            className={`px-3 py-1 rounded-full text-xs font-semibold border ${
              tagFilter === t ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200'
            }`}
          >
            {t ? `#${t}` : 'Todas'}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2.5">{error}</p>}
      {info && <p className="text-sm text-gray-600 bg-gray-100 rounded-xl px-4 py-2.5">{info}</p>}

      {loading ? (
        <p className="text-sm text-gray-400">Carregando anotações...</p>
      ) : effectiveView === 'mural' ? (
        <NotesBoard
          ref={boardRef}
          notes={visible}
          allNotes={draft ? [draft, ...notes] : notes}
          tags={tags}
          editingId={editingId}
          highlightId={highlightId}
          onLayout={commitLayout}
          onBusy={busyIds}
          onBoardWidth={onBoardWidth}
          {...handlers}
        />
      ) : (
        <NotesGrid
          notes={visible}
          tags={tags}
          editingId={editingId}
          highlightId={highlightId}
          onReorder={reorderNotes}
          onBusy={busyIds}
          {...handlers}
        />
      )}
    </div>
  );
}
