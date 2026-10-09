import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Copy, Download, FileSpreadsheet, Printer, Save, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useManagerCalculator } from '../../contexts/ManagerCalculatorContext';
import type { Evaluation } from '../../lib/calculator/calculatorMath';
import { formatDateTime } from '../../lib/calculator/calculatorFormat';
import { CATEGORY_META } from '../../lib/calculator/calculatorMeta';
import {
  buildCsv,
  buildJson,
  buildSummaryText,
  downloadTextFile,
  printReport,
  slugifyFileName,
} from '../../lib/calculator/calculatorReport';

type Flash = 'saved' | 'copied' | null;

const ITEM = 'w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-xs font-semibold text-gray-700 hover:bg-gray-50 rounded-lg';

// Salvar a simulação (histórico), exportar (PDF/CSV/JSON), copiar resumo e abrir o histórico.
export function SaveAndExportMenu({ evaluation }: { evaluation: Evaluation }) {
  const { tenant } = useAuth();
  const { activeDraft, saved, saveActiveDraft, openSavedAsNewDraft, removeSaved } = useManagerCalculator();
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState<Flash>(null);
  const timer = useRef<number | undefined>(undefined);
  const storeName = tenant?.name ?? 'Restaurante';

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function show(next: Flash) {
    setFlash(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setFlash(null), 2000);
  }

  const fileBase = slugifyFileName(activeDraft.title);

  async function handleSave() {
    await saveActiveDraft();
    show('saved');
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(buildSummaryText(activeDraft, evaluation, storeName));
      show('copied');
    } catch {
      /* sem permissão de área de transferência */
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
      >
        <Save size={14} strokeWidth={1.5} />
        Salvar e exportar
        <ChevronDown size={14} strokeWidth={1.5} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 top-full mt-2 z-40 w-72 rounded-2xl border border-gray-100 bg-white p-1.5 shadow-lg">
            <button type="button" role="menuitem" className={ITEM} onClick={() => void handleSave()}>
              {flash === 'saved' ? <Check size={14} strokeWidth={1.5} /> : <Save size={14} strokeWidth={1.5} />}
              {flash === 'saved' ? 'Simulação salva' : 'Salvar simulação no histórico'}
            </button>
            <button type="button" role="menuitem" className={ITEM} onClick={() => void handleCopy()}>
              {flash === 'copied' ? <Check size={14} strokeWidth={1.5} /> : <Copy size={14} strokeWidth={1.5} />}
              {flash === 'copied' ? 'Resumo copiado' : 'Copiar resumo (WhatsApp)'}
            </button>
            <button
              type="button"
              role="menuitem"
              className={ITEM}
              onClick={() => {
                setOpen(false);
                printReport({ draft: activeDraft, evaluation, storeName, logoUrl: tenant?.logoUrl ?? null });
              }}
            >
              <Printer size={14} strokeWidth={1.5} />
              Exportar PDF (imprimir / salvar como PDF)
            </button>
            <button
              type="button"
              role="menuitem"
              className={ITEM}
              onClick={() => downloadTextFile(`${fileBase}.csv`, buildCsv(activeDraft, evaluation, storeName), 'text/csv')}
            >
              <FileSpreadsheet size={14} strokeWidth={1.5} />
              Exportar CSV (Excel / Sheets)
            </button>
            <button
              type="button"
              role="menuitem"
              className={ITEM}
              onClick={() => downloadTextFile(`${fileBase}.json`, buildJson(activeDraft, evaluation, storeName), 'application/json')}
            >
              <Download size={14} strokeWidth={1.5} />
              Exportar JSON
            </button>

            <div className="mt-1.5 border-t border-gray-100 pt-1.5">
              <p className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">Histórico salvo</p>
              {saved.length === 0 ? (
                <p className="px-3 pb-2 text-[11px] text-gray-400">Nenhuma simulação salva ainda.</p>
              ) : (
                <ul className="max-h-56 overflow-y-auto">
                  {saved.map((s) => (
                    <li key={s.id} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          openSavedAsNewDraft(s);
                          setOpen(false);
                        }}
                        className="flex-1 min-w-0 text-left px-3 py-2 rounded-lg hover:bg-gray-50"
                      >
                        <span className="block text-xs font-semibold text-gray-800 truncate">{s.title}</span>
                        <span className="block text-[11px] text-gray-400">
                          {CATEGORY_META[s.category].short} · {formatDateTime(s.updatedAt)}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeSaved(s.id)}
                        aria-label={`Excluir ${s.title} do histórico`}
                        className="p-2 rounded-lg hover:bg-red-50"
                      >
                        <Trash2 size={14} strokeWidth={1.5} className="text-red-500" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
