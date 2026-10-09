import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Diálogo de confirmação do módulo (Esc cancela). Fica acima dos outros modais.
export function ConfirmDialog({ title, message, confirmLabel, destructive = true, onConfirm, onCancel }: ConfirmDialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onCancel();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="calc-confirm-title"
      onClick={onCancel}
    >
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 shrink-0 rounded-xl bg-red-50 flex items-center justify-center text-red-500">
            <AlertTriangle size={18} strokeWidth={1.5} />
          </span>
          <div>
            <h2 id="calc-confirm-title" className="text-sm font-bold text-gray-900">
              {title}
            </h2>
            <p className="text-xs text-gray-500 mt-1">{message}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold text-white ${destructive ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-900'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
