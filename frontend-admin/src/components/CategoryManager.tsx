import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  GripVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  activateCategories,
  createCustomCategory,
  deleteCategory,
  renameCategory,
  reorderCategories,
  setCategoryActive,
  setCategoryActiveById,
} from '../lib/admin-api';
import type { Category } from '../types';
import { CATALOG_GROUPS, CATEGORY_CATALOG } from '../lib/categoryCatalog';
import type { CatalogGroupId } from '../lib/categoryCatalog';
import { ESTABLISHMENT_TYPES } from '../lib/establishmentTypes';
import { getCategoryIcon } from './CategoryIcon';

// Tela única de gerenciamento de categorias (02/10), em 3 abas:
//   1. Minhas categorias — a lista na ordem do cardápio: reordenar
//      (arrastar ou setas), renomear as personalizadas, remover;
//   2. Catálogo — as 60 universais em 4 grupos + especialidades por tipo
//      de cozinha, com os TIPOS DE ESTABELECIMENTO no topo. Escolher um tipo
//      só MARCA as categorias; o dono continua marcando/desmarcando à mão
//      antes de adicionar, e depois remove/reordena como quiser;
//   3. Personalizada — criar uma categoria com nome próprio.
type Tab = 'minhas' | 'catalogo' | 'personalizada';

function messageOf(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function CategoryManager({
  categories,
  productCounts,
  onClose,
  onChanged,
}: {
  categories: Category[];
  productCounts: Record<string, number>;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const [tab, setTab] = useState<Tab>('minhas');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const active = useMemo(
    () => categories.filter((c) => c.isActive).sort((a, b) => a.displayOrder - b.displayOrder),
    [categories],
  );
  const inactive = useMemo(
    () => categories.filter((c) => !c.isActive).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [categories],
  );
  const activeKeys = useMemo(
    () => new Set(categories.filter((c) => c.isActive && c.key).map((c) => c.key as string)),
    [categories],
  );

  async function run(action: () => Promise<unknown>, okText?: string): Promise<boolean> {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      await onChanged();
      if (okText) setNotice({ kind: 'ok', text: okText });
      return true;
    } catch (err) {
      setNotice({ kind: 'error', text: messageOf(err, 'Não foi possível concluir. Tente de novo.') });
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-3xl h-[86vh] flex flex-col overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Categorias do cardápio"
      >
        <div className="flex items-center justify-between px-5 pt-4">
          <h2 className="font-display text-lg font-bold text-gray-900">Categorias do cardápio</h2>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-lg hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-1 px-5 mt-3 border-b border-gray-100">
          {(
            [
              ['minhas', `Minhas categorias (${active.length})`],
              ['catalogo', 'Catálogo e tipos'],
              ['personalizada', 'Criar personalizada'],
            ] as Array<[Tab, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => {
                setTab(id);
                setNotice(null);
              }}
              className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px ${
                tab === id ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {notice && (
          <p
            className={`mx-5 mt-3 text-xs rounded-lg px-3 py-2 ${
              notice.kind === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
            }`}
          >
            {notice.text}
          </p>
        )}

        <div className="flex-1 min-h-0 flex flex-col">
          {tab === 'minhas' && (
            <MyCategories
              active={active}
              inactive={inactive}
              productCounts={productCounts}
              busy={busy}
              run={run}
              goCatalog={() => setTab('catalogo')}
            />
          )}
          {tab === 'catalogo' && (
            <CatalogPicker
              activeKeys={activeKeys}
              busy={busy}
              onAdd={(keys) =>
                run(
                  () => activateCategories(keys),
                  `${keys.length} ${keys.length === 1 ? 'categoria adicionada' : 'categorias adicionadas'}. Reordene ou remova em "Minhas categorias".`,
                )
              }
            />
          )}
          {tab === 'personalizada' && (
            <CustomCreator
              busy={busy}
              onCreate={async (name) => {
                const done = await run(() => createCustomCategory(name));
                if (done) {
                  setTab('minhas');
                  setNotice({ kind: 'ok', text: `Categoria "${name}" criada.` });
                }
                return done;
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- aba 1
function MyCategories({
  active,
  inactive,
  productCounts,
  busy,
  run,
  goCatalog,
}: {
  active: Category[];
  inactive: Category[];
  productCounts: Record<string, number>;
  busy: boolean;
  run: (action: () => Promise<unknown>, okText?: string) => Promise<boolean>;
  goCatalog: () => void;
}) {
  const [order, setOrder] = useState<string[]>(active.map((c) => c.id));
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // Sincroniza com o servidor quando a lista muda (e não no meio de um arrasto).
  useEffect(() => {
    if (!draggingId) setOrder(active.map((c) => c.id));
  }, [active, draggingId]);

  const byId = new Map(active.map((c) => [c.id, c]));
  const rows = order.map((id) => byId.get(id)).filter((c): c is Category => Boolean(c));

  function persist(next: string[]) {
    setOrder(next);
    void run(() => reorderCategories(next));
  }
  function move(id: string, delta: -1 | 1) {
    const i = order.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    persist(next);
  }
  function dragOver(overId: string) {
    if (!draggingId || draggingId === overId) return;
    setOrder((prev) => {
      const from = prev.indexOf(draggingId);
      const to = prev.indexOf(overId);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      next.splice(from, 1);
      next.splice(to, 0, draggingId);
      return next;
    });
  }

  async function remove(category: Category) {
    const items = productCounts[category.id] ?? 0;
    if (category.key) {
      if (
        !confirm(
          `Remover "${category.name}" do cardápio? Ela some do cardápio do cliente${
            items ? `, mas os ${items} itens ficam guardados` : ''
          } e você pode adicionar de novo quando quiser.`,
        )
      )
        return;
      await run(() => setCategoryActive(category.key as string, false));
      return;
    }
    if (items > 0) {
      if (
        !confirm(
          `"${category.name}" tem ${items} ${items === 1 ? 'item' : 'itens'}, então não dá pra excluir. Desativar? Ela some do cardápio do cliente e os itens ficam guardados.`,
        )
      )
        return;
      await run(() => setCategoryActiveById(category.id, false));
      return;
    }
    if (!confirm(`Excluir a categoria "${category.name}"?`)) return;
    await run(() => deleteCategory(category.id));
  }

  async function saveRename(id: string) {
    const name = editName.trim();
    if (!name) return;
    if (await run(() => renameCategory(id, name))) setEditingId(null);
  }

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4">
      {rows.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-gray-500">Seu cardápio ainda não tem categorias.</p>
          <button
            onClick={goCatalog}
            className="mt-3 bg-gray-900 text-white text-sm font-semibold rounded-lg px-4 py-2"
          >
            Escolher no catálogo
          </button>
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-400 mb-3">
            Arraste (ou use as setas) para mudar a ordem em que as categorias aparecem no cardápio.
          </p>
          <ul className="flex flex-col gap-1.5">
            {rows.map((category, index) => {
              const Icon = getCategoryIcon(category.key, category.name);
              const items = productCounts[category.id] ?? 0;
              return (
                <li
                  key={category.id}
                  draggable={editingId !== category.id}
                  onDragStart={() => setDraggingId(category.id)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    dragOver(category.id);
                  }}
                  onDragEnd={() => {
                    setDraggingId(null);
                    persist(order);
                  }}
                  className={`flex items-center gap-2.5 border rounded-xl px-2.5 py-2 bg-white ${
                    draggingId === category.id ? 'opacity-50 border-gray-300' : 'border-gray-100'
                  }`}
                >
                  <GripVertical size={16} className="text-gray-300 cursor-grab shrink-0" />
                  <span className="w-6 flex justify-center text-gray-700 shrink-0">{Icon && <Icon size={18} />}</span>
                  <div className="flex-1 min-w-0">
                    {editingId === category.id ? (
                      <input
                        autoFocus
                        value={editName}
                        maxLength={40}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void saveRename(category.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm outline-none"
                      />
                    ) : (
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {category.name}
                        {!category.key && (
                          <span className="ml-2 text-[10px] font-semibold text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">
                            Personalizada
                          </span>
                        )}
                      </p>
                    )}
                    <p className="text-[11px] text-gray-400">
                      {items} {items === 1 ? 'item' : 'itens'}
                    </p>
                  </div>
                  {editingId === category.id ? (
                    <>
                      <button
                        onClick={() => void saveRename(category.id)}
                        disabled={busy}
                        aria-label="Salvar nome"
                        className="p-1.5 rounded-lg bg-gray-900 text-white"
                      >
                        <Check size={14} />
                      </button>
                      <button onClick={() => setEditingId(null)} aria-label="Cancelar" className="p-1.5 rounded-lg hover:bg-gray-100">
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => move(category.id, -1)}
                        disabled={busy || index === 0}
                        aria-label="Subir"
                        className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30"
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        onClick={() => move(category.id, 1)}
                        disabled={busy || index === rows.length - 1}
                        aria-label="Descer"
                        className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30"
                      >
                        <ArrowDown size={14} />
                      </button>
                      {!category.key && (
                        <button
                          onClick={() => {
                            setEditingId(category.id);
                            setEditName(category.name);
                          }}
                          aria-label="Renomear"
                          className="p-1.5 rounded-lg hover:bg-gray-100"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => void remove(category)}
                        disabled={busy}
                        aria-label={`Remover ${category.name}`}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {inactive.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-semibold text-gray-500 mb-2">Desativadas (os itens ficam guardados)</p>
          <ul className="flex flex-col gap-1.5">
            {inactive.map((category) => {
              const Icon = getCategoryIcon(category.key, category.name);
              return (
                <li key={category.id} className="flex items-center gap-2.5 border border-dashed border-gray-200 rounded-xl px-2.5 py-2">
                  <span className="w-6 flex justify-center text-gray-400 shrink-0">{Icon && <Icon size={18} />}</span>
                  <span className="flex-1 text-sm text-gray-400 truncate">{category.name}</span>
                  <button
                    onClick={() =>
                      void run(() =>
                        category.key ? setCategoryActive(category.key, true) : setCategoryActiveById(category.id, true),
                      )
                    }
                    disabled={busy}
                    className="text-xs font-semibold text-gray-700 hover:underline"
                  >
                    Reativar
                  </button>
                  {!category.key && (
                    <button
                      onClick={() => {
                        if (confirm(`Excluir a categoria "${category.name}"?`)) void run(() => deleteCategory(category.id));
                      }}
                      disabled={busy}
                      className="text-xs font-semibold text-red-500 hover:underline"
                    >
                      Excluir
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- aba 2
function CatalogPicker({
  activeKeys,
  busy,
  onAdd,
}: {
  activeKeys: Set<string>;
  busy: boolean;
  onAdd: (keys: string[]) => Promise<boolean>;
}) {
  const [types, setTypes] = useState<Set<string>>(new Set());
  // Escolhas manuais por cima dos tipos: true = marcou, false = desmarcou.
  const [manual, setManual] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState('');
  const [openGroups, setOpenGroups] = useState<Set<CatalogGroupId>>(
    new Set(CATALOG_GROUPS.filter((g) => g.core).map((g) => g.id)),
  );

  const typeKeys = useMemo(() => {
    const keys = new Set<string>();
    ESTABLISHMENT_TYPES.filter((t) => types.has(t.id)).forEach((t) => t.keys.forEach((k) => keys.add(k)));
    return keys;
  }, [types]);

  const isSelected = (key: string) => !activeKeys.has(key) && (manual[key] ?? typeKeys.has(key));
  const selectedKeys = CATEGORY_CATALOG.filter((e) => isSelected(e.key)).map((e) => e.key);

  function toggleType(id: string) {
    const next = new Set(types);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setTypes(next);
    // Abre os grupos de especialidade que o tipo escolhido usa.
    const preset = ESTABLISHMENT_TYPES.find((t) => t.id === id);
    if (preset && next.has(id)) {
      const groups = new Set(openGroups);
      CATEGORY_CATALOG.filter((e) => preset.keys.includes(e.key)).forEach((e) => groups.add(e.group));
      setOpenGroups(groups);
    }
  }
  function toggleKey(key: string) {
    setManual((prev) => ({ ...prev, [key]: !isSelected(key) }));
  }
  function toggleGroup(id: CatalogGroupId) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const q = normalize(query);
  const matches = (name: string) => !q || normalize(name).includes(q);

  function renderGroup(id: CatalogGroupId, label: string) {
    const entries = CATEGORY_CATALOG.filter((e) => e.group === id && matches(e.name));
    if (entries.length === 0) return null;
    const open = openGroups.has(id) || Boolean(q);
    const chosen = entries.filter((e) => isSelected(e.key)).length;
    return (
      <section key={id} className="border border-gray-100 rounded-xl overflow-hidden">
        <button
          onClick={() => toggleGroup(id)}
          className="w-full flex items-center gap-2 px-3 py-2.5 bg-gray-50 text-left"
        >
          <span className="flex-1 text-sm font-semibold text-gray-800">{label}</span>
          <span className="text-[11px] text-gray-400">
            {chosen > 0 ? `${chosen} marcada${chosen > 1 ? 's' : ''} · ` : ''}
            {entries.length}
          </span>
          <ChevronDown size={15} className={`text-gray-400 transition-transform ${open ? '' : '-rotate-90'}`} />
        </button>
        {open && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-2 gap-y-0.5 p-2">
            {entries.map((entry) => {
              const already = activeKeys.has(entry.key);
              const on = isSelected(entry.key);
              const Icon = getCategoryIcon(entry.key, entry.name);
              return (
                <button
                  key={entry.key}
                  onClick={() => !already && toggleKey(entry.key)}
                  disabled={already}
                  className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left text-sm transition-colors ${
                    already
                      ? 'text-gray-300 cursor-default'
                      : on
                        ? 'bg-gray-50 text-gray-900 font-semibold'
                        : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span className="w-5 flex justify-center shrink-0">{Icon && <Icon size={17} />}</span>
                  <span className="flex-1 leading-tight">{entry.name}</span>
                  {already ? (
                    <span className="text-[10px] font-semibold text-gray-400">No cardápio</span>
                  ) : (
                    <span
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                        on ? 'bg-gray-900 border-gray-900 text-white' : 'border-gray-300'
                      }`}
                    >
                      {on && <Check size={11} strokeWidth={3} />}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
        <section>
          <h3 className="text-sm font-semibold text-gray-800">Tipo de estabelecimento</h3>
          <p className="text-xs text-gray-400 mt-0.5 mb-2.5">
            Escolher um tipo marca as categorias mais comuns dele. É só um ponto de partida: você
            continua podendo marcar mais, desmarcar o que não quiser — e remover ou reordenar depois.
          </p>
          <div className="flex flex-wrap gap-2">
            {ESTABLISHMENT_TYPES.map((type) => {
              const on = types.has(type.id);
              const Icon = type.icon;
              return (
                <button
                  key={type.id}
                  onClick={() => toggleType(type.id)}
                  aria-pressed={on}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    on ? 'bg-gray-900 border-gray-900 text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Icon size={15} />
                  {type.label}
                </button>
              );
            })}
          </div>
        </section>

        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar categoria"
            className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm outline-none focus:border-gray-400"
          />
        </div>

        <div className="flex flex-col gap-2.5">
          <h3 className="text-sm font-semibold text-gray-800">Categorias universais</h3>
          {CATALOG_GROUPS.filter((g) => g.core).map((g) => renderGroup(g.id, g.label))}
        </div>

        <div className="flex flex-col gap-2.5">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Especialidades</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Pacotes por tipo de cozinha. Abrem sozinhos quando você escolhe o tipo correspondente.
            </p>
          </div>
          {CATALOG_GROUPS.filter((g) => !g.core).map((g) => renderGroup(g.id, g.label))}
        </div>
      </div>

      <div className="border-t border-gray-100 px-5 py-3 flex items-center gap-3">
        <p className="flex-1 text-xs text-gray-500">
          {selectedKeys.length === 0
            ? 'Marque categorias ou escolha um tipo de estabelecimento.'
            : `${selectedKeys.length} ${selectedKeys.length === 1 ? 'categoria marcada' : 'categorias marcadas'}`}
        </p>
        {selectedKeys.length > 0 && (
          <button
            onClick={() => {
              setTypes(new Set());
              setManual({});
            }}
            className="text-xs font-semibold text-gray-500 hover:underline"
          >
            Limpar
          </button>
        )}
        <button
          disabled={busy || selectedKeys.length === 0}
          onClick={async () => {
            if (await onAdd(selectedKeys)) {
              setTypes(new Set());
              setManual({});
            }
          }}
          className="bg-gray-900 text-white text-sm font-semibold rounded-lg px-4 py-2 disabled:opacity-40 flex items-center gap-1.5"
        >
          <Plus size={14} />
          Adicionar ao cardápio
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- aba 3
function CustomCreator({ busy, onCreate }: { busy: boolean; onCreate: (name: string) => Promise<boolean> }) {
  const [name, setName] = useState('');
  const trimmed = name.replace(/\s+/g, ' ').trim();
  return (
    <div className="flex-1 overflow-y-auto px-5 py-5">
      <h3 className="text-sm font-semibold text-gray-800">Nova categoria personalizada</h3>
      <p className="text-xs text-gray-400 mt-0.5 mb-3">
        Use quando nenhuma das categorias prontas serve. Ela entra no fim da lista — você reordena e
        renomeia depois em "Minhas categorias".
      </p>
      <div className="flex gap-2 max-w-md">
        <input
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && trimmed.length >= 2 && !busy) void onCreate(trimmed);
          }}
          placeholder="Ex.: Combos da Casa"
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-gray-400"
        />
        <button
          disabled={busy || trimmed.length < 2}
          onClick={async () => {
            if (await onCreate(trimmed)) setName('');
          }}
          className="bg-gray-900 text-white text-sm font-semibold rounded-xl px-4 py-2 disabled:opacity-40"
        >
          Criar
        </button>
      </div>
      <p className="text-[11px] text-gray-400 mt-2">
        De 2 a 40 caracteres: letras, números e os símbolos / &amp; ( ) . , ' -
      </p>
    </div>
  );
}
