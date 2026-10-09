import { useMemo, useState } from 'react';
import { BookOpen, Calculator, Plus, RefreshCw, Scale, Trash2, TrendingUp, Wand2, X, Zap } from 'lucide-react';
import { useManagerCalculator } from '../../contexts/ManagerCalculatorContext';
import { CATEGORIES, evaluateDraft } from '../../lib/calculator/calculatorMath';
import { formatBRL } from '../../lib/calculator/calculatorFormat';
import { CATEGORY_META, MAX_TITLE_LENGTH } from '../../lib/calculator/calculatorMeta';
import type { CalculatorDraft } from '../../types/managerCalculator';
import { CalculatorFields, RecipeIngredientsEditor } from './CalculatorFields';
import { CalculatorResults } from './CalculatorResults';
import { CompareCalculationsModal } from './CompareCalculationsModal';
import { ConfirmDialog } from './ConfirmDialog';
import { DisplayAndKeypad } from './DisplayAndKeypad';
import { ManualAndFormulasModal } from './ManualAndFormulasModal';
import { QuickFillFromAnalytics } from './QuickFillFromAnalytics';
import { SaveAndExportMenu } from './SaveAndExportMenu';

const hasContent = (d: CalculatorDraft): boolean =>
  Object.entries(d.inputs).some(([k, v]) => !(k === 'days' && v === '30') && String(v).trim() !== '') ||
  (d.ingredients ?? []).some((i) => i.name.trim() !== '' || i.usedQty.trim() !== '' || i.packPrice.trim() !== '') ||
  Boolean(d.notes?.trim());

type Dialog = 'manual' | 'compare' | 'import' | 'reset' | { closeId: string } | null;

// Área de trabalho da calculadora (tela cheia dentro do painel): abas de rascunho,
// campos, resultado, teclado e ferramentas. Tudo é salvo automaticamente.
export function ManagerCalculatorModal() {
  const {
    drafts, activeDraft, notice, persistFailed,
    setActiveDraft, createDraft, closeDraft, renameDraft, setCategory, setInput, setNotes,
    setIngredients, dismissNotice, resetActiveDraftArea,
  } = useManagerCalculator();
  const [dialog, setDialog] = useState<Dialog>(null);

  const evaluation = useMemo(() => evaluateDraft(activeDraft), [activeDraft]);
  const closing = typeof dialog === 'object' && dialog !== null ? drafts.find((d) => d.id === dialog.closeId) : undefined;

  function requestClose(d: CalculatorDraft) {
    if (hasContent(d)) setDialog({ closeId: d.id });
    else closeDraft(d.id);
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-gray-900 flex items-center gap-2">
            <Calculator size={20} strokeWidth={1.5} />
            Calculadora de Gestão
          </h1>
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[11px] font-semibold text-gray-600">
            <Zap size={12} strokeWidth={1.5} className="text-amber-500" />
            Calculadora de Gestão Exclusiva | Módulo Financeiro
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setDialog('import')} className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">
            <TrendingUp size={14} strokeWidth={1.5} />
            Importar da Análise
          </button>
          <button type="button" onClick={() => setDialog('compare')} className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">
            <Scale size={14} strokeWidth={1.5} />
            Comparar cenários
          </button>
          <button type="button" onClick={() => setDialog('manual')} className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">
            <BookOpen size={14} strokeWidth={1.5} />
            Manual do Gestor & Fórmulas
          </button>
          <SaveAndExportMenu evaluation={evaluation} />
        </div>
      </div>

      {persistFailed && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5" role="status">
          Este navegador não está deixando salvar automaticamente (modo privado ou sem espaço). Exporte ou salve suas simulações para não perder o trabalho.
        </p>
      )}

      {/* Abas de rascunho */}
      <div role="tablist" aria-label="Simulações abertas" className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {drafts.map((d) => {
          const active = d.id === activeDraft.id;
          return (
            <div key={d.id} className={`shrink-0 flex items-center rounded-xl border ${active ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-200 text-gray-600'}`}>
              <button type="button" role="tab" aria-selected={active} onClick={() => setActiveDraft(d.id)} className="pl-3.5 pr-2 py-2 text-xs font-semibold whitespace-nowrap max-w-[200px] truncate">
                {d.title || 'Simulação'}
              </button>
              <button type="button" onClick={() => requestClose(d)} aria-label={`Fechar ${d.title}`} className="pr-2.5 pl-1 py-2 opacity-70 hover:opacity-100">
                <X size={13} strokeWidth={1.5} />
              </button>
            </div>
          );
        })}
        <button type="button" onClick={() => createDraft()} aria-label="Nova simulação" title="Nova simulação" className="shrink-0 p-2 rounded-xl border border-dashed border-gray-300 text-gray-500 hover:bg-gray-50">
          <Plus size={14} strokeWidth={1.5} />
        </button>
      </div>

      {notice && (
        <div className="flex items-start gap-2.5 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-700" role="status">
          <Wand2 size={15} strokeWidth={1.5} className="shrink-0 mt-px" />
          <span className="flex-1">{notice}</span>
          <button type="button" onClick={() => dismissNotice(activeDraft.id)} aria-label="Dispensar aviso" className="opacity-70 hover:opacity-100">
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
        <div className="flex flex-col gap-5 min-w-0">
          <section className="bg-white border border-gray-100 rounded-2xl p-6 flex flex-col gap-6">
            <div className="flex flex-wrap items-end gap-3 justify-between">
              <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
                <label htmlFor="calc-title" className="text-xs font-semibold text-gray-600">Nome da simulação</label>
                <input
                  id="calc-title"
                  value={activeDraft.title}
                  maxLength={MAX_TITLE_LENGTH}
                  onChange={(e) => renameDraft(activeDraft.id, e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm outline-none focus:border-gray-400"
                />
              </div>
              <button type="button" onClick={() => setDialog('reset')} className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-xs font-semibold text-red-600 hover:bg-red-100">
                <Trash2 size={14} strokeWidth={1.5} />
                Limpar tudo
              </button>
            </div>

            <div role="tablist" aria-label="Tipo de cálculo" className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="tab"
                  aria-selected={activeDraft.category === c}
                  onClick={() => setCategory(activeDraft.id, c)}
                  className={`rounded-xl px-3.5 py-2 text-xs font-semibold border ${activeDraft.category === c ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                >
                  {CATEGORY_META[c].label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 -mt-3">{CATEGORY_META[activeDraft.category].description}</p>

            {activeDraft.category === 'RECIPE_COST' && (
              <RecipeIngredientsEditor ingredients={activeDraft.ingredients ?? []} onChange={(next) => setIngredients(activeDraft.id, next)} />
            )}
            <CalculatorFields category={activeDraft.category} inputs={activeDraft.inputs} onChange={(key, value) => setInput(activeDraft.id, key, value)} />
          </section>

          <section className="bg-white border border-gray-100 rounded-2xl p-6 flex flex-col gap-4">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <RefreshCw size={15} strokeWidth={1.5} />
              Resultado
            </h2>
            <CalculatorResults evaluation={evaluation} />
            {evaluation.status === 'ok' && evaluation.result.category === 'RECIPE_COST' && (
              <button
                type="button"
                onClick={() => {
                  if (evaluation.status !== 'ok' || evaluation.result.category !== 'RECIPE_COST') return;
                  createDraft('PRICING_MARKUP', {
                    title: `Preço – ${activeDraft.title}`,
                    inputs: { cost: evaluation.result.costPerPortion.toFixed(2) },
                    notice: `Custo por porção (${formatBRL(evaluation.result.costPerPortion)}) trazido da ficha técnica "${activeDraft.title}".`,
                  });
                }}
                className="self-start rounded-xl border border-gray-200 px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Usar este custo na precificação
              </button>
            )}
          </section>

          <section className="bg-white border border-gray-100 rounded-2xl p-6 flex flex-col gap-2">
            <label htmlFor="calc-notes" className="text-xs font-semibold text-gray-600">Observações da simulação</label>
            <textarea
              id="calc-notes"
              value={activeDraft.notes ?? ''}
              maxLength={2000}
              rows={3}
              onChange={(e) => setNotes(activeDraft.id, e.target.value)}
              placeholder="Anote premissas, fornecedores, datas..."
              className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm outline-none focus:border-gray-400 resize-y"
            />
          </section>
        </div>

        <div className="lg:sticky lg:top-0">
          <DisplayAndKeypad />
        </div>
      </div>

      {dialog === 'manual' && <ManualAndFormulasModal onClose={() => setDialog(null)} />}
      {dialog === 'compare' && <CompareCalculationsModal onClose={() => setDialog(null)} />}
      {dialog === 'import' && <QuickFillFromAnalytics onClose={() => setDialog(null)} />}
      {dialog === 'reset' && (
        <ConfirmDialog
          title="Limpar esta área de cálculo?"
          message="Tem certeza que deseja limpar esta área de cálculo? Seus rascunhos salvos não serão afetados."
          confirmLabel="Limpar tudo"
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            resetActiveDraftArea();
            setDialog(null);
          }}
        />
      )}
      {closing && (
        <ConfirmDialog
          title={`Fechar "${closing.title}"?`}
          message="Os dados desta aba serão descartados. Se quiser guardar, use Salvar e exportar antes de fechar."
          confirmLabel="Fechar aba"
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            closeDraft(closing.id);
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}
