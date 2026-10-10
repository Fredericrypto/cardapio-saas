import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, FileSpreadsheet, FileText } from 'lucide-react';
import type { Analytics } from '../../types/analytics';
import { exportAnalyticsCsv, exportAnalyticsXlsx } from '../../lib/analyticsExport';
import { downloadBytes } from '../../lib/downloadFile';
import { loadLogoForPdf } from '../../lib/pdfLogo';
import { useAuth } from '../../contexts/AuthContext';

// Relatório executivo em PDF: cabeçalho com logo/período/data, KPIs e os
// gráficos desenhados em vetor (ver lib/analyticsPdf.ts). A biblioteca de PDF é
// carregada só no clique, para não pesar no carregamento do painel.
async function exportAnalyticsPdf(
  data: Analytics,
  tenant: { name: string; slug: string; logoUrl: string | null; primaryColor: string } | null,
  locationName: string | null,
): Promise<void> {
  const [{ buildAnalyticsPdf, pdfFileName }, logo] = await Promise.all([
    import('../../lib/analyticsPdf'),
    loadLogoForPdf(tenant?.logoUrl),
  ]);
  const bytes = await buildAnalyticsPdf({
    data,
    establishmentName: tenant?.name ?? 'Estabelecimento',
    locationName,
    logo,
    accentHex: tenant?.primaryColor ?? '#18181B',
    generatedAt: new Date(),
  });
  downloadBytes(bytes, pdfFileName(tenant?.slug ?? 'relatorio', data.range), 'application/pdf');
}

export function ExportMenu({
  data,
  disabled,
  locationName = null,
}: {
  data: Analytics | null;
  disabled: boolean;
  // Nome da loja filtrada na tela (null = todas) — sai no cabeçalho do PDF.
  locationName?: string | null;
}) {
  const { tenant } = useAuth();
  const [error, setError] = useState<string | null>(null);
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
    setError(null);
    try {
      await fn();
    } catch {
      setError('Não foi possível gerar o arquivo. Tente de novo.');
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  const items: { label: string; hint: string; action: () => Promise<void> | void; icon?: 'pdf' }[] = data
    ? [
        { label: 'Relatório executivo com gráficos (PDF)', hint: 'A4 · logo, período, KPIs e gráficos', action: () => exportAnalyticsPdf(data, tenant, locationName), icon: 'pdf' },
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
        {busy ? 'Gerando...' : 'Exportar Análise'}
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
              {it.icon === 'pdf' ? (
                <FileText size={16} strokeWidth={1.5} className="text-gray-400 mt-0.5 shrink-0" />
              ) : (
                <FileSpreadsheet size={16} strokeWidth={1.5} className="text-gray-400 mt-0.5 shrink-0" />
              )}
              <span>
                <span className="block text-xs font-semibold text-gray-800">{it.label}</span>
                <span className="block text-[11px] text-gray-400">{it.hint}</span>
              </span>
            </button>
          ))}
          {error && <p className="px-3.5 py-2 text-[11px] text-red-500 border-t border-gray-100">{error}</p>}
        </div>
      )}
    </div>
  );
}
