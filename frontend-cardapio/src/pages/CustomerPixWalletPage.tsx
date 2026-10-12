import { pixKeyTypeLabel } from '../i18n/labels';
import { useI18n } from '../i18n/I18nContext';
import { Tooltip } from '../components/Tooltip';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Wallet, Trash2, ShieldCheck } from 'lucide-react';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useTenant } from '../contexts/TenantContext';
import { setMyCustomerPixKey, removeMyCustomerPixKey } from '../lib/customer-api';
import { ProfileSubpageShell } from '../components/ProfileSubpageShell';
import { MENU_PAGE_BG, MENU_TEXT, MENU_TEXT_BODY } from '../lib/menuTheme';
import { PROFILE_CARD, PROFILE_INPUT, PROFILE_BTN_OUTLINE, PROFILE_BTN_DANGER } from '../lib/profileTheme';

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

  useEffect(() => {
    if (!customer?.pixKey) return;
    setPixKeyType(customer.pixKeyType ?? '');
    setPixKey(customer.pixKey);
  }, [customer]);

  const canSubmit = pixKeyType.length > 0 && pixKey.trim().length >= 3;

  async function handleSave() {
    if (!tenant || !token || !canSubmit) return;
    setError(null);
    setIsSaving(true);
    try {
      const updated = await setMyCustomerPixKey(tenant.id, token, {
        pixKeyType,
        pixKey: pixKey.trim(),
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

  return (
    <ProfileSubpageShell tenant={tenant} title={t('profile.pixWallet')} backTo={`/${slug}/conta-cliente/perfil`}>
      {/* Formulário curto: limita a largura para os campos não esticarem. */}
      <div className="max-w-2xl flex flex-col gap-3">
        <div className={`${PROFILE_CARD} p-4 md:p-5 flex gap-2.5`}>
          <ShieldCheck size={16} strokeWidth={1.5} className="text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
          <p className={`text-xs ${MENU_TEXT_BODY}`}>
            {t('customerPixWalletPage.guardamos_so_a_sua')}{' '}
            {tenant.name} {t('customerPixWalletPage.devolver_dinheiro_direto_pra')}
          </p>
        </div>

        {!showForm && customer.pixKey && (
          <div className={`${PROFILE_CARD} p-4 md:p-6`}>
            <p className={`text-xs font-semibold ${MENU_TEXT_BODY} flex items-center gap-1.5 mb-1.5`}>
              <Wallet size={13} strokeWidth={1.5} />
              {t('customerPixWalletPage.chave_salva')}
            </p>
            <p className={`text-sm font-medium ${MENU_TEXT}`}>
              {pixKeyTypeLabel(customer.pixKeyType, t)}
            </p>
            <p className={`text-sm ${MENU_TEXT_BODY} mt-0.5`}>{customer.pixKey}</p>
            <div className="flex gap-2 mt-3">
              <Tooltip label={t('customerPixWalletPage.editar')} className="flex flex-1">
                <button
                  onClick={() => setIsEditing(true)}
                  className={`w-full py-2 rounded-lg text-xs font-semibold ${PROFILE_BTN_OUTLINE}`}
                >
                  {t('customerPixWalletPage.editar')}
                </button>
              </Tooltip>
              <Tooltip label={t('tooltip.delete')}>
                <button
                  onClick={handleRemove}
                  disabled={isRemoving}
                  aria-label={t('tooltip.delete')}
                  className={`py-2 px-3 rounded-lg ${PROFILE_BTN_DANGER}`}
                >
                  <Trash2 size={14} strokeWidth={1.5} />
                </button>
              </Tooltip>
            </div>
          </div>
        )}

        {showForm && (
          <div className={`${PROFILE_CARD} p-4 md:p-6 flex flex-col gap-2.5`}>
            <select
              value={pixKeyType}
              onChange={(e) => setPixKeyType(e.target.value)}
              className={PROFILE_INPUT}
            >
              <option value="">{t('customerPixWalletPage.tipo_de_chave')}</option>
              <option value="email">{t('info.email')}</option>
              <option value="telefone">{t('customerPixWalletPage.celular')}</option>
              <option value="cpf">{t('customerPixWalletPage.cpf')}</option>
              <option value="aleatoria">{t('customerPixWalletPage.chave_aleatoria')}</option>
            </select>
            <input
              value={pixKey}
              onChange={(e) => setPixKey(e.target.value)}
              placeholder={t('customerPixWalletPage.sua_chave_pix')}
              className={PROFILE_INPUT}
            />

            {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}

            <Tooltip label={t('customerPixWalletPage.salvar_chave_pix')} className="flex w-full">
              <button
                onClick={handleSave}
                disabled={!canSubmit || isSaving}
                className="w-full py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-60 mt-1"
                style={{ backgroundColor: tenant.primaryColor }}
              >
                {isSaving ? 'Salvando...' : t('customerPixWalletPage.salvar_chave_pix')}
              </button>
            </Tooltip>
          </div>
        )}
      </div>
    </ProfileSubpageShell>
  );
}
