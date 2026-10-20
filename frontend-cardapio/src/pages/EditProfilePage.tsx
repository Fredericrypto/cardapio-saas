import { BrandLoader } from '../components/BrandLoader';
import { genderLabel } from '../i18n/labels';
import { formatPronouns, pronounGroupLabel, pronounLabel } from '../i18n/pronouns';
import { useI18n } from '../i18n/I18nContext';
import { useEffect, useState } from 'react';
import { Camera, User, Mail, Phone, Check, Sparkles, Users } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useTenant } from '../contexts/TenantContext';
import {
  updateMyCustomerProfile,
  uploadMyCustomerAvatar,
  setMyCustomerAvatarPreset,
} from '../lib/customer-api';
import { PhoneInput } from '../components/PhoneInput';
import { isValidBrazilPhone } from '../lib/phone';
import { AvatarPickerModal } from '../components/AvatarPickerModal';
import { ProfileSubpageShell } from '../components/ProfileSubpageShell';
import { ProfileField, ProfileSectionHeader } from '../components/ProfileField';
import { Tooltip } from '../components/Tooltip';
import { MENU_TEXT_BODY, MENU_TEXT_MUTED } from '../lib/menuTheme';
import { PROFILE_CARD, PROFILE_INPUT, PROFILE_BTN_PRIMARY, PROFILE_LABEL } from '../lib/profileTheme';

const GENDER_OPTIONS: { value: string }[] = [
  { value: 'masculino' },
  { value: 'feminino' },
  { value: 'outro' },
  { value: 'prefiro_nao_dizer' },
];

// Pronomes pessoais (lista fechada, até 2 — ex.: "ela/dela"). A ordem de
// exibição é a canônica do backend (esta mesma lista).
const PRONOUN_GROUPS: { label: string; options: string[] }[] = [
  { label: 'Tradicionais Femininos', options: ['ela', 'dela', 'elas', 'delas'] },
  { label: 'Tradicionais Masculinos', options: ['ele', 'dele', 'eles', 'deles'] },
];

// Botão de opção (pronome/gênero): selecionado = cor do restaurante inline;
// não selecionado = contorno neutro nos dois temas.
const OPTION_BASE = 'w-full py-2 rounded-lg text-xs font-semibold border disabled:opacity-35 transition-colors';
const OPTION_OFF =
  'border-[#E5E7EB] text-[#4B5563] dark:border-white/10 dark:text-[#C4C7C5] hover:bg-black/[0.03] dark:hover:bg-white/5';

// "Meus dados" — nome, telefone e gênero (whitelist fechada, sem texto
// livre) editáveis, e avatar tocável. Tudo salvo direto no backend
// (Postgres) — nada fica só no navegador, então sobrevive a limpar
// cache, trocar de aparelho, o que for.
export function EditProfilePage() {
  const { t } = useI18n();
  const { slug } = useParams<{ slug: string }>();
  const { tenant } = useTenant();


  const { customer, token, isLoading, setCustomer } = useCustomerAuth();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState<string | null>(null);
  const [pronouns, setPronouns] = useState<string[]>([]);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [isUpdatingAvatar, setIsUpdatingAvatar] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!customer) return;
    setName(customer.name);
    setPhone(customer.phone ?? '');
    setGender(customer.gender);
    setPronouns(customer.pronouns ? customer.pronouns.split('/') : []);
  }, [customer]);

  async function handleSelectPhoto(file: File) {
    if (!tenant || !token) return;
    setIsUpdatingAvatar(true);
    setError(null);
    try {
      const updated = await uploadMyCustomerAvatar(tenant.id, token, file);
      setCustomer(updated);
      setShowAvatarPicker(false);
    } catch {
      setError(t('editProfilePage.nao_foi_possivel_enviar'));
    } finally {
      setIsUpdatingAvatar(false);
    }
  }

  async function handleSelectPreset(presetId: string) {
    if (!tenant || !token) return;
    setIsUpdatingAvatar(true);
    setError(null);
    try {
      const updated = await setMyCustomerAvatarPreset(tenant.id, token, presetId);
      setCustomer(updated);
      setShowAvatarPicker(false);
    } catch {
      setError(t('editProfilePage.nao_foi_possivel_definir'));
    } finally {
      setIsUpdatingAvatar(false);
    }
  }

  async function handleSave() {
    if (!tenant || !token) return;
    setError(null);

    if (name.trim().length < 2) {
      setError(t('editProfilePage.informe_seu_nome'));
      return;
    }
    if (!isValidBrazilPhone(phone)) {
      setError(t('phoneInput.telefone_incompleto_confira_o'));
      return;
    }

    setIsSaving(true);
    try {
      const updated = await updateMyCustomerProfile(tenant.id, token, {
        name: name.trim(),
        phone: phone || undefined,
        gender: gender ?? undefined,
        pronouns,
      });
      setCustomer(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(
        err?.response?.data?.message?.[0] ??
          err?.response?.data?.message ??
          t('editProfilePage.nao_foi_possivel_salvar'),
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (!tenant || isLoading || !customer) {
    return <BrandLoader delayMs={400} />;
  }

  const accent = tenant.primaryColor;

  return (
    <ProfileSubpageShell tenant={tenant} title={t('profile.myData')} backTo={`/${slug}/conta-cliente/perfil`}>
      {/* Desktop: foto/identidade à esquerda, formulário em grid à direita. */}
      <div className="md:grid md:grid-cols-[280px_minmax(0,1fr)] lg:grid-cols-[320px_minmax(0,1fr)] md:gap-8 md:items-start">
        <div className={`${PROFILE_CARD} flex flex-col items-center py-6 px-4 md:sticky md:top-24`}>
          <Tooltip label={t('editProfilePage.alterar_foto')}>
            <button
              onClick={() => setShowAvatarPicker(true)}
              disabled={isUpdatingAvatar}
              aria-label={t('editProfilePage.alterar_foto')}
              className="relative w-24 h-24 rounded-full overflow-hidden"
            >
              {customer.avatarUrl ? (
                <img src={customer.avatarUrl} alt={customer.name} className="w-full h-full object-cover" />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-white text-3xl font-bold"
                  style={{ backgroundColor: tenant.primaryColor }}
                >
                  {customer.name[0]?.toUpperCase()}
                </div>
              )}
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                <Camera size={22} strokeWidth={1.5} color="white" />
              </div>
              {isUpdatingAvatar && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                </div>
              )}
            </button>
          </Tooltip>
          {customer.pronouns && (
            <p className={`mt-2 text-xs ${MENU_TEXT_BODY}`}>{formatPronouns(customer.pronouns, t)}</p>
          )}
          <Tooltip label={t('editProfilePage.alterar_foto')}>
            <button
              onClick={() => setShowAvatarPicker(true)}
              className={`mt-3 rounded-xl py-2.5 px-5 inline-flex items-center justify-center gap-1.5 text-xs ${PROFILE_BTN_PRIMARY}`}
              style={{ backgroundColor: tenant.primaryColor }}
            >
              {t('editProfilePage.alterar_foto')}
            </button>
          </Tooltip>
        </div>

        {showAvatarPicker && (
          <AvatarPickerModal
            onClose={() => setShowAvatarPicker(false)}
            onSelectPhoto={handleSelectPhoto}
            onSelectPreset={handleSelectPreset}
            accentColor={tenant.primaryColor}
            isSaving={isUpdatingAvatar}
          />
        )}

        <div className="mt-4 md:mt-0 flex flex-col gap-4">
          {/* Identidade: nome, e-mail e WhatsApp em grade. */}
          <div className={`${PROFILE_CARD} p-4 md:p-6`}>
            <ProfileSectionHeader icon={User} title={t('profile.myData')} accent={accent} />
            <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:gap-x-5 md:gap-y-5">
              <ProfileField label={t('editProfilePage.nome')} icon={User}>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={150}
                  className={`${PROFILE_INPUT} w-full pl-10`}
                />
              </ProfileField>

              <ProfileField label={t('info.email')} icon={Mail}>
                <input
                  type="text"
                  value={customer.email}
                  disabled
                  className={`${PROFILE_INPUT} w-full pl-10 opacity-60`}
                />
              </ProfileField>

              <div className="md:col-span-2 md:max-w-sm">
                <label className={`${PROFILE_LABEL} block mb-1.5`}>{t('editProfilePage.whatsapp')}</label>
                <div className="relative">
                  <Phone
                    size={16}
                    strokeWidth={1.5}
                    className="absolute left-3.5 top-[23px] -translate-y-1/2 pointer-events-none text-[#9CA3AF] dark:text-[#8E918F]"
                  />
                  <PhoneInput value={phone} onChange={setPhone} className={`${PROFILE_INPUT} w-full pl-10`} />
                </div>
              </div>
            </div>
          </div>

          {/* Pronomes e gênero lado a lado no desktop. */}
          <div className="flex flex-col gap-4 xl:grid xl:grid-cols-2 xl:items-start">
            <div className={`${PROFILE_CARD} p-4 md:p-6`}>
              <ProfileSectionHeader icon={Sparkles} title={t('editProfilePage.pronomes_pessoais')} accent={accent} />
              <p className={`text-[11px] md:text-xs ${MENU_TEXT_MUTED} mb-3`}>
                {t('editProfilePage.escolha_ate_2_aparecem')}
              </p>
              <div className="flex flex-col gap-3">
                {PRONOUN_GROUPS.map((group) => (
                  <div key={group.label}>
                    <p className={`text-[11px] font-semibold ${MENU_TEXT_MUTED} mb-1.5`}>{pronounGroupLabel(group.label, t)}</p>
                    <div className="grid grid-cols-4 gap-2">
                      {group.options.map((option) => {
                        const on = pronouns.includes(option);
                        const full = !on && pronouns.length >= 2;
                        return (
                          <Tooltip key={option} label={pronounLabel(option, t)} className="flex w-full">
                            <button
                              type="button"
                              disabled={full}
                              onClick={() =>
                                setPronouns((prev) =>
                                  prev.includes(option) ? prev.filter((p) => p !== option) : [...prev, option],
                                )
                              }
                              className={`${OPTION_BASE} ${on ? 'glass-btn' : OPTION_OFF}`}
                              style={
                                on
                                  ? { '--seg': accent } as React.CSSProperties
                                  : undefined
                              }
                            >
                              {pronounLabel(option, t)}
                            </button>
                          </Tooltip>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={`${PROFILE_CARD} p-4 md:p-6`}>
              <ProfileSectionHeader icon={Users} title={t('editProfilePage.genero')} accent={accent} />
              <div className="grid grid-cols-2 gap-2">
                {GENDER_OPTIONS.map((option) => (
                  <Tooltip key={option.value} label={genderLabel(option.value, t)} className="flex w-full">
                    <button
                      onClick={() => setGender(option.value)}
                      className={`${OPTION_BASE} ${gender === option.value ? 'glass-btn' : OPTION_OFF}`}
                      style={
                        gender === option.value
                          ? { '--seg': accent } as React.CSSProperties
                          : undefined
                      }
                    >
                      {genderLabel(option.value, t)}
                    </button>
                  </Tooltip>
                ))}
              </div>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
              {error}
            </p>
          )}

          <div className="flex items-center gap-3 md:justify-end">
            {saved && (
              <p className="text-xs text-green-600 dark:text-green-400 inline-flex items-center gap-1.5">
                <Check size={14} strokeWidth={1.5} />
                {t('editProfilePage.salvo')}
              </p>
            )}
            <Tooltip label={t('editProfilePage.salvar')} className="flex flex-1 md:flex-none">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className={`w-full py-3.5 rounded-xl md:px-12 ${PROFILE_BTN_PRIMARY}`}
                style={{ backgroundColor: accent }}
              >
                {isSaving ? 'Salvando...' : t('editProfilePage.salvar')}
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
    </ProfileSubpageShell>
  );
}
