import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, Info } from 'lucide-react';
import { useTenant } from '../contexts/TenantContext';
import { useLanguageSwitch } from '../contexts/LanguageSwitchContext';
import { useI18n } from '../i18n/I18nContext';
import { LANGUAGE_OPTIONS, type AppLanguage } from '../i18n/languages';
import { ConfirmModal } from '../components/ConfirmModal';
import { LanguageFlag } from '../components/LanguageFlags';
import { ProfileSubpageShell } from '../components/ProfileSubpageShell';
import { Tooltip } from '../components/Tooltip';
import { MENU_BORDER, MENU_TEXT, MENU_TEXT_MUTED } from '../lib/menuTheme';
import { PROFILE_CARD } from '../lib/profileTheme';

// Perfil do cliente -> Idiomas. Escolher uma opção abre a confirmação; ao
// confirmar, o LanguageSwitchProvider cuida da splash, da persistência
// (localStorage + perfil na API) e do redirecionamento.
export function LanguagePage() {
  const { slug } = useParams<{ slug: string }>();
  const { tenant } = useTenant();
  const { language, t } = useI18n();
  const { switchLanguage, isSwitching } = useLanguageSwitch();
  const [candidate, setCandidate] = useState<AppLanguage | null>(null);

  if (!tenant || !slug) return null;
  const candidateName = LANGUAGE_OPTIONS.find((o) => o.code === candidate)?.nativeName ?? '';

  return (
    <ProfileSubpageShell
      tenant={tenant}
      title={t('language.title')}
      backTo={`/${slug}/conta-cliente/perfil`}
      bottomNav
    >
      <div className="max-w-2xl flex flex-col gap-3">
        <div className={`${PROFILE_CARD} overflow-hidden`} role="radiogroup" aria-label={t('language.title')}>
          {LANGUAGE_OPTIONS.map((option, index) => {
            const selected = option.code === language;
            return (
              <Tooltip key={option.code} label={option.nativeName} className="flex w-full">
                <button
                  role="radio"
                  aria-checked={selected}
                  disabled={isSwitching}
                  onClick={() => (selected ? undefined : setCandidate(option.code))}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 md:px-5 text-left disabled:opacity-60 md:hover:bg-black/[0.03] dark:md:hover:bg-white/5 md:transition-colors ${
                    index > 0 ? `border-t ${MENU_BORDER}` : ''
                  }`}
                >
                  <LanguageFlag flag={option.flag} size={30} />
                  <span className={`flex-1 text-sm font-medium ${MENU_TEXT}`}>{option.nativeName}</span>
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
              </Tooltip>
            );
          })}
        </div>

        <p className={`flex items-start gap-2 text-[11px] leading-relaxed ${MENU_TEXT_MUTED} px-1`}>
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
    </ProfileSubpageShell>
  );
}
