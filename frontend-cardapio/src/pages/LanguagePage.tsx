import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Info } from 'lucide-react';
import { useTenant } from '../contexts/TenantContext';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useLanguageSwitch } from '../contexts/LanguageSwitchContext';
import { useI18n } from '../i18n/I18nContext';
import { LANGUAGE_OPTIONS, type AppLanguage } from '../i18n/languages';
import { ConfirmModal } from '../components/ConfirmModal';
import { LanguageFlag } from '../components/LanguageFlags';
import { BottomNav } from '../components/BottomNav';
import { getActiveMesaToken } from '../lib/seat';

// Perfil do cliente -> Idiomas. Escolher uma opção abre a confirmação; ao
// confirmar, o LanguageSwitchProvider cuida da splash, da persistência
// (localStorage + perfil na API) e do redirecionamento.
export function LanguagePage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const { token } = useCustomerAuth();
  const { language, t } = useI18n();
  const { switchLanguage, isSwitching } = useLanguageSwitch();
  const [candidate, setCandidate] = useState<AppLanguage | null>(null);

  if (!tenant || !slug) return null;
  const candidateName = LANGUAGE_OPTIONS.find((o) => o.code === candidate)?.nativeName ?? '';
  const activeMesaToken = getActiveMesaToken(token, slug) ?? undefined;

  return (
    <div className="min-h-screen bg-gray-50 pb-24 max-w-md mx-auto">
      <div className="flex items-center gap-3 px-4 py-4 bg-white border-b border-gray-100">
        <button onClick={() => navigate(`/${slug}/conta-cliente/perfil`)} aria-label={t('common.back')}>
          <ArrowLeft size={20} strokeWidth={1.5} />
        </button>
        <h1 className="font-display font-bold text-lg">{t('language.title')}</h1>
      </div>

      <div className="px-4 mt-4 flex flex-col gap-3">
        <div className="bg-white rounded-2xl overflow-hidden" role="radiogroup" aria-label={t('language.title')}>
          {LANGUAGE_OPTIONS.map((option, index) => {
            const selected = option.code === language;
            return (
              <button
                key={option.code}
                role="radio"
                aria-checked={selected}
                disabled={isSwitching}
                onClick={() => (selected ? undefined : setCandidate(option.code))}
                className={`w-full flex items-center gap-3 px-4 py-3.5 text-left disabled:opacity-60 ${
                  index > 0 ? 'border-t border-gray-50' : ''
                }`}
              >
                <LanguageFlag flag={option.flag} size={30} />
                <span className="flex-1 text-sm font-medium text-gray-800">{option.nativeName}</span>
                {selected && (
                  <span
                    className="flex items-center gap-1 text-[11px] font-semibold"
                    style={{ color: tenant.primaryColor }}
                  >
                    <Check size={16} strokeWidth={1.5} />
                    {t('common.current')}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-gray-400 px-1">
          <Info size={14} strokeWidth={1.5} className="shrink-0 mt-px" />
          <span>{t('language.notice')}</span>
        </p>
      </div>

      {candidate && (
        <ConfirmModal
          message={t('language.confirmMessage', { language: candidateName })}
          confirmLabel={t('language.confirmAction')}
          onConfirm={() => {
            const next = candidate;
            setCandidate(null);
            switchLanguage(next);
          }}
          onCancel={() => setCandidate(null)}
        />
      )}

      <BottomNav slug={slug} qrCodeToken={activeMesaToken} tenantId={tenant.id} primaryColor={tenant.primaryColor} />
    </div>
  );
}
