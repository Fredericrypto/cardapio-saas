import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import type {
  AnalyticsDataPayload,
  CalculatorCategory,
  CalculatorDraft,
  CalculatorSession,
  ComparisonScenario,
  KeypadState,
  RecipeIngredient,
} from '../types/managerCalculator';
import { evaluateDraft, flattenResult, parseScaled, bpToPercent, divRound } from '../lib/calculator/calculatorMath';
import { MAX_TITLE_LENGTH } from '../lib/calculator/calculatorMeta';
import { pressKey } from '../lib/calculator/calculatorExpression';
import type { KeypadKey } from '../lib/calculator/calculatorExpression';
import {
  createDefaultSession,
  createEmptyDraft,
  createEmptyIngredient,
  deleteSavedDraft,
  deleteScenario,
  listSavedDrafts,
  listScenarios,
  loadSession,
  newId,
  parseSession,
  putSavedDraft,
  putScenario,
  serializeSession,
  sessionKey,
  writeSessionRaw,
} from '../lib/calculator/calculatorStorage';

export const CALCULATOR_PATH = '/calculadora';

interface NewDraftOptions {
  title?: string;
  inputs?: Record<string, number | string>;
  notice?: string;
  linkedProductId?: string;
  ingredients?: RecipeIngredient[];
  notes?: string;
}

export interface ManagerCalculatorContextValue {
  drafts: CalculatorDraft[];
  activeDraft: CalculatorDraft;
  keypad: KeypadState;
  notice: string | null; // aviso "dados importados da análise" da simulação ativa
  persistFailed: boolean;
  saved: CalculatorDraft[];
  scenarios: ComparisonScenario[];
  setActiveDraft: (id: string) => void;
  createDraft: (category?: CalculatorCategory, options?: NewDraftOptions) => string;
  closeDraft: (id: string) => void;
  renameDraft: (id: string, title: string) => void;
  setCategory: (id: string, category: CalculatorCategory) => void;
  setInput: (id: string, key: string, value: string) => void;
  setNotes: (id: string, notes: string) => void;
  setIngredients: (id: string, ingredients: RecipeIngredient[]) => void;
  dismissNotice: (id: string) => void;
  resetActiveDraftArea: () => void;
  pressKeypad: (key: KeypadKey) => void;
  openCalculatorWithData: (payload: AnalyticsDataPayload, category?: CalculatorCategory) => string;
  saveActiveDraft: () => Promise<void>;
  openSavedAsNewDraft: (saved: CalculatorDraft) => void;
  removeSaved: (id: string) => Promise<void>;
  saveScenario: (name: string, drafts: CalculatorDraft[]) => Promise<void>;
  removeScenario: (id: string) => Promise<void>;
}

const Ctx = createContext<ManagerCalculatorContextValue | null>(null);

// Recalcula os resultados guardados e carimba a hora sempre que o rascunho muda.
function touch(draft: CalculatorDraft): CalculatorDraft {
  return { ...draft, results: flattenResult(evaluateDraft(draft)), updatedAt: new Date().toISOString() };
}

const trimTitle = (title: string): string => title.slice(0, MAX_TITLE_LENGTH);

// 12.5 → "12.5", 6 → "6", 2.5 → "2.5" (sem zeros sobrando; vira o texto do campo).
function numberToField(n: number | undefined, decimals: number): string | undefined {
  if (n === undefined || !Number.isFinite(n) || n < 0) return undefined;
  return n.toFixed(decimals).replace(/\.?0+$/, '');
}

const moneyToField = (n: number | undefined): string | undefined => {
  if (n === undefined || !Number.isFinite(n) || n < 0) return undefined;
  return n.toFixed(2);
};

// Margem que o preço atual rende hoje (já considerando impostos/taxas), para o
// campo "margem desejada" nascer coerente: simular sem mexer devolve o preço atual.
function currentMarginField(payload: AnalyticsDataPayload): string | undefined {
  const { currentPrice, costPrice } = payload;
  if (currentPrice === undefined || costPrice === undefined) return undefined;
  const price = parseScaled(currentPrice, 2);
  const cost = parseScaled(costPrice, 2);
  if (price === null || cost === null || price <= BigInt(0)) return undefined;
  const rate = (v: number | undefined): bigint => parseScaled(v ?? 0, 2) ?? BigInt(0);
  const feesBp = rate(payload.taxRate) + rate(payload.cardFeeRate) + rate(payload.platformCommissionRate);
  if (feesBp >= BigInt(10000)) return undefined;
  const deductions = divRound(price * feesBp, BigInt(10000));
  const profit = price - cost - deductions;
  if (profit <= BigInt(0)) return '0';
  const marginBp = divRound(profit * BigInt(10000), price);
  // A precificação exige soma de taxas + margem < 100%.
  if (marginBp + feesBp >= BigInt(10000)) return undefined;
  return numberToField(bpToPercent(marginBp), 2);
}

export function buildImportedDraft(payload: AnalyticsDataPayload, category: CalculatorCategory | undefined, count: number): {
  category: CalculatorCategory;
  options: NewDraftOptions;
} {
  const isProduct = payload.productId !== undefined || payload.costPrice !== undefined || payload.currentPrice !== undefined;
  const chosen: CalculatorCategory = category ?? (isProduct ? 'PRICING_MARKUP' : 'BREAK_EVEN');
  const inputs: Record<string, number | string> = {};
  const put = (key: string, value: string | undefined) => {
    if (value !== undefined) inputs[key] = value;
  };

  if (chosen === 'PRICING_MARKUP') {
    put('cost', moneyToField(payload.costPrice));
    put('currentPrice', moneyToField(payload.currentPrice));
    put('tax', numberToField(payload.taxRate, 2));
    put('card', numberToField(payload.cardFeeRate, 2));
    put('delivery', numberToField(payload.platformCommissionRate, 2));
    put('margin', currentMarginField(payload));
  } else if (chosen === 'DELIVERY_MARGIN') {
    put('price', moneyToField(payload.currentPrice));
    put('cost', moneyToField(payload.costPrice));
    put('tax', numberToField(payload.taxRate, 2));
    put('commission', numberToField(payload.platformCommissionRate, 2));
  } else if (chosen === 'BREAK_EVEN') {
    put('fixedCosts', moneyToField(payload.fixedCostsEstimate));
    const parts = [payload.cmvPercent, payload.taxRate, payload.cardFeeRate, payload.platformCommissionRate];
    const sumBp = parts.reduce<bigint>((acc, v) => acc + (v === undefined ? BigInt(0) : (parseScaled(v, 2) ?? BigInt(0))), BigInt(0));
    if (parts.some((v) => v !== undefined)) put('variablePct', numberToField(bpToPercent(sumBp > BigInt(10000) ? BigInt(10000) : sumBp), 2));
    inputs.days = '30';
  } else if (chosen === 'CMV') {
    put('revenue', moneyToField(payload.monthlyRevenue));
  }

  const name = payload.productName?.trim();
  const title = name ? `Simulação – ${name}` : `Resumo do mês ${count}`;
  const notice = name
    ? `Dados importados da análise do item "${name}". Modifique os valores para simular novos cenários.`
    : 'Dados importados do resumo de faturamento da análise. Complete o que faltar e modifique os valores para simular novos cenários.';
  return { category: chosen, options: { title: trimTitle(title), inputs, notice, linkedProductId: payload.productId } };
}

export function ManagerCalculatorProvider({ children }: { children: ReactNode }) {
  const { tenant } = useAuth();
  const tenantId = tenant?.id ?? null;

  const [session, setSession] = useState<CalculatorSession>(() => loadSession(tenantId) ?? createDefaultSession());
  const [persistFailed, setPersistFailed] = useState(false);
  const [saved, setSaved] = useState<CalculatorDraft[]>([]);
  const [scenarios, setScenarios] = useState<ComparisonScenario[]>([]);
  const lastRaw = useRef<string>('');

  // Auto-save: a cada mudança, na hora (o volume é pequeno). Se o conteúdo for
  // igual ao que já está gravado (ex.: veio de outra aba), não regrava.
  useEffect(() => {
    const raw = serializeSession(session);
    if (raw === lastRaw.current) return;
    lastRaw.current = raw;
    setPersistFailed(!writeSessionRaw(tenantId, raw));
  }, [session, tenantId]);

  // Outra aba do navegador mexeu na calculadora → acompanha (a última gravação vale).
  useEffect(() => {
    const key = sessionKey(tenantId);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key || e.newValue === null || e.newValue === lastRaw.current) return;
      const next = parseSession(e.newValue);
      if (!next) return;
      lastRaw.current = e.newValue;
      setSession(next);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [tenantId]);

  // Histórico (IndexedDB) carrega uma vez.
  useEffect(() => {
    let cancelled = false;
    void Promise.all([listSavedDrafts(tenantId), listScenarios(tenantId)]).then(([s, c]) => {
      if (cancelled) return;
      setSaved(s);
      setScenarios(c);
    });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const updateDraft = useCallback((id: string, change: (d: CalculatorDraft) => CalculatorDraft) => {
    setSession((prev) => ({ ...prev, drafts: prev.drafts.map((d) => (d.id === id ? touch(change(d)) : d)) }));
  }, []);

  const createDraft = useCallback((category: CalculatorCategory = 'PRICING_MARKUP', options: NewDraftOptions = {}): string => {
    const id = newId();
    setSession((prev) => {
      const base = createEmptyDraft(category, options.title ?? `Simulação ${prev.drafts.length + 1}`);
      const draft = touch({
        ...base,
        id,
        inputs: { ...base.inputs, ...(options.inputs ?? {}) },
        ...(options.notes ? { notes: options.notes } : {}),
        ...(options.linkedProductId ? { linkedProductId: options.linkedProductId } : {}),
        ...(options.ingredients ? { ingredients: options.ingredients } : {}),
      });
      const notices = options.notice ? { ...prev.notices, [id]: options.notice } : prev.notices;
      return { ...prev, drafts: [...prev.drafts, draft], activeDraftId: id, notices };
    });
    return id;
  }, []);

  const closeDraft = useCallback((id: string) => {
    setSession((prev) => {
      const index = prev.drafts.findIndex((d) => d.id === id);
      if (index === -1) return prev;
      const { [id]: _removed, ...notices } = prev.notices;
      void _removed;
      const remaining = prev.drafts.filter((d) => d.id !== id);
      if (remaining.length === 0) {
        const fresh = createEmptyDraft('PRICING_MARKUP', 'Simulação 1');
        return { ...prev, drafts: [fresh], activeDraftId: fresh.id, notices };
      }
      const activeStillThere = remaining.some((d) => d.id === prev.activeDraftId);
      const fallback = remaining[Math.min(index, remaining.length - 1)];
      return { ...prev, drafts: remaining, activeDraftId: activeStillThere ? prev.activeDraftId : fallback.id, notices };
    });
  }, []);

  const setActiveDraft = useCallback((id: string) => {
    setSession((prev) => (prev.drafts.some((d) => d.id === id) ? { ...prev, activeDraftId: id } : prev));
  }, []);

  const renameDraft = useCallback((id: string, title: string) => updateDraft(id, (d) => ({ ...d, title: trimTitle(title) })), [updateDraft]);

  const setCategory = useCallback(
    (id: string, category: CalculatorCategory) =>
      updateDraft(id, (d) => ({
        ...d,
        category,
        inputs: category === 'BREAK_EVEN' && !d.inputs.days ? { ...d.inputs, days: '30' } : d.inputs,
        ingredients: category === 'RECIPE_COST' ? (d.ingredients?.length ? d.ingredients : [createEmptyIngredient()]) : d.ingredients,
      })),
    [updateDraft],
  );

  const setInput = useCallback(
    (id: string, key: string, value: string) => updateDraft(id, (d) => ({ ...d, inputs: { ...d.inputs, [key]: value } })),
    [updateDraft],
  );

  const setNotes = useCallback((id: string, notes: string) => updateDraft(id, (d) => ({ ...d, notes: notes.slice(0, 2000) })), [updateDraft]);

  const setIngredients = useCallback(
    (id: string, ingredients: RecipeIngredient[]) => updateDraft(id, (d) => ({ ...d, ingredients })),
    [updateDraft],
  );

  const dismissNotice = useCallback((id: string) => {
    setSession((prev) => {
      if (!(id in prev.notices)) return prev;
      const { [id]: _removed, ...notices } = prev.notices;
      void _removed;
      return { ...prev, notices };
    });
  }, []);

  // "Limpar tudo": zera SÓ a área de cálculo atual. Rascunhos salvos não são tocados.
  const resetActiveDraftArea = useCallback(() => {
    setSession((prev) => {
      const { [prev.activeDraftId]: _removed, ...notices } = prev.notices;
      void _removed;
      return {
        ...prev,
        keypad: { expression: '', result: null, history: [] },
        notices,
        drafts: prev.drafts.map((d) =>
          d.id === prev.activeDraftId
            ? touch({
                ...d,
                inputs: d.category === 'BREAK_EVEN' ? { days: '30' } : {},
                notes: undefined,
                linkedProductId: undefined,
                ingredients: d.category === 'RECIPE_COST' ? [createEmptyIngredient()] : d.ingredients,
              })
            : d,
        ),
      };
    });
  }, []);

  const pressKeypad = useCallback((key: KeypadKey) => {
    setSession((prev) => {
      const next = pressKey(prev.keypad, key);
      return next === prev.keypad ? prev : { ...prev, keypad: next };
    });
  }, []);

  const openCalculatorWithData = useCallback(
    (payload: AnalyticsDataPayload, category?: CalculatorCategory): string => {
      const { category: chosen, options } = buildImportedDraft(payload, category, session.drafts.length + 1);
      return createDraft(chosen, options);
    },
    [createDraft, session.drafts.length],
  );

  const saveActiveDraft = useCallback(async () => {
    const draft = session.drafts.find((d) => d.id === session.activeDraftId);
    if (!draft) return;
    const snapshot = touch(draft);
    await putSavedDraft(tenantId, snapshot);
    setSaved((prev) => [snapshot, ...prev.filter((s) => s.id !== snapshot.id)]);
  }, [session.drafts, session.activeDraftId, tenantId]);

  const openSavedAsNewDraft = useCallback(
    (source: CalculatorDraft) => {
      createDraft(source.category, {
        title: `${source.title} (cópia)`,
        inputs: source.inputs,
        notes: source.notes,
        linkedProductId: source.linkedProductId,
        ingredients: source.ingredients?.map((i) => ({ ...i, id: newId() })),
      });
    },
    [createDraft],
  );

  const removeSaved = useCallback(
    async (id: string) => {
      await deleteSavedDraft(tenantId, id);
      setSaved((prev) => prev.filter((s) => s.id !== id));
    },
    [tenantId],
  );

  const saveScenario = useCallback(
    async (name: string, selected: CalculatorDraft[]) => {
      const scenario: ComparisonScenario = {
        id: newId(),
        name: trimTitle(name.trim() || 'Cenário'),
        drafts: selected,
        createdAt: new Date().toISOString(),
      };
      await putScenario(tenantId, scenario);
      setScenarios((prev) => [scenario, ...prev]);
    },
    [tenantId],
  );

  const removeScenario = useCallback(
    async (id: string) => {
      await deleteScenario(tenantId, id);
      setScenarios((prev) => prev.filter((s) => s.id !== id));
    },
    [tenantId],
  );

  const activeDraft = session.drafts.find((d) => d.id === session.activeDraftId) ?? session.drafts[0];

  const value = useMemo<ManagerCalculatorContextValue>(
    () => ({
      drafts: session.drafts,
      activeDraft,
      keypad: session.keypad,
      notice: session.notices[activeDraft.id] ?? null,
      persistFailed,
      saved,
      scenarios,
      setActiveDraft,
      createDraft,
      closeDraft,
      renameDraft,
      setCategory,
      setInput,
      setNotes,
      setIngredients,
      dismissNotice,
      resetActiveDraftArea,
      pressKeypad,
      openCalculatorWithData,
      saveActiveDraft,
      openSavedAsNewDraft,
      removeSaved,
      saveScenario,
      removeScenario,
    }),
    [
      session, activeDraft, persistFailed, saved, scenarios, setActiveDraft, createDraft, closeDraft, renameDraft,
      setCategory, setInput, setNotes, setIngredients, dismissNotice, resetActiveDraftArea, pressKeypad,
      openCalculatorWithData, saveActiveDraft, openSavedAsNewDraft, removeSaved, saveScenario, removeScenario,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useManagerCalculator(): ManagerCalculatorContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useManagerCalculator precisa estar dentro de ManagerCalculatorProvider');
  return ctx;
}

// Atalho para a aba Análise: abre a calculadora já preenchida e navega até ela.
//   const openCalculator = useOpenCalculator();
//   openCalculator({ productId, productName, costPrice, currentPrice, taxRate });
export function useOpenCalculator(): (payload: AnalyticsDataPayload, category?: CalculatorCategory) => void {
  const { openCalculatorWithData } = useManagerCalculator();
  const navigate = useNavigate();
  return useCallback(
    (payload: AnalyticsDataPayload, category?: CalculatorCategory) => {
      openCalculatorWithData(payload, category);
      navigate(CALCULATOR_PATH);
    },
    [openCalculatorWithData, navigate],
  );
}
