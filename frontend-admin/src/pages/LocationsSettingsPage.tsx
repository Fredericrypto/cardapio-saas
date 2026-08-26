import { useEffect, useState } from 'react';
import { MapPin, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import {
  fetchLocations,
  createLocation,
  updateLocation,
  confirmLocationAddress,
  deleteLocation,
} from '../lib/admin-api';
import { MaskedNumberField } from '../components/MaskedNumberField';
import type { Location } from '../types';

const WEEK_DAYS: { key: string; label: string }[] = [
  { key: 'segunda', label: 'Segunda' },
  { key: 'terca', label: 'Terça' },
  { key: 'quarta', label: 'Quarta' },
  { key: 'quinta', label: 'Quinta' },
  { key: 'sexta', label: 'Sexta' },
  { key: 'sabado', label: 'Sábado' },
  { key: 'domingo', label: 'Domingo' },
];

interface DayHours {
  closed: boolean;
  open: string;
  close: string;
}

function parseDayValue(raw: string | undefined): DayHours {
  if (!raw || raw === 'fechado') return { closed: raw === 'fechado', open: '18:00', close: '23:00' };
  const [open, close] = raw.split('-');
  return { closed: false, open: open ?? '18:00', close: close ?? '23:00' };
}

function initHours(openingHours: Record<string, string> | null | undefined): Record<string, DayHours> {
  const result: Record<string, DayHours> = {};
  for (const day of WEEK_DAYS) {
    result[day.key] = parseDayValue(openingHours?.[day.key]);
  }
  return result;
}

function hoursToPayload(hours: Record<string, DayHours>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const day of WEEK_DAYS) {
    const d = hours[day.key];
    result[day.key] = d.closed ? 'fechado' : `${d.open}-${d.close}`;
  }
  return result;
}

function feeToFieldValue(value: number | null | undefined): string {
  return value ? String(value) : '';
}

function formatCurrency(raw: string): string {
  const num = Number(raw);
  if (Number.isNaN(num)) return '';
  return `R$ ${num.toFixed(2).replace('.', ',')}`;
}

function formatKm(raw: string): string {
  const num = Number(raw);
  if (Number.isNaN(num)) return '';
  return `${String(num).replace('.', ',')}km`;
}

// Gerencia as lojas físicas (filiais) do restaurante — mesma lógica do
// McDonald's: uma marca, várias lojas, cada uma com seu próprio
// endereço/horário/entrega/WhatsApp. Quem tem uma loja só nem percebe
// diferença nenhuma na prática, só usa essa tela em vez das configurações
// antigas (que ficavam direto na aba Configurações).
export function LocationsSettingsPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [newLocationName, setNewLocationName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  async function load() {
    const data = await fetchLocations();
    setLocations(data);
    setSelectedId((current) => current || data[0]?.id || '');
    setIsLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreateLocation() {
    if (!newLocationName.trim()) return;
    setIsCreating(true);
    try {
      const created = await createLocation({ name: newLocationName.trim() });
      setNewLocationName('');
      await load();
      setSelectedId(created.id);
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDeleteLocation(id: string) {
    if (
      !confirm(
        'Remover esta loja? Mesas e histórico ligados a ela deixam de aparecer no cardápio.',
      )
    )
      return;
    try {
      await deleteLocation(id);
      await load();
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      alert(message ?? 'Não foi possível remover essa loja.');
    }
  }

  const selectedLocation = locations.find((l) => l.id === selectedId) ?? null;

  if (isLoading) {
    return <div className="p-6 text-sm text-gray-400">Carregando...</div>;
  }

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="font-display text-xl font-bold text-gray-900 mb-1">Lojas</h1>
      <p className="text-xs text-gray-400 mb-6">
        Endereço, horário e entrega são configurados por loja — cada filial tem os seus.
      </p>

      <div className="flex gap-2 mb-4 flex-wrap">
        {locations.map((location) => (
          <button
            key={location.id}
            onClick={() => setSelectedId(location.id)}
            className={`px-3 py-2 rounded-lg text-sm font-semibold ${
              selectedId === location.id
                ? 'bg-gray-900 text-white'
                : 'bg-white border border-gray-200 text-gray-600'
            }`}
          >
            {location.name}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-6">
        <input
          value={newLocationName}
          onChange={(e) => setNewLocationName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreateLocation()}
          placeholder="Nome da nova loja (ex: Unidade Shopping)"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none"
        />
        <button
          onClick={handleCreateLocation}
          disabled={isCreating}
          className="bg-gray-900 text-white rounded-lg px-4 flex items-center gap-1.5 text-sm font-semibold disabled:opacity-60"
        >
          <Plus size={15} />
          Nova loja
        </button>
      </div>

      {selectedLocation && (
        <LocationEditor
          key={selectedLocation.id}
          location={selectedLocation}
          canDelete={locations.length > 1}
          onSaved={(updated) =>
            setLocations((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))
          }
          onDelete={() => handleDeleteLocation(selectedLocation.id)}
        />
      )}
    </div>
  );
}

function LocationEditor({
  location,
  canDelete,
  onSaved,
  onDelete,
}: {
  location: Location;
  canDelete: boolean;
  onSaved: (updated: Location) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(location.name);
  const [whatsappNumber, setWhatsappNumber] = useState(location.whatsappNumber ?? '');
  const [isOpen, setIsOpen] = useState(location.isOpen);
  const [openingHours, setOpeningHours] = useState<Record<string, DayHours>>(
    initHours(location.openingHours),
  );
  const [deliveryFee, setDeliveryFee] = useState(feeToFieldValue(location.deliveryFee));
  const [deliveryFeePerKm, setDeliveryFeePerKm] = useState(feeToFieldValue(location.deliveryFeePerKm));
  const [deliveryMaxRadiusKm, setDeliveryMaxRadiusKm] = useState(
    location.deliveryMaxRadiusKm != null ? String(location.deliveryMaxRadiusKm) : '',
  );
  const [minOrderValue, setMinOrderValue] = useState(feeToFieldValue(location.minOrderValue));
  const [isSaving, setIsSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);
  const [isTogglingOpen, setIsTogglingOpen] = useState(false);

  const [locationAddress, setLocationAddress] = useState(location.address ?? '');
  const [isConfirmingLocation, setIsConfirmingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const hasConfirmedLocation = location.latitude != null && location.longitude != null;

  async function handleToggleOpen() {
    const nextValue = !isOpen;
    setIsOpen(nextValue);
    setIsTogglingOpen(true);
    try {
      const updated = await updateLocation(location.id, { isOpen: nextValue });
      onSaved(updated);
    } catch {
      setIsOpen(!nextValue);
    } finally {
      setIsTogglingOpen(false);
    }
  }

  async function handleConfirmLocation() {
    setIsConfirmingLocation(true);
    setLocationError(null);
    try {
      const updated = await confirmLocationAddress(location.id, locationAddress);
      onSaved(updated);
      setLocationAddress(updated.address ?? '');
    } catch {
      setLocationError(
        'Não conseguimos localizar esse endereço. Confira se está completo (rua, número, bairro, cidade e estado).',
      );
    } finally {
      setIsConfirmingLocation(false);
    }
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      const updated = await updateLocation(location.id, {
        name,
        whatsappNumber: whatsappNumber || undefined,
        deliveryFee: Number(deliveryFee),
        deliveryFeePerKm: Number(deliveryFeePerKm),
        deliveryMaxRadiusKm: deliveryMaxRadiusKm ? Number(deliveryMaxRadiusKm) : undefined,
        minOrderValue: Number(minOrderValue),
        openingHours: hoursToPayload(openingHours),
      });
      onSaved(updated);
      setSavedMessage(true);
      setTimeout(() => setSavedMessage(false), 3000);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white border border-gray-100 rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">Loja aberta</p>
          <p className="text-xs text-gray-400">
            Quando desligado, clientes não conseguem pedir nesta loja.
          </p>
          <p
            className={`text-xs font-semibold mt-1.5 ${
              location.isOpenNow ? 'text-green-600' : 'text-red-500'
            }`}
          >
            Status agora, pro cliente: {location.isOpenNow ? 'Aberto' : 'Fechado'}
            {isOpen && !location.isOpenNow && ' (fora do horário configurado abaixo)'}
          </p>
          {isTogglingOpen && <p className="text-xs text-gray-400 mt-1">Salvando...</p>}
        </div>
        <button
          onClick={handleToggleOpen}
          disabled={isTogglingOpen}
          className={`w-12 h-7 rounded-full transition-colors relative shrink-0 disabled:opacity-70 ${
            isOpen ? 'bg-green-500' : 'bg-gray-300'
          }`}
        >
          <span
            className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
              isOpen ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      <div className="border-t border-gray-100 pt-4">
        <p className="text-sm font-semibold text-gray-900 mb-3">Horário de funcionamento</p>
        <div className="flex flex-col gap-2">
          {WEEK_DAYS.map((day) => {
            const value = openingHours[day.key];
            return (
              <div key={day.key} className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-16 shrink-0">{day.label}</span>
                <label className="flex items-center gap-1.5 shrink-0">
                  <input
                    type="checkbox"
                    checked={!value.closed}
                    onChange={(e) =>
                      setOpeningHours((prev) => ({
                        ...prev,
                        [day.key]: { ...prev[day.key], closed: !e.target.checked },
                      }))
                    }
                  />
                  <span className="text-xs text-gray-400">Aberto</span>
                </label>
                {!value.closed && (
                  <>
                    <input
                      type="time"
                      value={value.open}
                      onChange={(e) =>
                        setOpeningHours((prev) => ({
                          ...prev,
                          [day.key]: { ...prev[day.key], open: e.target.value },
                        }))
                      }
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none"
                    />
                    <span className="text-xs text-gray-300">até</span>
                    <input
                      type="time"
                      value={value.close}
                      onChange={(e) =>
                        setOpeningHours((prev) => ({
                          ...prev,
                          [day.key]: { ...prev[day.key], close: e.target.value },
                        }))
                      }
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none"
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Field label="Nome da loja">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full"
        />
      </Field>

      <Field label="WhatsApp desta loja">
        <input
          value={whatsappNumber}
          onChange={(e) => setWhatsappNumber(e.target.value)}
          placeholder="(48) 99999-9999"
          className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full"
        />
      </Field>

      <div className="border-t border-gray-100 pt-4">
        <p className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-1.5">
          <MapPin size={15} />
          Localização e entrega
        </p>
        <p className="text-xs text-gray-400 mb-3">
          A taxa de entrega é calculada automaticamente pela distância até o cliente. Confirme
          o endereço desta loja pra isso funcionar.
        </p>

        <Field label="Endereço desta loja">
          <input
            value={locationAddress}
            onChange={(e) => setLocationAddress(e.target.value)}
            placeholder="Rua, número, bairro, cidade, estado"
            className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full"
          />
        </Field>

        <button
          onClick={handleConfirmLocation}
          disabled={isConfirmingLocation || !locationAddress}
          className="mt-2 text-sm font-semibold border border-gray-200 rounded-lg px-3 py-2 disabled:opacity-60"
        >
          {isConfirmingLocation ? 'Confirmando...' : 'Confirmar localização'}
        </button>

        {locationError && <p className="text-xs text-red-500 mt-2">{locationError}</p>}

        {hasConfirmedLocation && !locationError && (
          <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
            <CheckCircle2 size={13} />
            Localização confirmada
          </p>
        )}
        {!hasConfirmedLocation && !locationError && (
          <p className="text-xs text-amber-600 mt-2">
            Localização ainda não confirmada — a entrega por distância não vai funcionar até
            confirmar.
          </p>
        )}

        <div className="flex gap-3 mt-3">
          <Field label="Taxa base (R$)">
            <MaskedNumberField
              value={deliveryFee}
              onChange={setDeliveryFee}
              formatDisplay={formatCurrency}
              className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full"
            />
          </Field>
          <Field label="Taxa por km (R$/km)">
            <MaskedNumberField
              value={deliveryFeePerKm}
              onChange={setDeliveryFeePerKm}
              formatDisplay={formatCurrency}
              className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full"
            />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Raio máximo de entrega (km) — deixe em branco pra não limitar">
            <MaskedNumberField
              value={deliveryMaxRadiusKm}
              onChange={setDeliveryMaxRadiusKm}
              formatDisplay={formatKm}
              placeholder="Sem limite"
              className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full"
            />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Valor mínimo do pedido pra entrega (R$) — deixe 0 pra não exigir mínimo">
            <MaskedNumberField
              value={minOrderValue}
              onChange={setMinOrderValue}
              formatDisplay={formatCurrency}
              className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full"
            />
          </Field>
        </div>
      </div>

      {savedMessage && (
        <p className="text-xs text-green-600 font-semibold">Salvo com sucesso!</p>
      )}

      <button
        onClick={handleSave}
        disabled={isSaving}
        className="bg-gray-900 text-white rounded-lg py-3 text-sm font-semibold disabled:opacity-60"
      >
        {isSaving ? 'Salvando...' : 'Salvar alterações'}
      </button>

      {canDelete && (
        <button
          onClick={onDelete}
          className="flex items-center justify-center gap-1.5 text-xs font-semibold text-red-500 py-2"
        >
          <Trash2 size={13} />
          Remover esta loja
        </button>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex-1">
      <label className="text-xs font-semibold text-gray-500 block mb-1">{label}</label>
      {children}
    </div>
  );
}
