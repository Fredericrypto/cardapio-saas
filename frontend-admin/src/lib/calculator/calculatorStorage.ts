// Persistência da calculadora.
//  - SESSÃO (abas de rascunho, campos, visor): localStorage, gravada a cada mudança
//    em `frontend_cardapio_calc_session:<restaurante>` — é o que faz a calculadora
//    reabrir exatamente onde parou (como o Bloco de Notas do Windows 11).
//  - HISTÓRICO (simulações salvas e cenários comparados): IndexedDB, que aguenta
//    volume maior; se o navegador bloquear o IndexedDB, cai para o localStorage.
// A chave leva o id do restaurante para dois restaurantes no mesmo navegador
// nunca verem os rascunhos um do outro.
import type {
  CalculatorCategory,
  CalculatorDraft,
  CalculatorSession,
  ComparisonScenario,
  KeypadHistoryEntry,
  KeypadState,
  RecipeIngredient,
} from '../../types/managerCalculator';
import { CATEGORIES } from './calculatorMath';
import { EMPTY_KEYPAD } from './calculatorExpression';
import { MAX_TITLE_LENGTH } from './calculatorMeta';

export const SESSION_STORAGE_KEY = 'frontend_cardapio_calc_session';

export function sessionKey(tenantId: string | null | undefined): string {
  return `${SESSION_STORAGE_KEY}:${tenantId ?? 'anon'}`;
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createEmptyDraft(category: CalculatorCategory, title: string): CalculatorDraft {
  const now = new Date().toISOString();
  return {
    id: newId(),
    title: title.slice(0, MAX_TITLE_LENGTH),
    category,
    inputs: category === 'BREAK_EVEN' ? { days: '30' } : {},
    results: {},
    createdAt: now,
    updatedAt: now,
    ...(category === 'RECIPE_COST' ? { ingredients: [createEmptyIngredient()] } : {}),
  };
}

export function createEmptyIngredient(): RecipeIngredient {
  return { id: newId(), name: '', usedQty: '', packQty: '', packPrice: '' };
}

export function createDefaultSession(): CalculatorSession {
  const draft = createEmptyDraft('PRICING_MARKUP', 'Simulação 1');
  return { version: 1, drafts: [draft], activeDraftId: draft.id, keypad: EMPTY_KEYPAD, notices: {} };
}

// ---------------------------------------------------------------------------
// Validação do que vem do disco (o usuário/outra versão pode ter deixado lixo)
// ---------------------------------------------------------------------------
type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCategory = (v: unknown): v is CalculatorCategory => typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);

function sanitizeIngredients(raw: unknown): RecipeIngredient[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isObject).map((i) => ({
    id: str(i.id) || newId(),
    name: str(i.name).slice(0, 80),
    usedQty: str(i.usedQty).slice(0, 20),
    packQty: str(i.packQty).slice(0, 20),
    packPrice: str(i.packPrice).slice(0, 20),
  }));
}

export function sanitizeDraft(raw: unknown): CalculatorDraft | null {
  if (!isObject(raw) || !isCategory(raw.category)) return null;
  const inputs: Record<string, number | string> = {};
  if (isObject(raw.inputs)) {
    for (const [k, v] of Object.entries(raw.inputs)) {
      if (typeof v === 'string') inputs[k] = v.slice(0, 40);
      else if (typeof v === 'number' && Number.isFinite(v)) inputs[k] = v;
    }
  }
  const now = new Date().toISOString();
  const draft: CalculatorDraft = {
    id: str(raw.id) || newId(),
    title: str(raw.title, 'Simulação').slice(0, MAX_TITLE_LENGTH),
    category: raw.category,
    inputs,
    results: isObject(raw.results) ? (raw.results as Record<string, number | object>) : {},
    createdAt: str(raw.createdAt, now),
    updatedAt: str(raw.updatedAt, now),
  };
  if (typeof raw.notes === 'string') draft.notes = raw.notes.slice(0, 2000);
  if (typeof raw.linkedProductId === 'string') draft.linkedProductId = raw.linkedProductId;
  if (raw.category === 'RECIPE_COST') {
    const ingredients = sanitizeIngredients(raw.ingredients);
    draft.ingredients = ingredients.length > 0 ? ingredients : [createEmptyIngredient()];
  }
  return draft;
}

function sanitizeKeypad(raw: unknown): KeypadState {
  if (!isObject(raw)) return EMPTY_KEYPAD;
  const history: KeypadHistoryEntry[] = Array.isArray(raw.history)
    ? raw.history
        .filter(isObject)
        .map((h) => ({ expression: str(h.expression).slice(0, 200), result: str(h.result).slice(0, 40) }))
        .slice(0, 30)
    : [];
  return {
    expression: str(raw.expression).slice(0, 200),
    result: typeof raw.result === 'string' ? raw.result.slice(0, 80) : null,
    history,
  };
}

export function parseSession(text: string): CalculatorSession | null {
  try {
    const raw: unknown = JSON.parse(text);
    if (!isObject(raw) || raw.version !== 1 || !Array.isArray(raw.drafts)) return null;
    const drafts = raw.drafts.map(sanitizeDraft).filter((d): d is CalculatorDraft => d !== null);
    if (drafts.length === 0) return null;
    const activeId = str(raw.activeDraftId);
    const notices: Record<string, string> = {};
    if (isObject(raw.notices)) {
      for (const [id, text2] of Object.entries(raw.notices)) {
        if (typeof text2 === 'string' && drafts.some((d) => d.id === id)) notices[id] = text2.slice(0, 300);
      }
    }
    return {
      version: 1,
      drafts,
      activeDraftId: drafts.some((d) => d.id === activeId) ? activeId : drafts[0].id,
      keypad: sanitizeKeypad(raw.keypad),
      notices,
    };
  } catch {
    return null;
  }
}

export function loadSession(tenantId: string | null | undefined): CalculatorSession | null {
  try {
    const text = window.localStorage.getItem(sessionKey(tenantId));
    return text ? parseSession(text) : null;
  } catch {
    return null;
  }
}

export function serializeSession(session: CalculatorSession): string {
  return JSON.stringify(session);
}

// Devolve false se o navegador recusou (modo privado, cota cheia): a tela segue funcionando.
export function writeSessionRaw(tenantId: string | null | undefined, raw: string): boolean {
  try {
    window.localStorage.setItem(sessionKey(tenantId), raw);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Histórico: IndexedDB com fallback para localStorage
// ---------------------------------------------------------------------------
export type StoreName = 'saved' | 'scenarios';
const DB_VERSION = 1;

function dbName(tenantId: string | null | undefined): string {
  return `${SESSION_STORAGE_KEY}_db:${tenantId ?? 'anon'}`;
}

function openDb(tenantId: string | null | undefined): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexedDB indisponível'));
      return;
    }
    const req = indexedDB.open(dbName(tenantId), DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('saved')) db.createObjectStore('saved', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('scenarios')) db.createObjectStore('scenarios', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Falha ao abrir o IndexedDB'));
  });
}

function fallbackKey(tenantId: string | null | undefined, store: StoreName): string {
  return `${SESSION_STORAGE_KEY}_${store}:${tenantId ?? 'anon'}`;
}

function fallbackRead(tenantId: string | null | undefined, store: StoreName): unknown[] {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(fallbackKey(tenantId, store)) ?? '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function fallbackWrite(tenantId: string | null | undefined, store: StoreName, items: unknown[]): void {
  try {
    window.localStorage.setItem(fallbackKey(tenantId, store), JSON.stringify(items));
  } catch {
    /* sem espaço: segue sem persistir o histórico */
  }
}

function tx<T>(db: IDBDatabase, store: StoreName, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = run(t.objectStore(store));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error ?? new Error('Falha na transação'));
    t.onabort = () => reject(t.error ?? new Error('Transação cancelada'));
  });
}

async function listRecords(tenantId: string | null | undefined, store: StoreName): Promise<unknown[]> {
  try {
    const db = await openDb(tenantId);
    try {
      return await tx<unknown[]>(db, store, 'readonly', (s) => s.getAll());
    } finally {
      db.close();
    }
  } catch {
    return fallbackRead(tenantId, store);
  }
}

async function putRecord(tenantId: string | null | undefined, store: StoreName, record: { id: string }): Promise<void> {
  try {
    const db = await openDb(tenantId);
    try {
      await tx<IDBValidKey>(db, store, 'readwrite', (s) => s.put(record));
    } finally {
      db.close();
    }
  } catch {
    const items = fallbackRead(tenantId, store).filter((i) => !(isObject(i) && i.id === record.id));
    fallbackWrite(tenantId, store, [...items, record]);
  }
}

async function deleteRecord(tenantId: string | null | undefined, store: StoreName, id: string): Promise<void> {
  try {
    const db = await openDb(tenantId);
    try {
      await tx<undefined>(db, store, 'readwrite', (s) => s.delete(id));
    } finally {
      db.close();
    }
  } catch {
    fallbackWrite(
      tenantId,
      store,
      fallbackRead(tenantId, store).filter((i) => !(isObject(i) && i.id === id)),
    );
  }
}

const byNewest = <T extends { updatedAt?: string; createdAt: string }>(a: T, b: T): number =>
  (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt);

export async function listSavedDrafts(tenantId: string | null | undefined): Promise<CalculatorDraft[]> {
  const rows = await listRecords(tenantId, 'saved');
  return rows.map(sanitizeDraft).filter((d): d is CalculatorDraft => d !== null).sort(byNewest);
}

export const putSavedDraft = (tenantId: string | null | undefined, draft: CalculatorDraft): Promise<void> =>
  putRecord(tenantId, 'saved', draft);

export const deleteSavedDraft = (tenantId: string | null | undefined, id: string): Promise<void> =>
  deleteRecord(tenantId, 'saved', id);

export async function listScenarios(tenantId: string | null | undefined): Promise<ComparisonScenario[]> {
  const rows = await listRecords(tenantId, 'scenarios');
  const out: ComparisonScenario[] = [];
  for (const r of rows) {
    if (!isObject(r) || typeof r.id !== 'string' || !Array.isArray(r.drafts)) continue;
    out.push({
      id: r.id,
      name: str(r.name, 'Cenário').slice(0, MAX_TITLE_LENGTH),
      drafts: r.drafts.map(sanitizeDraft).filter((d): d is CalculatorDraft => d !== null),
      createdAt: str(r.createdAt, new Date().toISOString()),
    });
  }
  return out.sort(byNewest);
}

export const putScenario = (tenantId: string | null | undefined, scenario: ComparisonScenario): Promise<void> =>
  putRecord(tenantId, 'scenarios', scenario);

export const deleteScenario = (tenantId: string | null | undefined, id: string): Promise<void> =>
  deleteRecord(tenantId, 'scenarios', id);
