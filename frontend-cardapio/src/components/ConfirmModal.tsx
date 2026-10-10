import { useI18n } from '../i18n/I18nContext';
import { createPortal } from 'react-dom';
import { useScrollLock } from '../hooks/useScrollLock';

// Modal de confirmação no padrão do app (fundo escurecido, cartão branco
// arredondado, botão principal + "Cancelar"). Usado em "Sair da conta" e
// "Sair da mesa". Trava a rolagem da página enquanto aberto.
export function ConfirmModal({
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useScrollLock(true);
  const { t } = useI18n();
  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-6"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl p-5 max-w-xs w-full flex flex-col gap-4 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-gray-700">{message}</p>
        <div className="flex flex-col gap-2">
          <button
            onClick={onConfirm}
            className={`py-2.5 rounded-xl text-white text-sm font-semibold ${
              destructive ? 'bg-red-600' : 'bg-gray-900'
            }`}
          >
            {confirmLabel}
          </button>
          <button
            onClick={onCancel}
            className="py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600"
          >
            {cancelLabel ?? t('common.cancel')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
