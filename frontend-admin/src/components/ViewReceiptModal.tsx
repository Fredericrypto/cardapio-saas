import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { fetchSessionSummary } from '../lib/admin-api';
import { useAuth } from '../contexts/AuthContext';
import { ReceiptContent } from './ReceiptContent';
import type { TableSession, SessionSummary } from '../types';

interface ViewReceiptModalProps {
  session: TableSession;
  onClose: () => void;
}

// Permite ver/imprimir o cupom a qualquer momento, mesmo com a conta ainda
// aberta (ex: cliente pede uma "conferência parcial" no meio da refeição).
export function ViewReceiptModal({ session, onClose }: ViewReceiptModalProps) {
  const { tenant } = useAuth();
  const [summary, setSummary] = useState<SessionSummary | null>(null);

  useEffect(() => {
    fetchSessionSummary(session.id).then(setSummary);
  }, [session.id]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm flex flex-col gap-3">
        <p className="font-display font-bold text-gray-900 text-center">
          Cupom — {session.table?.number ?? 'mesa'}
        </p>

        {!summary || !tenant ? (
          <p className="text-sm text-gray-400 py-8 text-center">Carregando...</p>
        ) : (
          <div id="receipt-print-area" className="border border-gray-100 rounded-lg p-4 bg-gray-50">
            <ReceiptContent tenant={tenant} summary={summary} />
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
            disabled={!summary}
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
