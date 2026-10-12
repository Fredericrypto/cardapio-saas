import { useI18n } from '../i18n/I18nContext';
import { Tooltip } from '../components/Tooltip';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { MapPin, AlertTriangle, Trash2 } from 'lucide-react';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useTenant } from '../contexts/TenantContext';
import { confirmMyCustomerAddress, removeMyCustomerAddress } from '../lib/customer-api';
import { ProfileSubpageShell } from '../components/ProfileSubpageShell';
import { MENU_PAGE_BG, MENU_TEXT, MENU_TEXT_BODY } from '../lib/menuTheme';
import { PROFILE_CARD, PROFILE_INPUT, PROFILE_BTN_OUTLINE, PROFILE_BTN_DANGER } from '../lib/profileTheme';

const BRAZIL_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO',
];

// Endereço salvo — a mesma geocodificação (LocationIQ) usada em qualquer
// outro lugar do sistema, confirmando o endereço UMA vez aqui. Depois de
// salvo, o carrinho de Entrega preenche isso sozinho, sem redigitar —
// igual iFood.
export function SavedAddressPage() {
  const { t } = useI18n();
  const { slug } = useParams<{ slug: string }>();
  const { tenant } = useTenant();


  const { customer, token, isLoading, setCustomer } = useCustomerAuth();

  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postcode, setPostcode] = useState('');
  const [referencePoint, setReferencePoint] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!customer?.address) return;
    setStreet(customer.address.street);
    setNumber(customer.address.number ?? '');
    setNeighborhood(customer.address.neighborhood ?? '');
    setCity(customer.address.city);
    setState(customer.address.state);
    setPostcode(customer.address.postcode ?? '');
    setReferencePoint(customer.address.referencePoint ?? '');
  }, [customer]);

  const canSubmit = street.trim().length > 1 && city.trim().length > 1 && state.trim().length === 2;

  async function handleConfirm() {
    if (!tenant || !token || !canSubmit) return;
    setError(null);
    setIsSaving(true);
    try {
      const updated = await confirmMyCustomerAddress(tenant.id, token, {
        street,
        addressNumber: number || undefined,
        neighborhood: neighborhood || undefined,
        city,
        state,
        postcode: postcode || undefined,
        referencePoint: referencePoint || undefined,
      });
      setCustomer(updated);
      setIsEditing(false);
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          t('savedAddressPage.nao_conseguimos_localizar_esse'),
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemove() {
    if (!tenant || !token) return;
    setIsRemoving(true);
    try {
      const updated = await removeMyCustomerAddress(tenant.id, token);
      setCustomer(updated);
      setIsEditing(true);
      setStreet('');
      setNumber('');
      setNeighborhood('');
      setCity('');
      setState('');
      setPostcode('');
      setReferencePoint('');
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

  const showForm = isEditing || !customer.address;

  return (
    <ProfileSubpageShell tenant={tenant} title={t('profile.savedAddress')} backTo={`/${slug}/conta-cliente/perfil`}>
      {/* Formulário curto: limita a largura para os campos não esticarem. */}
      <div className="max-w-2xl">
        {!showForm && customer.address && (
          <div className={`${PROFILE_CARD} p-4 md:p-6`}>
            <p className={`text-xs font-semibold ${MENU_TEXT_BODY} flex items-center gap-1.5 mb-1.5`}>
              <MapPin size={13} strokeWidth={1.5} />
              {t('savedAddressPage.endereco_confirmado')}
            </p>
            <p className={`text-sm font-medium ${MENU_TEXT}`}>{customer.address.formatted}</p>
            {customer.address.referencePoint && (
              <p className={`text-xs ${MENU_TEXT_BODY} mt-1`}>{t('receiptContentStandalone.ref')} {customer.address.referencePoint}</p>
            )}
            {customer.address.precise === false && (
              <p className="text-xs text-amber-600 dark:text-amber-300 flex items-start gap-1 mt-2">
                <AlertTriangle size={13} strokeWidth={1.5} className="shrink-0 mt-0.5" />
                {t('savedAddressPage.nao_conseguimos_confirmar_o')}
              </p>
            )}
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
            <div className="flex gap-2">
              <input
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                placeholder={t('address.street')}
                className={`${PROFILE_INPUT} flex-[2] min-w-0`}
              />
              <input
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder={t('cartPage.numero')}
                className={`${PROFILE_INPUT} flex-1 min-w-0`}
              />
            </div>
            <input
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
              placeholder={t('cartPage.bairro')}
              className={PROFILE_INPUT}
            />
            <div className="flex gap-2">
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder={t('cartPage.cidade')}
                className={`${PROFILE_INPUT} flex-[2] min-w-0`}
              />
              <select
                value={state}
                onChange={(e) => setState(e.target.value)}
                className={`${PROFILE_INPUT} flex-1 min-w-0`}
              >
                <option value="">{t('cartPage.uf')}</option>
                {BRAZIL_STATES.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </select>
            </div>
            <input
              value={postcode}
              onChange={(e) => setPostcode(e.target.value)}
              placeholder={t('cartPage.cep_opcional_ajuda_na')}
              className={PROFILE_INPUT}
            />
            <input
              value={referencePoint}
              onChange={(e) => setReferencePoint(e.target.value)}
              placeholder={t('savedAddressPage.ponto_de_referencia_opcional')}
              className={PROFILE_INPUT}
            />

            {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}

            <Tooltip label={t('savedAddressPage.confirmar_endereco')} className="flex w-full">
              <button
                onClick={handleConfirm}
                disabled={!canSubmit || isSaving}
                className="w-full py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-60 mt-1"
                style={{ backgroundColor: tenant.primaryColor }}
              >
                {isSaving ? 'Confirmando...' : t('savedAddressPage.confirmar_endereco')}
              </button>
            </Tooltip>
          </div>
        )}
      </div>
    </ProfileSubpageShell>
  );
}
