import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MapPin, AlertTriangle, Trash2 } from 'lucide-react';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useTenant } from '../contexts/TenantContext';
import { confirmMyCustomerAddress, removeMyCustomerAddress } from '../lib/customer-api';

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
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
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
          'Não conseguimos localizar esse endereço. Confira os dados e tente de novo.',
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
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
      </div>
    );
  }

  const showForm = isEditing || !customer.address;

  return (
    <div className="min-h-screen bg-gray-50 pb-10 max-w-md mx-auto">
      <div className="flex items-center gap-3 px-4 py-4 bg-white border-b border-gray-100">
        <button onClick={() => navigate(`/${slug}/conta-cliente/perfil`)}>
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-display font-bold text-lg">Endereço salvo</h1>
      </div>

      <div className="px-4 mt-4">
        {!showForm && customer.address && (
          <div className="bg-white rounded-2xl p-4">
            <p className="text-xs font-semibold text-gray-500 flex items-center gap-1.5 mb-1.5">
              <MapPin size={13} />
              Endereço confirmado
            </p>
            <p className="text-sm font-medium text-gray-800">{customer.address.formatted}</p>
            {customer.address.referencePoint && (
              <p className="text-xs text-gray-500 mt-1">Ref: {customer.address.referencePoint}</p>
            )}
            {customer.address.precise === false && (
              <p className="text-xs text-amber-600 flex items-start gap-1 mt-2">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                Não conseguimos confirmar o número exato — confira se está certo.
              </p>
            )}
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setIsEditing(true)}
                className="flex-1 py-2 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600"
              >
                Editar
              </button>
              <button
                onClick={handleRemove}
                disabled={isRemoving}
                className="py-2 px-3 rounded-lg border border-red-100 text-red-500"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        )}

        {showForm && (
          <div className="bg-white rounded-2xl p-4 flex flex-col gap-2.5">
            <div className="flex gap-2">
              <input
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                placeholder="Rua"
                className="flex-[2] min-w-0 border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none"
              />
              <input
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="Número"
                className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none"
              />
            </div>
            <input
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
              placeholder="Bairro"
              className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none"
            />
            <div className="flex gap-2">
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Cidade"
                className="flex-[2] min-w-0 border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none"
              />
              <select
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-2.5 text-sm outline-none"
              >
                <option value="">UF</option>
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
              placeholder="CEP (opcional, ajuda na precisão)"
              className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none"
            />
            <input
              value={referencePoint}
              onChange={(e) => setReferencePoint(e.target.value)}
              placeholder="Ponto de referência (opcional)"
              className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none"
            />

            {error && <p className="text-xs text-red-500">{error}</p>}

            <button
              onClick={handleConfirm}
              disabled={!canSubmit || isSaving}
              className="py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-60 mt-1"
              style={{ backgroundColor: tenant.primaryColor }}
            >
              {isSaving ? 'Confirmando...' : 'Confirmar endereço'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
