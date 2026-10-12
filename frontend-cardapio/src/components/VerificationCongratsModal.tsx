import { useI18n } from '../i18n/I18nContext';
import { useScrollLock } from '../hooks/useScrollLock';
import { VerifiedBadge } from './VerifiedBadge';
import { Tooltip } from './Tooltip';
import { MENU_SURFACE, MENU_BORDER, MENU_TEXT, MENU_TEXT_BODY } from '../lib/menuTheme';

interface VerificationCongratsModalProps {
  primaryColor: string;
  onClose: () => void;
}

// Mostrado UMA vez, na próxima abertura do app depois da aprovação —
// controlado pelo campo `verificationCongratsPending` do perfil (some
// pra sempre assim que `onClose` chama o endpoint de "já vi").
export function VerificationCongratsModal({ primaryColor, onClose }: VerificationCongratsModalProps) {
  const { t } = useI18n();
  // Com o modal aberto a página atrás NÃO rola (02/10).
  useScrollLock(true);
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className={`${MENU_SURFACE} border ${MENU_BORDER} rounded-2xl w-full max-w-sm p-6 text-center shadow-xl`}>
        <div className="flex justify-center mb-4">
          <VerifiedBadge variant="icon" size={56} />
        </div>
        <h2 className={`font-display font-bold text-lg ${MENU_TEXT} mb-1.5`}>
          {t('verificationCongratsModal.voce_foi_verificado')}
        </h2>
        <p className={`text-sm ${MENU_TEXT_BODY} mb-6`}>
          {t('verificationCongratsModal.seu_perfil_agora_tem')}
        </p>
        <Tooltip label={t('verificationCongratsModal.legal')} className="flex w-full">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl text-white text-sm font-semibold"
            style={{ backgroundColor: primaryColor }}
          >
            {t('verificationCongratsModal.legal')}
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
