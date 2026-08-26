import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { fetchSessionSummary } from '../lib/admin-api';
import { useAuth } from '../contexts/AuthContext';
import { ReceiptContent } from './ReceiptContent';
import { ReceiptContentStandalone } from './ReceiptContentStandalone';
import type { HistorySessionEntry, HistoryOrderEntry, SessionSummary } from '../types';

type HistoryReceiptTarget =
  | { kind: 'mesa'; entry: HistorySessionEntry }
  | { kind: 'avulso'; entry: HistoryOrderEntry };

interface HistoryReceiptModalProps {
  target: HistoryReceiptTarget;
  onClose: () => void;
}

// Reaproveita o mesmo modal/cupom usado no painel (ReceiptContent) pra
// mesas — busca o resumo fresco pelo id da sessão. Pedidos avulsos não
// têm "sessão", então usam o ReceiptContentStandalone com os dados que
// já vieram no próprio item do histórico (sem precisar de outra chamada).
export function HistoryReceiptModal({ target, onClose }: HistoryReceiptModalProps) {
  const { tenant } = useAuth();
  const [summary, setSummary] = useState<SessionSummary | null>(null);

  useEffect(() => {
    if (target.kind === 'mesa') {
      fetchSessionSummary(target.entry.sessionId).then(setSummary);
    }
  }, [target]);

  const title =
    target.kind === 'mesa'
      ? `Cupom — ${target.entry.tableNumber ?? 'mesa'}`
      : `Cupom — ${target.entry.orderType === 'entrega' ? 'Entrega' : 'Balcão'}`;

  const isReady = target.kind === 'avulso' || (target.kind === 'mesa' && summary && tenant);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm flex flex-col gap-3">
        <p className="font-display font-bold text-gray-900 text-center">{title}</p>

        {!isReady || !tenant ? (
          <p className="text-sm text-gray-400 py-8 text-center">Carregando...</p>
        ) : (
          <div id="receipt-print-area" className="border border-gray-100 rounded-lg p-4 bg-gray-50">
            {target.kind === 'mesa' && summary ? (
              <ReceiptContent tenant={tenant} summary={summary} />
            ) : target.kind === 'avulso' ? (
              <ReceiptContentStandalone tenant={tenant} order={target.entry} />
            ) : null}
          </div>
        )}

        <div className="flex gap-2 mt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600"
          >
            Fechar
          </button>
          <button
            onClick={() => window.print()}
            disabled={!isReady}
            className="flex-1 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60"
          >
            <Printer size={15} />
            Imprimir
          </button>
        </div>
      </div>
    </div>
  );
}
