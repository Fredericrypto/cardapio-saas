import { pixKeyTypeLabel } from '../i18n/labels';
import { useI18n } from '../i18n/I18nContext';
import { Tooltip } from '../components/Tooltip';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Wallet, Trash2, ShieldCheck } from 'lucide-react';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useTenant } from '../contexts/TenantContext';
import { setMyCustomerPixKey, removeMyCustomerPixKey } from '../lib/customer-api';

// Carteira Pix do CLIENTE — guarda só a chave de destino, pra quando o
// estabelecimento precisar devolver dinheiro (reembolso de um pedido
// cancelado, por exemplo). Nunca guarda saldo, nunca move dinheiro pela
// nossa infra: é um dado de contato salvo, exatamente como o endereço.
export function CustomerPixWalletPage() {
  const { t } = useI18n();
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
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
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
      </div>
    );
  }

  const showForm = isEditing || !customer.pixKey;

  return (
    <div className="min-h-screen bg-gray-50 pb-10 max-w-md mx-auto">
      <div className="flex items-center gap-3 px-4 py-4 bg-white border-b border-gray-100">
        <button onClick={() => navigate(`/${slug}/conta-cliente/perfil`)}>
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-display font-bold text-lg">{t('profile.pixWallet')}</h1>
      </div>

      <div className="px-4 mt-4 flex flex-col gap-3">
        <div className="bg-white rounded-2xl p-4 flex gap-2.5">
          <ShieldCheck size={16} className="text-green-600 shrink-0 mt-0.5" />
          <p className="text-xs text-gray-500">
            {t('customerPixWalletPage.guardamos_so_a_sua')}{' '}
            {tenant.name} {t('customerPixWalletPage.devolver_dinheiro_direto_pra')}
          </p>
        </div>

        {!showForm && customer.pixKey && (
          <div className="bg-white rounded-2xl p-4">
            <p className="text-xs font-semibold text-gray-500 flex items-center gap-1.5 mb-1.5">
              <Wallet size={13} />
              {t('customerPixWalletPage.chave_salva')}
            </p>
            <p className="text-sm font-medium text-gray-800">
              {pixKeyTypeLabel(customer.pixKeyType, t)}
            </p>
            <p className="text-sm text-gray-600 mt-0.5">{customer.pixKey}</p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setIsEditing(true)}
                className="flex-1 py-2 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600"
              >
                {t('customerPixWalletPage.editar')}
              </button>
              <Tooltip label={t('tooltip.delete')}>
                <button
                  onClick={handleRemove}
                  disabled={isRemoving}
                  aria-label={t('tooltip.delete')}
                  className="py-2 px-3 rounded-lg border border-red-100 text-red-500"
                >
                  <Trash2 size={14} />
                </button>
              </Tooltip>
            </div>
          </div>
        )}

        {showForm && (
          <div className="bg-white rounded-2xl p-4 flex flex-col gap-2.5">
            <select
              value={pixKeyType}
              onChange={(e) => setPixKeyType(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none"
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
              className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none"
            />

            {error && <p className="text-xs text-red-500">{error}</p>}

            <button
              onClick={handleSave}
              disabled={!canSubmit || isSaving}
              className="py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-60 mt-1"
              style={{ backgroundColor: tenant.primaryColor }}
            >
              {isSaving ? 'Salvando...' : t('customerPixWalletPage.salvar_chave_pix')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
