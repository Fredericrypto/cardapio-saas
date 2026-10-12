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
import { MENU_TEXT, MENU_TEXT_BODY, MENU_TEXT_MUTED } from '../lib/menuTheme';
import { PROFILE_CARD, PROFILE_CARD_GLASS, PROFILE_OPTION_CARD, PROFILE_SELECTED_RING } from '../lib/profileTheme';

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
      <div className="flex flex-col gap-4">
        {/* Grade de cartões: bandeira em destaque, nome nativo, código do
            idioma e o selo "Atual" no idioma em uso. */}
        <div
          className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4"
          role="radiogroup"
          aria-label={t('language.title')}
        >
          {LANGUAGE_OPTIONS.map((option) => {
            const selected = option.code === language;
            return (
              <Tooltip key={option.code} label={option.nativeName} className="flex w-full">
                <button
                  role="radio"
                  aria-checked={selected}
                  disabled={isSwitching}
                  onClick={() => (selected ? undefined : setCandidate(option.code))}
                  className={`relative w-full ${PROFILE_CARD} ${PROFILE_OPTION_CARD} p-4 md:p-5 flex items-center gap-4 ${
                    selected ? PROFILE_SELECTED_RING : ''
                  }`}
                  style={selected ? { borderColor: tenant.primaryColor } : undefined}
                >
                  <LanguageFlag flag={option.flag} size={44} />
                  <span className="flex-1 min-w-0">
                    <span className={`block text-sm md:text-base font-semibold ${MENU_TEXT} truncate`}>{option.nativeName}</span>
                    <span className={`block text-[11px] uppercase tracking-wide ${MENU_TEXT_MUTED} mt-0.5`}>{option.code}</span>
                  </span>
                  {selected && (
                    <span
                      className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border shrink-0 text-[#111827] dark:text-[#E3E2E6]"
                      style={{ backgroundColor: `${tenant.primaryColor}1A`, borderColor: `${tenant.primaryColor}66` }}
                    >
                      <Check size={14} strokeWidth={1.5} />
                      {t('common.current')}
                    </span>
                  )}
                </button>
              </Tooltip>
            );
          })}
        </div>

        <div className={`${PROFILE_CARD_GLASS} flex items-start gap-3 p-4 md:p-5`}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-black/5 dark:bg-white/10">
            <Info size={17} strokeWidth={1.5} className={MENU_TEXT} />
          </div>
          <p className={`text-xs md:text-sm leading-relaxed ${MENU_TEXT_BODY} pt-1`}>{t('language.notice')}</p>
        </div>
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
