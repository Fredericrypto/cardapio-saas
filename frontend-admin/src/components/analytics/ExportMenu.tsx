import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, FileSpreadsheet } from 'lucide-react';
import type { Analytics } from '../../types/analytics';
import { exportAnalyticsCsv, exportAnalyticsXlsx } from '../../lib/analyticsExport';

export function ExportMenu({ data, disabled }: { data: Analytics | null; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  async function run(fn: () => Promise<void> | void) {
    if (!data) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  const items: { label: string; hint: string; action: () => Promise<void> | void }[] = data
    ? [
        { label: 'Relatório analítico (XLSX)', hint: 'Várias abas · Excel, Sheets, LibreOffice', action: () => exportAnalyticsXlsx(data) },
        { label: 'Relatório analítico (CSV)', hint: 'UTF-8 · separador ";" · padrão pt-BR', action: () => exportAnalyticsCsv(data) },
        { label: 'Resumo executivo / DRE (XLSX)', hint: 'DRE simplificado numa planilha', action: () => exportAnalyticsXlsx(data, 'DRE') },
        { label: 'Resumo executivo / DRE (CSV)', hint: 'DRE simplificado em texto', action: () => exportAnalyticsCsv(data, 'DRE') },
      ]
    : [];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || !data || busy}
        className="flex items-center gap-1.5 bg-gray-900 text-white text-xs font-semibold rounded-lg px-3.5 py-2 disabled:opacity-40"
      >
        <Download size={14} />
        {busy ? 'Gerando...' : 'Exportar Relatório Analítico'}
        <ChevronDown size={13} />
      </button>
      {open && (
        <div className="absolute right-0 mt-1.5 w-72 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
          {items.map((it) => (
            <button
              key={it.label}
              onClick={() => void run(it.action)}
              className="w-full text-left px-3.5 py-2.5 hover:bg-gray-50 flex items-start gap-2.5"
            >
              <FileSpreadsheet size={16} className="text-gray-400 mt-0.5 shrink-0" />
              <span>
                <span className="block text-xs font-semibold text-gray-800">{it.label}</span>
                <span className="block text-[11px] text-gray-400">{it.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
