import { useI18n } from '../i18n/I18nContext';
import { createPortal } from 'react-dom';
import { useScrollLock } from '../hooks/useScrollLock';
import { Tooltip } from './Tooltip';
import { MENU_SURFACE, MENU_DIVIDER, MENU_TEXT_SOFT } from '../lib/menuTheme';

// Modal de confirmação no padrão do app: overlay escurecido, cartão na
// superfície do tema (claro: branco / escuro: #1E1E20 com borda white/10),
// botão principal sólido + "Cancelar". Usado em "Sair da conta" e "Sair da
// mesa". Trava a rolagem da página enquanto aberto.
//
// Contraste do botão principal (hex explícito nos dois modos — nunca
// `bg-gray-900`, que o tema global pode remapear e deixar texto claro sobre
// fundo claro):
// - claro:  fundo #111827, texto branco
// - escuro: fundo #E3E2E6, texto #131314
// - destrutivo: vermelho sólido com texto branco, igual nos dois modos
const CONFIRM_CLASS =
  'glass-btn';
const CONFIRM_DESTRUCTIVE_CLASS = 'bg-[#DC2626] hover:bg-[#B91C1C] text-white';
const CANCEL_CLASS =
  'border border-[#E5E7EB] dark:border-white/10 text-[#4B5563] dark:text-[#C4C7C5] hover:bg-[#F9FAFB] dark:hover:bg-white/10';
const FOCUS_CLASS =
  'outline-none focus-visible:ring-2 focus-visible:ring-black/20 dark:focus-visible:ring-white/30';

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
  const resolvedCancelLabel = cancelLabel ?? t('common.cancel');
  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/40 dark:bg-black/60 md:backdrop-blur-sm flex items-center justify-center px-6"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`${MENU_SURFACE} border ${MENU_DIVIDER} rounded-2xl p-5 md:p-6 max-w-xs md:max-w-sm w-full flex flex-col gap-4 text-center shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <p className={`text-sm ${MENU_TEXT_SOFT}`}>{message}</p>
        <div className="flex flex-col gap-2">
          <Tooltip label={confirmLabel} className="flex">
            <button
              onClick={onConfirm}
              className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${FOCUS_CLASS} ${
                destructive ? CONFIRM_DESTRUCTIVE_CLASS : CONFIRM_CLASS
              }`}
            >
              {confirmLabel}
            </button>
          </Tooltip>
          <Tooltip label={resolvedCancelLabel} className="flex">
            <button
              onClick={onCancel}
              className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${CANCEL_CLASS} ${FOCUS_CLASS}`}
            >
              {resolvedCancelLabel}
            </button>
          </Tooltip>
        </div>
      </div>
    </div>,
    document.body,
  );
}
