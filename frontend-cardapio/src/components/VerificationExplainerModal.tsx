import { useI18n } from '../i18n/I18nContext';
import { useScrollLock } from '../hooks/useScrollLock';
import { ShieldCheck } from 'lucide-react';
import { Tooltip } from './Tooltip';
import { MENU_SURFACE, MENU_BORDER, MENU_TEXT, MENU_TEXT_BODY } from '../lib/menuTheme';
import { PROFILE_BTN_OUTLINE } from '../lib/profileTheme';

interface VerificationExplainerModalProps {
  primaryColor: string;
  onCancel: () => void;
  onContinue: () => void;
}

// Texto curto, direto, sem jargão — pedido explícito do Felipe: já deixa
// claro ANTES de tirar a foto que (1) a decisão é do estabelecimento,
// (2) pode ser recusada por motivos específicos, e (3) a foto precisa
// ser honesta e clara ("sem gracinhas", nas palavras dele).
export function VerificationExplainerModal({
  primaryColor,
  onCancel,
  onContinue,
}: VerificationExplainerModalProps) {
  const { t } = useI18n();
  // Com o modal aberto a página atrás NÃO rola (02/10).
  useScrollLock(true);
  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
      <div className={`${MENU_SURFACE} border ${MENU_BORDER} rounded-2xl w-full max-w-sm p-6 shadow-xl`}>
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
          style={{ backgroundColor: `${primaryColor}1A` }}
        >
          <ShieldCheck size={22} strokeWidth={1.5} style={{ color: primaryColor }} />
        </div>
        <h2 className={`font-display font-bold text-lg ${MENU_TEXT} mb-2`}>
          {t('verificationExplainerModal.como_funciona_a_verificacao')}
        </h2>
        <ul className={`flex flex-col gap-2.5 text-sm ${MENU_TEXT_BODY} mb-5`}>
          <li>{t('verificationExplainerModal.voce_vai_tirar_uma')}</li>
          <li>
            {t('verificationExplainerModal.a_decisao_de_aprovar')} <strong>estabelecimento</strong> {t('verificationExplainerModal.ele_pode_recusar_por')}
          </li>
          <li>{t('verificationExplainerModal.se_for_recusada_voce')}</li>
          <li>{t('verificationExplainerModal.a_foto_enviada_e')}</li>
          <li className={`font-medium ${MENU_TEXT}`}>
            {t('verificationExplainerModal.tire_uma_foto_sua')}
          </li>
        </ul>
        <div className="flex gap-2">
          <Tooltip label={t('reviewModal.agora_nao')} className="flex flex-1">
            <button
              onClick={onCancel}
              className={`w-full py-3 rounded-xl text-sm font-semibold ${PROFILE_BTN_OUTLINE}`}
            >
              {t('reviewModal.agora_nao')}
            </button>
          </Tooltip>
          <Tooltip label={t('verificationExplainerModal.entendi_continuar')} className="flex flex-1">
            <button
              onClick={onContinue}
              className="w-full py-3 rounded-xl text-white text-sm font-semibold"
              style={{ backgroundColor: primaryColor }}
            >
              {t('verificationExplainerModal.entendi_continuar')}
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
