import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Wallet, Trash2, ShieldCheck } from 'lucide-react';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useTenant } from '../contexts/TenantContext';
import { setMyCustomerPixKey, removeMyCustomerPixKey } from '../lib/customer-api';

const PIX_KEY_TYPE_LABELS: Record<string, string> = {
  email: 'E-mail',
  telefone: 'Celular',
  cpf: 'CPF',
  aleatoria: 'Chave aleatória',
};

// Carteira Pix do CLIENTE — guarda só a chave de destino, pra quando o
// estabelecimento precisar devolver dinheiro (reembolso de um pedido
// cancelado, por exemplo). Nunca guarda saldo, nunca move dinheiro pela
// nossa infra: é um dado de contato salvo, exatamente como o endereço.
export function CustomerPixWalletPage() {
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
      setError(backendMessage ?? 'Não foi possível salvar sua chave Pix agora.');
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
        <h1 className="font-display font-bold text-lg">Carteira Pix</h1>
      </div>

      <div className="px-4 mt-4 flex flex-col gap-3">
        <div className="bg-white rounded-2xl p-4 flex gap-2.5">
          <ShieldCheck size={16} className="text-green-600 shrink-0 mt-0.5" />
          <p className="text-xs text-gray-500">
            Guardamos só a sua chave — nenhum saldo fica com a gente. Ela serve pra{' '}
            {tenant.name} devolver dinheiro direto pra você, caso um pedido seja
            cancelado ou reembolsado.
          </p>
        </div>

        {!showForm && customer.pixKey && (
          <div className="bg-white rounded-2xl p-4">
            <p className="text-xs font-semibold text-gray-500 flex items-center gap-1.5 mb-1.5">
              <Wallet size={13} />
              Chave salva
            </p>
            <p className="text-sm font-medium text-gray-800">
              {PIX_KEY_TYPE_LABELS[customer.pixKeyType ?? ''] ?? customer.pixKeyType}
            </p>
            <p className="text-sm text-gray-600 mt-0.5">{customer.pixKey}</p>
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
            <select
              value={pixKeyType}
              onChange={(e) => setPixKeyType(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none"
            >
              <option value="">Tipo de chave</option>
              <option value="email">E-mail</option>
              <option value="telefone">Celular</option>
              <option value="cpf">CPF</option>
              <option value="aleatoria">Chave aleatória</option>
            </select>
            <input
              value={pixKey}
              onChange={(e) => setPixKey(e.target.value)}
              placeholder="Sua chave Pix"
              className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none"
            />

            {error && <p className="text-xs text-red-500">{error}</p>}

            <button
              onClick={handleSave}
              disabled={!canSubmit || isSaving}
              className="py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-60 mt-1"
              style={{ backgroundColor: tenant.primaryColor }}
            >
              {isSaving ? 'Salvando...' : 'Salvar chave Pix'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
