import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Save, Scale, Trash2, X } from 'lucide-react';
import { useManagerCalculator } from '../../contexts/ManagerCalculatorContext';
import { comparableMetrics } from '../../lib/calculator/calculatorMath';
import { formatBRL, formatPercent } from '../../lib/calculator/calculatorFormat';
import { CATEGORY_META } from '../../lib/calculator/calculatorMeta';
import type { CalculatorDraft, ComparableMetrics } from '../../types/managerCalculator';

const MAX_SELECTED = 3;

type MetricKey = keyof ComparableMetrics;
interface Row {
  key: MetricKey;
  label: string;
  format: (v: number) => string;
  better: 'high' | 'low'; // qual extremo é o "bom"
}

const ROWS: Row[] = [
  { key: 'salePrice', label: 'Preço de venda', format: formatBRL, better: 'high' },
  { key: 'netProfit', label: 'Lucro líquido por unidade', format: formatBRL, better: 'high' },
  { key: 'marginPercent', label: 'Margem %', format: formatPercent, better: 'high' },
  { key: 'breakEven', label: 'Ponto de equilíbrio (mensal)', format: formatBRL, better: 'low' },
];

// Cenário mais lucrativo e de maior risco, entre os selecionados.
function extremes(items: Array<{ id: string; m: ComparableMetrics | null }>) {
  const withProfit = items.filter((i) => i.m?.netProfit != null) as Array<{ id: string; m: ComparableMetrics & { netProfit: number } }>;
  const best = withProfit.length >= 2 ? withProfit.reduce((a, b) => (b.m.netProfit > a.m.netProfit ? b : a)) : null;
  const withMargin = items.filter((i) => i.m?.marginPercent != null && i.m.netProfit != null) as Array<{ id: string; m: ComparableMetrics & { marginPercent: number } }>;
  const worst = withMargin.length >= 2 ? withMargin.reduce((a, b) => (b.m.marginPercent < a.m.marginPercent ? b : a)) : null;
  return { bestId: best?.id ?? null, riskId: worst && worst.id !== best?.id ? worst.id : null };
}

export function CompareCalculationsModal({ onClose }: { onClose: () => void }) {
  const { saved, drafts, scenarios, saveScenario, removeScenario } = useManagerCalculator();
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Salvas + abas abertas que ainda não foram salvas (a salva tem prioridade).
  const candidates = useMemo<CalculatorDraft[]>(() => {
    const savedIds = new Set(saved.map((s) => s.id));
    return [...saved, ...drafts.filter((d) => !savedIds.has(d.id))];
  }, [saved, drafts]);

  const chosen = candidates.filter((c) => selected.includes(c.id));
  const metrics = chosen.map((d) => ({ id: d.id, m: comparableMetrics(d) }));
  const { bestId, riskId } = extremes(metrics);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= MAX_SELECTED ? prev : [...prev, id]));
  }

  async function handleSaveScenario() {
    await saveScenario(name, chosen);
    setName('');
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 2000);
  }

  function cellTone(row: Row, id: string): string {
    const values = metrics.filter((x) => x.m?.[row.key] != null).map((x) => ({ id: x.id, v: x.m?.[row.key] as number }));
    if (values.length < 2) return '';
    const max = Math.max(...values.map((x) => x.v));
    const min = Math.min(...values.map((x) => x.v));
    if (max === min) return '';
    const mine = values.find((x) => x.id === id)?.v;
    if (mine === undefined) return '';
    const good = row.better === 'high' ? max : min;
    const bad = row.better === 'high' ? min : max;
    if (row.key === 'salePrice') return '';
    return mine === good ? 'text-emerald-600 dark:text-emerald-400 font-bold' : mine === bad ? 'text-red-600 dark:text-red-400 font-bold' : '';
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Comparar cenários" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Scale size={16} strokeWidth={1.5} />
              Comparar cenários
            </h2>
            <p className="text-xs text-gray-400 mt-1">Escolha 2 ou 3 simulações para ver lado a lado. Em verde, o melhor; em vermelho, o pior.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-5 overflow-y-auto">
          <ul className="flex flex-col gap-1.5">
            {candidates.map((d) => {
              const on = selected.includes(d.id);
              const disabled = !on && selected.length >= MAX_SELECTED;
              return (
                <li key={d.id}>
                  <label className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 ${on ? 'border-gray-900' : 'border-gray-100'} ${disabled ? 'opacity-40' : ''}`}>
                    <input type="checkbox" checked={on} disabled={disabled} onChange={() => toggle(d.id)} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-gray-900 truncate">{d.title}</span>
                      <span className="block text-[11px] text-gray-400">
                        {CATEGORY_META[d.category].short} · {saved.some((s) => s.id === d.id) ? 'salva' : 'aba aberta (não salva)'}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          {chosen.length < 2 ? (
            <p className="text-xs text-gray-400">Selecione ao menos 2 simulações para comparar.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse" data-testid="compare-table">
                <thead>
                  <tr>
                    <th className="text-left text-xs font-semibold text-gray-400 py-2 pr-3" />
                    {chosen.map((d) => (
                      <th key={d.id} className="text-left align-bottom py-2 px-3 min-w-[150px]">
                        <span className="block text-xs font-bold text-gray-900 truncate max-w-[200px]">{d.title}</span>
                        {d.id === bestId && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 size={12} strokeWidth={1.5} /> Mais lucrativo
                          </span>
                        )}
                        {d.id === riskId && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 dark:text-red-400">
                            <AlertTriangle size={12} strokeWidth={1.5} /> Maior risco
                          </span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((row) => (
                    <tr key={row.key} className="border-t border-gray-100">
                      <td className="py-2.5 pr-3 text-xs text-gray-500">{row.label}</td>
                      {chosen.map((d) => {
                        const v = metrics.find((x) => x.id === d.id)?.m?.[row.key];
                        return (
                          <td key={d.id} className={`py-2.5 px-3 font-mono ${v == null ? 'text-gray-300' : cellTone(row, d.id) || 'text-gray-900'}`}>
                            {v == null ? '—' : row.format(v)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] text-gray-400 mt-2">
                "—" significa que aquela métrica não existe naquele tipo de simulação (ex.: ponto de equilíbrio só aparece em simulações de equilíbrio).
              </p>

              <div className="flex gap-2 mt-4">
                <input
                  value={name}
                  maxLength={60}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nome para guardar esta comparação"
                  className="flex-1 min-w-0 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none"
                />
                <button
                  type="button"
                  onClick={() => void handleSaveScenario()}
                  className="flex items-center gap-1.5 bg-gray-900 text-white rounded-xl px-4 py-2.5 text-sm font-semibold"
                >
                  <Save size={14} strokeWidth={1.5} />
                  {justSaved ? 'Guardada' : 'Guardar'}
                </button>
              </div>
            </div>
          )}

          {scenarios.length > 0 && (
            <div className="border-t border-gray-100 pt-4">
              <h3 className="text-xs font-bold text-gray-800 mb-2">Comparações guardadas</h3>
              <ul className="flex flex-col gap-1.5">
                {scenarios.map((s) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelected(s.drafts.map((d) => d.id).filter((id) => candidates.some((c) => c.id === id)).slice(0, MAX_SELECTED))}
                      className="flex-1 min-w-0 text-left rounded-xl border border-gray-100 px-3.5 py-2 hover:bg-gray-50"
                    >
                      <span className="block text-sm text-gray-900 truncate">{s.name}</span>
                      <span className="block text-[11px] text-gray-400">{s.drafts.map((d) => d.title).join(' · ')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeScenario(s.id)}
                      aria-label={`Excluir comparação ${s.name}`}
                      className="p-2 rounded-lg bg-red-50 hover:bg-red-100"
                    >
                      <Trash2 size={14} strokeWidth={1.5} className="text-red-500" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
