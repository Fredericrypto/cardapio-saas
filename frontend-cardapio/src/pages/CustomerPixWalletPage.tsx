import { pixKeyTypeLabel } from '../i18n/labels';
import { useI18n } from '../i18n/I18nContext';
import { Tooltip } from '../components/Tooltip';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Wallet, Trash2, ShieldCheck, Lock, Mail, Smartphone, Fingerprint, KeyRound, Pencil, Check, X, type LucideIcon } from 'lucide-react';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useTenant } from '../contexts/TenantContext';
import { setMyCustomerPixKey, removeMyCustomerPixKey } from '../lib/customer-api';
import { ProfileSubpageShell } from '../components/ProfileSubpageShell';
import { ProfileField, ProfileSectionHeader } from '../components/ProfileField';
import {
  formatPixKeyInput,
  fromStoredPixKey,
  isValidPixKey,
  toCanonicalPixKey,
} from '../lib/pixKey';
import { MENU_PAGE_BG, MENU_TEXT, MENU_TEXT_BODY } from '../lib/menuTheme';
import {
  PROFILE_CARD,
  PROFILE_INPUT,
  PROFILE_BTN_OUTLINE,
  PROFILE_BTN_DANGER,
  PROFILE_BTN_PRIMARY,
  PROFILE_LABEL,
  PROFILE_OPTION_CARD,
  PROFILE_SELECTED_RING,
} from '../lib/profileTheme';

// Carteira Pix do CLIENTE — guarda só a chave de destino, pra quando o
// estabelecimento precisar devolver dinheiro (reembolso de um pedido
// cancelado, por exemplo). Nunca guarda saldo, nunca move dinheiro pela
// nossa infra: é um dado de contato salvo, exatamente como o endereço.
export function CustomerPixWalletPage() {
  const { t } = useI18n();
  const { slug } = useParams<{ slug: string }>();
  const { tenant } = useTenant();


  const { customer, token, isLoading, setCustomer } = useCustomerAuth();

  const [pixKeyType, setPixKeyType] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [touched, setTouched] = useState(false);
  const keyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!customer?.pixKey) return;
    setPixKeyType(customer.pixKeyType ?? '');
    setPixKey(fromStoredPixKey(customer.pixKeyType, customer.pixKey));
  }, [customer]);

  const keyIsValid = isValidPixKey(pixKeyType, pixKey);
  const canSubmit = pixKeyType.length > 0 && keyIsValid;

  // Trocar o tipo zera o campo: a máscara de um tipo não serve para outro.
  function selectKeyType(value: string) {
    if (value === pixKeyType) return;
    setPixKeyType(value);
    setPixKey('');
    setTouched(false);
    setError(null);
    window.setTimeout(() => keyInputRef.current?.focus(), 0);
  }

  async function handleSave() {
    if (!tenant || !token || !canSubmit) return;
    setError(null);
    setIsSaving(true);
    try {
      const updated = await setMyCustomerPixKey(tenant.id, token, {
        pixKeyType,
        pixKey: toCanonicalPixKey(pixKeyType, pixKey),
      });
      setCustomer(updated);
      setIsEditing(false);
    } catch (err) {
      const backendMessage =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      setError(backendMessage ?? t('customerPixWalletPage.nao_foi_possivel_salvar'));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemove() {
    if (!tenant || !token) return;
    setIsRemoving(true);
    try {
      const updated = await removeMyCustomerPixKey(tenant.id, token);
      setCustomer(updated);
      setIsEditing(true);
      setPixKeyType('');
      setPixKey('');
      setTouched(false);
    } finally {
      setIsRemoving(false);
    }
  }

  if (!tenant || isLoading || !customer) {
    return (
      <div className={`flex items-center justify-center h-screen ${MENU_PAGE_BG}`}>
        <div className="w-8 h-8 border-2 border-gray-200 dark:border-white/10 border-t-gray-500 dark:border-t-gray-300 rounded-full animate-spin" />
      </div>
    );
  }

  const showForm = isEditing || !customer.pixKey;
  const accent = tenant.primaryColor;

  // Mesmos valores e rótulos do antigo <select>; só mudou a apresentação.
  const keyTypes: { value: string; label: string; icon: LucideIcon }[] = [
    { value: 'email', label: t('info.email'), icon: Mail },
    { value: 'telefone', label: t('customerPixWalletPage.celular'), icon: Smartphone },
    { value: 'cpf', label: t('customerPixWalletPage.cpf'), icon: Fingerprint },
    { value: 'aleatoria', label: t('customerPixWalletPage.chave_aleatoria'), icon: KeyRound },
  ];
  const savedTypeIcon = keyTypes.find((k) => k.value === customer.pixKeyType)?.icon ?? Wallet;
  const SavedTypeIcon = savedTypeIcon;

  // Comportamento do campo por tipo (teclado, máscara, exemplo e ícone).
  const fieldSpec: Record<string, { type: 'email' | 'tel' | 'text'; inputMode: 'email' | 'tel' | 'numeric' | 'text'; placeholder: string; icon: LucideIcon }> = {
    email: { type: 'email', inputMode: 'email', placeholder: 'nome@email.com', icon: Mail },
    telefone: { type: 'tel', inputMode: 'tel', placeholder: '(48) 99999-9999', icon: Smartphone },
    cpf: { type: 'text', inputMode: 'numeric', placeholder: '000.000.000-00', icon: Fingerprint },
    aleatoria: { type: 'text', inputMode: 'text', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', icon: KeyRound },
  };
  const spec = fieldSpec[pixKeyType] ?? { type: 'text' as const, inputMode: 'text' as const, placeholder: '', icon: KeyRound };
  const hasValue = pixKey.length > 0;
  const cpfComplete = pixKeyType === 'cpf' && pixKey.replace(/\D/g, '').length === 11;
  const fieldState: 'idle' | 'typing' | 'valid' | 'invalid' = !hasValue
    ? 'idle'
    : keyIsValid
      ? 'valid'
      : touched || cpfComplete
        ? 'invalid'
        : 'typing';
  const stateBorder =
    fieldState === 'valid'
      ? '!border-emerald-500/60 dark:!border-emerald-400/60'
      : fieldState === 'invalid'
        ? '!border-red-500/60 dark:!border-red-400/60'
        : '';

  return (
    <ProfileSubpageShell tenant={tenant} title={t('profile.pixWallet')} backTo={`/${slug}/conta-cliente/perfil`}>
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px] lg:gap-8 lg:items-start">
        {/* Aviso de segurança: bloco translúcido com ícones dedicados. No
            desktop vai para a coluna da direita e acompanha a rolagem. */}
        <div className="relative overflow-hidden rounded-2xl p-5 md:p-6 border border-emerald-500/25 bg-emerald-500/[0.07] dark:bg-emerald-400/[0.06] backdrop-blur-xl shadow-sm flex gap-4 lg:order-2 lg:sticky lg:top-24">
          <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-emerald-500/10" aria-hidden="true" />
          <div className="relative w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-emerald-500/15 border border-emerald-500/25">
            <ShieldCheck size={22} strokeWidth={1.5} className="text-emerald-600 dark:text-emerald-400" />
            <span className="absolute -bottom-1.5 -right-1.5 w-5 h-5 rounded-full bg-white dark:bg-[#1E1E20] border border-emerald-500/25 flex items-center justify-center">
              <Lock size={10} strokeWidth={1.5} className="text-emerald-600 dark:text-emerald-400" />
            </span>
          </div>
          <p className={`relative text-sm leading-relaxed ${MENU_TEXT_BODY}`}>
            {t('customerPixWalletPage.guardamos_so_a_sua')}{' '}
            {tenant.name} {t('customerPixWalletPage.devolver_dinheiro_direto_pra')}
          </p>
        </div>

        <div className="flex flex-col gap-4 min-w-0 lg:order-1">
          {!showForm && customer.pixKey && (
            <div className={`${PROFILE_CARD} p-4 md:p-6`}>
              <ProfileSectionHeader icon={Wallet} title={t('customerPixWalletPage.chave_salva')} accent={accent} />
              <div className="flex items-center gap-4 rounded-xl bg-black/[0.03] dark:bg-white/[0.05] border border-[#E5E7EB] dark:border-white/10 p-4">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-black/5 dark:bg-white/10">
                  <SavedTypeIcon size={20} strokeWidth={1.5} className={MENU_TEXT} />
                </div>
                <div className="min-w-0">
                  <p className={PROFILE_LABEL}>{pixKeyTypeLabel(customer.pixKeyType, t)}</p>
                  <p className={`text-sm md:text-base font-medium font-mono ${MENU_TEXT} mt-0.5 break-all`}>{fromStoredPixKey(customer.pixKeyType, customer.pixKey)}</p>
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <Tooltip label={t('customerPixWalletPage.editar')} className="flex flex-1">
                  <button
                    onClick={() => setIsEditing(true)}
                    className={`w-full py-2.5 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 ${PROFILE_BTN_OUTLINE}`}
                  >
                    <Pencil size={15} strokeWidth={1.5} />
                    {t('customerPixWalletPage.editar')}
                  </button>
                </Tooltip>
                <Tooltip label={t('tooltip.delete')}>
                  <button
                    onClick={handleRemove}
                    disabled={isRemoving}
                    aria-label={t('tooltip.delete')}
                    className={`h-full py-2.5 px-4 rounded-xl ${PROFILE_BTN_DANGER}`}
                  >
                    <Trash2 size={16} strokeWidth={1.5} />
                  </button>
                </Tooltip>
              </div>
            </div>
          )}

          {showForm && (
            <div className={`${PROFILE_CARD} p-4 md:p-6`}>
              <ProfileSectionHeader icon={Wallet} title={t('profile.pixWallet')} accent={accent} />

              <p className={`${PROFILE_LABEL} mb-2`}>{t('customerPixWalletPage.tipo_de_chave')}</p>
              <div role="radiogroup" aria-label={t('customerPixWalletPage.tipo_de_chave')} className="grid grid-cols-2 gap-3">
                {keyTypes.map((kt) => {
                  const selected = pixKeyType === kt.value;
                  return (
                    <Tooltip key={kt.value} label={kt.label} className="flex w-full">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => selectKeyType(kt.value)}
                        className={`w-full flex items-center gap-3 rounded-xl border px-3.5 py-3 ${PROFILE_OPTION_CARD} ${
                          selected ? PROFILE_SELECTED_RING : 'border-[#E5E7EB] dark:border-white/10'
                        }`}
                        style={selected ? { borderColor: accent } : undefined}
                      >
                        <kt.icon size={18} strokeWidth={1.5} className={selected ? MENU_TEXT : MENU_TEXT_BODY} />
                        <span className={`text-sm font-medium truncate ${selected ? MENU_TEXT : MENU_TEXT_BODY}`}>{kt.label}</span>
                      </button>
                    </Tooltip>
                  );
                })}
              </div>

              <ProfileField label={t('customerPixWalletPage.sua_chave_pix')} icon={spec.icon} className="mt-5">
                <div className="relative">
                  <input
                    ref={keyInputRef}
                    value={pixKey}
                    type={spec.type}
                    inputMode={spec.inputMode}
                    placeholder={spec.placeholder}
                    disabled={!pixKeyType}
                    maxLength={pixKeyType === 'aleatoria' ? 36 : pixKeyType === 'email' ? 77 : undefined}
                    autoComplete="off"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-invalid={fieldState === 'invalid'}
                    onChange={(e) => setPixKey(formatPixKeyInput(pixKeyType, e.target.value))}
                    onBlur={() => setTouched(true)}
                    className={`${PROFILE_INPUT} w-full pl-10 pr-11 disabled:opacity-50 transition-colors ${
                      pixKeyType === 'aleatoria' || pixKeyType === 'cpf' ? 'font-mono' : ''
                    } ${stateBorder}`}
                  />
                  {(fieldState === 'valid' || fieldState === 'invalid') && (
                    <span
                      className={`absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center ${
                        fieldState === 'valid'
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          : 'bg-red-500/15 text-red-500 dark:text-red-400'
                      }`}
                      aria-hidden="true"
                    >
                      {fieldState === 'valid' ? <Check size={14} strokeWidth={2} /> : <X size={14} strokeWidth={2} />}
                    </span>
                  )}
                </div>
                {pixKeyType === 'aleatoria' && hasValue && (
                  <p className={`text-[11px] tabular-nums text-right mt-1.5 ${MENU_TEXT_BODY}`}>{pixKey.length}/36</p>
                )}
                {pixKeyType === 'telefone' && fieldState === 'invalid' && (
                  <p className="text-xs text-red-500 dark:text-red-400 mt-1.5">{t('phoneInput.telefone_incompleto_confira_o')}</p>
                )}
              </ProfileField>

              {error && (
                <p className="text-xs text-red-500 dark:text-red-400 mt-4 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
                  {error}
                </p>
              )}

              <Tooltip label={t('customerPixWalletPage.salvar_chave_pix')} className="flex w-full md:w-auto md:justify-end mt-5 md:mt-6">
                <button
                  onClick={handleSave}
                  disabled={!canSubmit || isSaving}
                  className={`w-full md:w-auto md:px-10 py-3 rounded-xl text-sm ${PROFILE_BTN_PRIMARY}`}
                  style={{ backgroundColor: accent }}
                >
                  {isSaving ? 'Salvando...' : t('customerPixWalletPage.salvar_chave_pix')}
                </button>
              </Tooltip>
            </div>
          )}
        </div>
      </div>
    </ProfileSubpageShell>
  );
}
