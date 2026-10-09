import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, TrendingUp, X } from 'lucide-react';
import { fetchAnalytics } from '../../lib/admin-api';
import { payloadFromProduct, payloadFromSummary, uniqueProducts } from '../../lib/calculator/calculatorAnalytics';
import { formatBRL } from '../../lib/calculator/calculatorFormat';
import { useManagerCalculator } from '../../contexts/ManagerCalculatorContext';
import type { Analytics } from '../../types/analytics';

// Seletor de dados reais (mês atual) vindos da aba Análise: 1 clique cria uma simulação já preenchida.
export function QuickFillFromAnalytics({ onClose }: { onClose: () => void }) {
  const { openCalculatorWithData } = useManagerCalculator();
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchAnalytics({ period: 'mes' }, ctrl.signal)
      .then(setData)
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        void err;
        setError('Não foi possível carregar os dados da Análise agora. Tente de novo em instantes.');
      });
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const products = useMemo(() => (data ? uniqueProducts(data) : []), [data]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products;
  }, [products, query]);

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Importar da Análise" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <TrendingUp size={16} strokeWidth={1.5} />
              Importar da Análise
            </h2>
            <p className="text-xs text-gray-400 mt-1">Dados reais do mês atual. A simulação abre em uma nova aba, já preenchida.</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-3 overflow-y-auto">
          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          {!data && !error && <p className="text-xs text-gray-400">Carregando dados da Análise...</p>}

          {data && (
            <>
              <button
                type="button"
                onClick={() => {
                  openCalculatorWithData(payloadFromSummary(data));
                  onClose();
                }}
                className="text-left rounded-xl border border-gray-200 px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <span className="block text-sm font-semibold text-gray-900">Resumo do mês (ponto de equilíbrio)</span>
                <span className="block text-xs text-gray-400 mt-0.5">
                  Faturamento bruto {formatBRL(data.kpis.grossRevenue)}. Usa o CMV, os impostos e as taxas reais do período.
                </span>
              </button>

              <div className="relative">
                <Search size={14} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar prato ou produto"
                  className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none"
                />
              </div>

              {filtered.length === 0 ? (
                <p className="text-xs text-gray-400">{products.length === 0 ? 'Ainda não há vendas neste mês para importar.' : 'Nenhum item encontrado.'}</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {filtered.map((item) => (
                    <li key={item.productId}>
                      <button
                        type="button"
                        onClick={() => {
                          openCalculatorWithData(payloadFromProduct(item, data.params));
                          onClose();
                        }}
                        className="w-full text-left rounded-xl border border-gray-100 px-4 py-2.5 hover:bg-gray-50 transition-colors flex items-center justify-between gap-3"
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-gray-900 truncate">{item.name}</span>
                          <span className="block text-[11px] text-gray-400">
                            Preço {formatBRL(item.unitPrice)} · custo {formatBRL(item.unitCost)} ({item.costSource}) · {item.units} un
                          </span>
                        </span>
                        <span className="shrink-0 text-xs font-semibold text-gray-500">Simular</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
