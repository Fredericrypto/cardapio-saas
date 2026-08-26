import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Camera } from 'lucide-react';
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

const GENDER_OPTIONS: { value: string; label: string }[] = [
  { value: 'masculino', label: 'Masculino' },
  { value: 'feminino', label: 'Feminino' },
  { value: 'outro', label: 'Outro' },
  { value: 'prefiro_nao_dizer', label: 'Prefiro não dizer' },
];

// "Meus dados" — nome, telefone e gênero (whitelist fechada, sem texto
// livre) editáveis, e avatar tocável. Tudo salvo direto no backend
// (Postgres) — nada fica só no navegador, então sobrevive a limpar
// cache, trocar de aparelho, o que for.
export function EditProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { tenant } = useTenant();


  const { customer, token, isLoading, setCustomer } = useCustomerAuth();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState<string | null>(null);
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
      setError('Não foi possível enviar a foto. Tente novamente.');
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
      setError('Não foi possível definir o avatar. Tente novamente.');
    } finally {
      setIsUpdatingAvatar(false);
    }
  }

  async function handleSave() {
    if (!tenant || !token) return;
    setError(null);

    if (name.trim().length < 2) {
      setError('Informe seu nome.');
      return;
    }
    if (!isValidBrazilPhone(phone)) {
      setError('Telefone incompleto — confira o DDD e o número.');
      return;
    }

    setIsSaving(true);
    try {
      const updated = await updateMyCustomerProfile(tenant.id, token, {
        name: name.trim(),
        phone: phone || undefined,
        gender: gender ?? undefined,
      });
      setCustomer(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(
        err?.response?.data?.message?.[0] ??
          err?.response?.data?.message ??
          'Não foi possível salvar. Confira os dados e tente de novo.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (!tenant || isLoading || !customer) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-10 max-w-md mx-auto">
      <div className="flex items-center gap-3 px-4 py-4 bg-white border-b border-gray-100">
        <button onClick={() => navigate(`/${slug}/conta-cliente/perfil`)}>
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-display font-bold text-lg">Meus dados</h1>
      </div>

      <div className="flex flex-col items-center py-6 bg-white">
        <button
          onClick={() => setShowAvatarPicker(true)}
          disabled={isUpdatingAvatar}
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
            <Camera size={22} color="white" />
          </div>
          {isUpdatingAvatar && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            </div>
          )}
        </button>
        <button
          onClick={() => setShowAvatarPicker(true)}
          className="text-xs font-semibold mt-2"
          style={{ color: tenant.primaryColor }}
        >
          Alterar foto
        </button>
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

      <div className="px-4 mt-3 flex flex-col gap-3">
        <div className="bg-white rounded-2xl p-4 flex flex-col gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1.5">Nome</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={150}
              className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1.5">E-mail</label>
            <input
              type="text"
              value={customer.email}
              disabled
              className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full bg-gray-50 text-gray-400"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1.5">WhatsApp</label>
            <PhoneInput
              value={phone}
              onChange={setPhone}
              className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1.5">Gênero</label>
            <div className="grid grid-cols-2 gap-2">
              {GENDER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setGender(option.value)}
                  className="py-2 rounded-lg text-xs font-semibold border"
                  style={
                    gender === option.value
                      ? {
                          backgroundColor: tenant.primaryColor,
                          color: 'white',
                          borderColor: tenant.primaryColor,
                        }
                      : { borderColor: '#e5e5e5', color: '#666' }
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="text-xs text-red-500 px-1">{error}</p>}
        {saved && <p className="text-xs text-green-600 px-1">Salvo!</p>}

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="py-3.5 rounded-xl text-white font-semibold disabled:opacity-60"
          style={{ backgroundColor: tenant.primaryColor }}
        >
          {isSaving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}
