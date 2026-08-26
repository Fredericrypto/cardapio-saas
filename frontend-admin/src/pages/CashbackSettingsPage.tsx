import { useEffect, useState } from 'react';
import { Wallet, Plus, Trash2, Pencil } from 'lucide-react';
import {
  fetchCashbackSettings,
  createCashbackSettings,
  updateCashbackSettings,
  deleteCashbackSettings,
  fetchLocations,
} from '../lib/admin-api';
import type { CashbackSettings, CashbackSettingsPayload, Location } from '../types';
import { CashAmountInput, OptionalCashAmountInput } from '../components/CashAmountInput';

// Cashback ("X% de volta em toda compra", estilo Uber Cash/iFood) — área
// SEPARADA de Fidelidade de propósito: cashback é automático e imediato
// (todo pedido pago credita %), fidelidade é manual e por acúmulo
// (carimbo por carimbo, staff confirma). Podem existir várias
// configurações ativas ao mesmo tempo com escopos de loja diferentes —
// ver CashbackService.findApplicableSettings no backend pra entender
// como a mais específica vence quando há sobreposição.
export function CashbackSettingsPage() {
  const [settingsList, setSettingsList] = useState<CashbackSettings[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function load() {
    const [list, locs] = await Promise.all([fetchCashbackSettings(), fetchLocations()]);
    setSettingsList(list);
    setLocations(locs);
    setIsLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleToggleActive(settings: CashbackSettings) {
    const updated = await updateCashbackSettings(settings.id, { isActive: !settings.isActive });
    setSettingsList((prev) => prev.map((s) => (s.id === settings.id ? updated : s)));
  }

  async function handleDelete(id: string) {
    await deleteCashbackSettings(id);
    setSettingsList((prev) => prev.filter((s) => s.id !== id));
  }

  if (isLoading) {
    return <p className="text-sm text-gray-400 p-6">Carregando...</p>;
  }

  return (
    <div className="p-6 max-w-2xl mx-auto flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-display font-bold flex items-center gap-2">
          <Wallet size={22} />
          Cashback
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          % de volta em toda compra, creditado automaticamente na carteira do cliente assim que o
          pagamento é confirmado. Ele escolhe usar (ou não) o saldo no próximo pedido.
        </p>
      </div>

      {settingsList.length > 1 && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-800">
          Com mais de uma configuração ativa, a que lista uma loja específica sempre vence sobre a
          que vale "em todas as lojas" pra essa loja.
        </div>
      )}

      {settingsList.map((settings) =>
        editingId === settings.id ? (
          <SettingsForm
            key={settings.id}
            initial={settings}
            locations={locations}
            onCancel={() => setEditingId(null)}
            onSave={(payload) => updateCashbackSettings(settings.id, payload)}
            onDone={async () => {
              setEditingId(null);
              await load();
            }}
          />
        ) : (
          <div key={settings.id} className="bg-white border border-gray-100 rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-gray-900">{settings.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {settings.percentage}% de volta
                  {settings.maxCashbackPerOrder != null &&
                    ` (teto de R$ ${settings.maxCashbackPerOrder.toFixed(2).replace('.', ',')} por pedido)`}
                  {settings.maxCashbackPerCustomerPerDay != null &&
                    ` (máx. R$ ${settings.maxCashbackPerCustomerPerDay.toFixed(2).replace('.', ',')}/dia por cliente)`}
                </p>
                <div className="flex items-center gap-2 mt-2 flex-wrap text-[11px] text-gray-400">
                  {settings.minOrderValue > 0 && (
                    <span>Pedido mínimo R$ {settings.minOrderValue.toFixed(2).replace('.', ',')}</span>
                  )}
                  <span>
                    {settings.expirationDays != null
                      ? `Expira em ${settings.expirationDays} dia(s)`
                      : 'Nunca expira'}
                  </span>
                  <span>
                    {settings.locations.length === 0
                      ? 'Todas as lojas'
                      : `Só em: ${settings.locations.map((l) => l.name).join(', ')}`}
                  </span>
                </div>
                {settings.promoText && (
                  <p className="text-xs text-gray-400 mt-1">"{settings.promoText}"</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <button
                  onClick={() => handleToggleActive(settings)}
                  className={`text-[11px] font-semibold px-2 py-1 rounded-full ${
                    settings.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {settings.isActive ? 'Ativo' : 'Pausado'}
                </button>
                <div className="flex items-center gap-2">
                  <button onClick={() => setEditingId(settings.id)} className="text-gray-400">
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => handleDelete(settings.id)} className="text-gray-400">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ),
      )}

      {isCreating ? (
        <SettingsForm
          locations={locations}
          onCancel={() => setIsCreating(false)}
          onSave={(payload) => createCashbackSettings(payload)}
          onDone={async () => {
            setIsCreating(false);
            await load();
          }}
        />
      ) : (
        <button
          onClick={() => setIsCreating(true)}
          className="w-full py-3 rounded-xl border-2 border-dashed border-gray-200 text-gray-500 font-semibold text-sm flex items-center justify-center gap-1.5"
        >
          <Plus size={16} />
          Nova configuração de cashback
        </button>
      )}
    </div>
  );
}

function SettingsForm({
  initial,
  locations,
  onCancel,
  onSave,
  onDone,
}: {
  initial?: CashbackSettings;
  locations: Location[];
  onCancel: () => void;
  onSave: (payload: CashbackSettingsPayload) => Promise<CashbackSettings>;
  onDone: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? 'Cashback');
  const [percentage, setPercentage] = useState(initial ? String(initial.percentage) : '5');
  // Dinheiro: sempre em CENTAVOS inteiros (nunca float), digitado no
  // formato de caixa registradora (ver CashAmountInput). Os dois campos
  // "opcionais" usam a variante que distingue null (sem teto/mínimo) de
  // um valor real >= R$0,01 — é o que fecha de vez o bug de digitar "0"
  // achando que significa "sem limite" e cair num erro de validação.
  const [minOrderValueCents, setMinOrderValueCents] = useState(
    Math.round((initial?.minOrderValue ?? 0) * 100),
  );
  const [maxCashbackPerOrderCents, setMaxCashbackPerOrderCents] = useState<number | null>(
    initial?.maxCashbackPerOrder != null ? Math.round(initial.maxCashbackPerOrder * 100) : null,
  );
  const [maxCashbackPerCustomerPerDayCents, setMaxCashbackPerCustomerPerDayCents] = useState<
    number | null
  >(
    initial?.maxCashbackPerCustomerPerDay != null
      ? Math.round(initial.maxCashbackPerCustomerPerDay * 100)
      : null,
  );
  const [expirationDays, setExpirationDays] = useState(
    initial?.expirationDays != null ? String(initial.expirationDays) : '',
  );
  const [promoText, setPromoText] = useState(initial?.promoText ?? '');
  const [locationIds, setLocationIds] = useState<string[]>(
    initial?.locations.map((l) => l.id) ?? [],
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleLocation(id: string) {
    setLocationIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError('Dá um nome pra essa configuração (ex: "Padrão").');
      return;
    }
    const pct = Number(percentage);
    if (!pct || pct <= 0 || pct > 100) {
      setError('Informa um percentual válido, entre 0 e 100.');
      return;
    }

    setIsSaving(true);
    try {
      const saved = await onSave({
        name: name.trim(),
        percentage: pct,
        minOrderValue: minOrderValueCents / 100,
        // `null` explícito sempre que estiver vazio — nunca `undefined`,
        // porque `undefined` significa "não mexe nesse campo" pro
        // backend (útil só em teoria, mas ambíguo demais quando o campo
        // JÁ apareceu no formulário) e não deixaria limpar um teto que
        // já existia numa edição.
        maxCashbackPerOrder: maxCashbackPerOrderCents != null ? maxCashbackPerOrderCents / 100 : null,
        maxCashbackPerCustomerPerDay:
          maxCashbackPerCustomerPerDayCents != null ? maxCashbackPerCustomerPerDayCents / 100 : null,
        expirationDays: expirationDays ? Number(expirationDays) : null,
        promoText: promoText.trim() || undefined,
        isActive: initial?.isActive ?? true,
        locationIds,
      });
      if (saved) onDone();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Não foi possível salvar. Tenta de novo.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 flex flex-col gap-3">
      <Field label="Nome (só pro seu controle, cliente nunca vê)">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Padrão"
          className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full"
        />
      </Field>

      <Field label="Percentual de volta">
        <div className="relative">
          <input
            type="number"
            step="0.01"
            min={0.01}
            max={100}
            value={percentage}
            onChange={(e) => setPercentage(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full pr-8"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
        </div>
      </Field>

      <div className="flex gap-2">
        <Field label="Pedido mínimo (opcional)">
          <CashAmountInput
            valueCents={minOrderValueCents}
            onChangeCents={setMinOrderValueCents}
            className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full"
          />
        </Field>
        <Field label="Teto por pedido (opcional)">
          <OptionalCashAmountInput
            valueCents={maxCashbackPerOrderCents}
            onChangeCents={setMaxCashbackPerOrderCents}
            placeholder="Sem teto"
            className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full placeholder:text-gray-400"
          />
        </Field>
      </div>

      <Field label="Teto por cliente, por dia (opcional)">
        <OptionalCashAmountInput
          valueCents={maxCashbackPerCustomerPerDayCents}
          onChangeCents={setMaxCashbackPerCustomerPerDayCents}
          placeholder="Sem teto diário"
          className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full placeholder:text-gray-400"
        />
        <p className="text-[11px] text-gray-400 mt-1">
          Soma tudo que um cliente ganha de cashback em 24h, mesmo em pedidos diferentes — evita
          acumular fazendo vários pedidos pequenos seguidos.
        </p>
      </Field>

      <Field label="Expira em quantos dias (opcional)">
        <input
          type="number"
          min={1}
          value={expirationDays}
          onChange={(e) => setExpirationDays(e.target.value)}
          placeholder="Nunca expira"
          className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full"
        />
      </Field>

      <Field label="Texto de propaganda pro cliente (opcional)">
        <input
          value={promoText}
          onChange={(e) => setPromoText(e.target.value)}
          placeholder='Ex: "Ganhe 5% de volta em todo pedido!"'
          className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full"
        />
      </Field>

      <Field label="Em quais lojas vale">
        <div className="flex flex-wrap gap-1.5">
          {locations.map((loc) => (
            <button
              key={loc.id}
              type="button"
              onClick={() => toggleLocation(loc.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                locationIds.includes(loc.id)
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-200 text-gray-500'
              }`}
            >
              {loc.name}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 mt-1">
          {locationIds.length === 0
            ? 'Nenhuma marcada = vale em todas as lojas.'
            : `Vale só nas ${locationIds.length} loja(s) marcada(s) acima.`}
        </p>
      </Field>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-2 mt-1">
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600"
        >
          Cancelar
        </button>
        <button
          onClick={handleSubmit}
          disabled={isSaving}
          className="flex-1 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-semibold disabled:opacity-50"
        >
          {isSaving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-gray-500">{label}</span>
      {children}
    </label>
  );
}
