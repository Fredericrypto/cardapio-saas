import { createPortal } from 'react-dom';
import { useI18n } from '../../i18n/I18nContext';
import { CART_OUTLINE_BUTTON, CART_TEXT, CART_TEXT_BODY } from '../../lib/cartTheme';
import { MENU_DIVIDER, MENU_SURFACE } from '../../lib/menuTheme';
import { Tooltip } from '../Tooltip';

interface RemoveItemModalProps {
  productName: string | undefined;
  primaryColor: string;
  onCancel: () => void;
  onConfirm: () => void;
}

// Modal "Remover item?" — mesmo tema do Menu (claro/escuro). A trava de
// rolagem da página continua sendo do CartPage (useScrollLock), como antes.
// Portal no body + z-50: fica acima da BottomNav (z-40) e das barras fixas.
export function RemoveItemModal({ productName, primaryColor, onCancel, onConfirm }: RemoveItemModalProps) {
  const { t } = useI18n();
  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center md:items-center md:px-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('cartPage.remover_item')}
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-md md:max-w-sm rounded-t-2xl md:rounded-2xl border p-5 flex flex-col gap-4 shadow-xl pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] md:pb-5 ${MENU_SURFACE} ${MENU_DIVIDER}`}
      >
        <div>
          <p className={`font-semibold ${CART_TEXT}`}>{t('cartPage.remover_item')}</p>
          <p className={`text-sm mt-1 ${CART_TEXT_BODY}`}>
            {productName} {t('cartPage.sera_removido_do_seu')}
          </p>
        </div>
        <div className="flex gap-3">
          <Tooltip label={t('common.cancel')} className="flex flex-1">
            <button type="button" onClick={onCancel} aria-label={t('common.cancel')} className={CART_OUTLINE_BUTTON}>
              {t('common.cancel')}
            </button>
          </Tooltip>
          <Tooltip label={t('cartPage.remover')} className="flex flex-1">
            <button
              type="button"
              onClick={onConfirm}
              aria-label={t('cartPage.remover')}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white ring-1 ring-black/5 dark:ring-white/15"
              style={{ backgroundColor: primaryColor }}
            >
              {t('cartPage.remover')}
            </button>
          </Tooltip>
        </div>
      </div>
    </div>,
    document.body,
  );
}
