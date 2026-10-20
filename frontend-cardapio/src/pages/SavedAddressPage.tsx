import { BrandLoader } from '../components/BrandLoader';
import { useI18n } from '../i18n/I18nContext';
import { Tooltip } from '../components/Tooltip';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { MapPin, AlertTriangle, Trash2, Check, Hash, Building2, Map as MapIcon, Navigation, Mailbox, Store, Pencil } from 'lucide-react';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useTenant } from '../contexts/TenantContext';
import { confirmMyCustomerAddress, removeMyCustomerAddress } from '../lib/customer-api';
import { ProfileSubpageShell } from '../components/ProfileSubpageShell';
import { ProfileField, ProfileSectionHeader } from '../components/ProfileField';
import { MENU_TEXT, MENU_TEXT_BODY, MENU_TEXT_MUTED } from '../lib/menuTheme';
import {
  PROFILE_CARD,
  PROFILE_CARD_GLASS,
  PROFILE_INPUT,
  PROFILE_BTN_OUTLINE,
  PROFILE_BTN_DANGER,
  PROFILE_BTN_PRIMARY,
  PROFILE_LABEL,
} from '../lib/profileTheme';

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
  const [bannerFailed, setBannerFailed] = useState(false);

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
    return <BrandLoader delayMs={400} />;
  }

  const showForm = isEditing || !customer.address;

  // Pré-visualização ao vivo montada só com o que está nos campos (nenhum
  // texto novo: rótulos reaproveitam as chaves já existentes).
  const previewLine1 = [street.trim(), number.trim()].filter(Boolean).join(', ');
  const previewLine3 = [city.trim(), state.trim()].filter(Boolean).join(' - ');
  const hasPreview = Boolean(previewLine1 || neighborhood.trim() || previewLine3 || postcode.trim());
  const accent = tenant.primaryColor;
  // Imagem de capa do restaurante (Tenant.coverImageUrl); vazia -> gradiente.
  const bannerUrl = tenant.coverImageUrl || null;
  const showBanner = Boolean(bannerUrl) && !bannerFailed;
  const address = customer.address;

  const details: { label: string; value: string | undefined | null }[] = address
    ? [
        { label: t('address.street'), value: address.street },
        { label: t('cartPage.numero'), value: address.number },
        { label: t('cartPage.bairro'), value: address.neighborhood },
        { label: t('cartPage.cidade'), value: address.city },
        { label: t('cartPage.uf'), value: address.state },
        { label: 'CEP', value: address.postcode },
      ]
    : [];

  return (
    <ProfileSubpageShell tenant={tenant} title={t('profile.savedAddress')} backTo={`/${slug}/conta-cliente/perfil`}>
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px] lg:gap-8 lg:items-start">
        <div className="flex flex-col gap-4 min-w-0">
          {!showForm && address && (
            <div className={`${PROFILE_CARD} p-4 md:p-6`}>
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-green-500/10 border border-green-500/20">
                    <Check size={18} strokeWidth={1.5} className="text-green-600 dark:text-green-400" />
                  </div>
                  <p className={`text-xs font-semibold ${MENU_TEXT_BODY}`}>{t('savedAddressPage.endereco_confirmado')}</p>
                </div>
              </div>
              <p className={`font-display text-lg font-bold ${MENU_TEXT} leading-snug`}>{address.formatted}</p>

              <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-5 gap-y-4 mt-5 pt-5 border-t border-[#E5E7EB] dark:border-white/10">
                {details
                  .filter((d) => d.value)
                  .map((d) => (
                    <div key={d.label} className="min-w-0">
                      <dt className={PROFILE_LABEL}>{d.label}</dt>
                      <dd className={`text-sm font-medium ${MENU_TEXT} mt-0.5 break-words`}>{d.value}</dd>
                    </div>
                  ))}
                {address.referencePoint && (
                  <div className="col-span-2 md:col-span-3 min-w-0">
                    <dt className={PROFILE_LABEL}>{t('savedAddressPage.ponto_de_referencia_opcional')}</dt>
                    <dd className={`text-sm font-medium ${MENU_TEXT} mt-0.5 break-words`}>{address.referencePoint}</dd>
                  </div>
                )}
              </dl>

              {address.precise === false && (
                <p className="text-xs text-amber-600 dark:text-amber-300 flex items-start gap-1.5 mt-4 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2.5">
                  <AlertTriangle size={14} strokeWidth={1.5} className="shrink-0 mt-0.5" />
                  {t('savedAddressPage.nao_conseguimos_confirmar_o')}
                </p>
              )}

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
              <ProfileSectionHeader icon={MapPin} title={t('profile.savedAddress')} accent={accent} />

              <div className="grid grid-cols-6 gap-x-4 gap-y-4 md:gap-y-5">
                <ProfileField label={t('cartPage.cep_opcional_ajuda_na')} icon={Mailbox} className="col-span-6 md:col-span-2">
                  <input
                    value={postcode}
                    onChange={(e) => setPostcode(e.target.value)}
                    placeholder="00000-000"
                    inputMode="numeric"
                    className={`${PROFILE_INPUT} w-full pl-10`}
                  />
                </ProfileField>
                <ProfileField label={t('address.street')} icon={Navigation} className="col-span-6 md:col-span-4">
                  <input
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    className={`${PROFILE_INPUT} w-full pl-10`}
                  />
                </ProfileField>
                <ProfileField label={t('cartPage.numero')} icon={Hash} className="col-span-2">
                  <input
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    placeholder="123"
                    className={`${PROFILE_INPUT} w-full pl-10`}
                  />
                </ProfileField>
                <ProfileField label={t('cartPage.bairro')} icon={Building2} className="col-span-4">
                  <input
                    value={neighborhood}
                    onChange={(e) => setNeighborhood(e.target.value)}
                    className={`${PROFILE_INPUT} w-full pl-10`}
                  />
                </ProfileField>
                <ProfileField label={t('cartPage.cidade')} icon={MapIcon} className="col-span-4">
                  <input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className={`${PROFILE_INPUT} w-full pl-10`}
                  />
                </ProfileField>
                <ProfileField label={t('cartPage.uf')} className="col-span-2">
                  <select
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className={`${PROFILE_INPUT} w-full`}
                  >
                    <option value="">{t('cartPage.uf')}</option>
                    {BRAZIL_STATES.map((uf) => (
                      <option key={uf} value={uf}>
                        {uf}
                      </option>
                    ))}
                  </select>
                </ProfileField>
                <ProfileField label={t('savedAddressPage.ponto_de_referencia_opcional')} icon={Store} className="col-span-6">
                  <input
                    value={referencePoint}
                    onChange={(e) => setReferencePoint(e.target.value)}
                    className={`${PROFILE_INPUT} w-full pl-10`}
                  />
                </ProfileField>
              </div>

              {error && (
                <p className="text-xs text-red-500 dark:text-red-400 mt-4 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
                  {error}
                </p>
              )}

              <Tooltip label={t('savedAddressPage.confirmar_endereco')} className="flex w-full md:w-auto md:justify-end mt-5 md:mt-6">
                <button
                  onClick={handleConfirm}
                  disabled={!canSubmit || isSaving}
                  className={`w-full md:w-auto md:px-10 py-3 rounded-xl text-sm ${PROFILE_BTN_PRIMARY}`}
                  style={{ backgroundColor: accent }}
                >
                  {isSaving ? 'Confirmando...' : t('savedAddressPage.confirmar_endereco')}
                </button>
              </Tooltip>
            </div>
          )}
        </div>

        {/* Painel de apoio: pré-visualização do endereço (preenche o desktop). */}
        <aside className={`${PROFILE_CARD_GLASS} overflow-hidden lg:sticky lg:top-24`}>
          {/* Topo: banner do restaurante; sem banner (ou se falhar), gradiente
              institucional da cor principal. */}
          <div
            className="relative h-28 md:h-32 flex items-end p-4 overflow-hidden"
            style={showBanner ? undefined : { background: `linear-gradient(135deg, ${accent} 0%, ${accent}B3 100%)` }}
          >
            {showBanner ? (
              <>
                <img
                  src={bannerUrl ?? undefined}
                  alt=""
                  draggable={false}
                  onError={() => setBannerFailed(true)}
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" aria-hidden="true" />
              </>
            ) : (
              <>
                <div className="absolute -right-6 -top-8 w-32 h-32 rounded-full bg-white/10" aria-hidden="true" />
                <div className="absolute right-10 top-10 w-16 h-16 rounded-full bg-white/10" aria-hidden="true" />
              </>
            )}
            <div className="relative flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-white/15 border border-white/20 backdrop-blur-sm flex items-center justify-center overflow-hidden shrink-0">
                {tenant.logoUrl ? (
                  <img src={tenant.logoUrl} alt={tenant.name} className="w-full h-full object-cover" />
                ) : (
                  <Store size={20} strokeWidth={1.5} className="text-white" />
                )}
              </div>
              <p className="text-white font-display font-bold truncate drop-shadow-sm">{tenant.name}</p>
            </div>
          </div>
          <div className="p-4 md:p-5 flex gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-black/5 dark:bg-white/10">
              <MapPin size={17} strokeWidth={1.5} className={MENU_TEXT} />
            </div>
            {hasPreview ? (
              <div className="min-w-0 flex flex-col gap-0.5">
                {previewLine1 && <p className={`text-sm font-semibold ${MENU_TEXT} break-words`}>{previewLine1}</p>}
                {neighborhood.trim() && <p className={`text-xs ${MENU_TEXT_BODY} break-words`}>{neighborhood.trim()}</p>}
                {previewLine3 && <p className={`text-xs ${MENU_TEXT_BODY} break-words`}>{previewLine3}</p>}
                {postcode.trim() && <p className={`text-xs ${MENU_TEXT_MUTED}`}>{postcode.trim()}</p>}
              </div>
            ) : (
              <div className="flex-1 flex flex-col gap-2 pt-1.5" aria-hidden="true">
                <div className="h-2.5 rounded-full bg-black/5 dark:bg-white/10 w-4/5" />
                <div className="h-2.5 rounded-full bg-black/5 dark:bg-white/10 w-3/5" />
                <div className="h-2.5 rounded-full bg-black/5 dark:bg-white/10 w-2/5" />
              </div>
            )}
          </div>
        </aside>
      </div>
    </ProfileSubpageShell>
  );
}
