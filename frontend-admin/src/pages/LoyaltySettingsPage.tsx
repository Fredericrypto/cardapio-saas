import { useEffect, useState } from 'react';
import { Gift, Plus, Trash2, Pencil, Users } from 'lucide-react';
import {
  fetchLoyaltyPrograms,
  createLoyaltyProgram,
  updateLoyaltyProgram,
  deleteLoyaltyProgram,
  fetchPendingLoyaltyRewards,
  fulfillLoyaltyReward,
  fetchLocations,
} from '../lib/admin-api';
import type { LoyaltyProgram, LoyaltyProgramPayload, LoyaltyReward, RewardType, Location } from '../types';

const REWARD_LABELS: Record<RewardType, string> = {
  sobremesa: 'Sobremesa',
  brinde: 'Brinde',
  camiseta: 'Camiseta',
  refeicao: 'Refeição',
  cashback: 'Cashback',
  desconto: 'Desconto',
  outro: 'Outro',
};

// Cartão fidelidade ("a cada N compras, ganha X") — decisão 100% do
// estabelecimento, nunca automático. Área SEPARADA de Promoções de
// propósito: são conceitos diferentes (desconto imediato vs. juntar ao
// longo do tempo), e misturar as duas telas confundiria mais do que
// ajudaria — mesmo raciocínio que levou a loja virar conceito próprio
// (LocationsSettingsPage) em vez de ficar dentro de Configurações.
export function LoyaltySettingsPage() {
  const [programs, setPrograms] = useState<LoyaltyProgram[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [pendingRewards, setPendingRewards] = useState<LoyaltyReward[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showRewardsQueue, setShowRewardsQueue] = useState(false);

  async function load() {
    const [progs, locs, rewards] = await Promise.all([
      fetchLoyaltyPrograms(),
      fetchLocations(),
      fetchPendingLoyaltyRewards(),
    ]);
    setPrograms(progs);
    setLocations(locs);
    setPendingRewards(rewards);
    setIsLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleToggleActive(program: LoyaltyProgram) {
    const updated = await updateLoyaltyProgram(program.id, { isActive: !program.isActive });
    setPrograms((prev) => prev.map((p) => (p.id === program.id ? updated : p)));
  }

  async function handleDelete(id: string) {
    await deleteLoyaltyProgram(id);
    setPrograms((prev) => prev.filter((p) => p.id !== id));
  }

  async function handleFulfill(rewardId: string) {
    await fulfillLoyaltyReward(rewardId);
    setPendingRewards((prev) => prev.filter((r) => r.id !== rewardId));
  }

  if (isLoading) {
    return <p className="text-sm text-gray-400 p-6">Carregando...</p>;
  }

  return (
    <div className="p-6 max-w-2xl mx-auto flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-bold flex items-center gap-2">
            <Gift size={22} />
            Fidelidade
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Cartão de carimbos — "a cada N compras, ganha X". Cada carimbo vem de um cupom real,
            confirmado na tela{' '}
            <span className="font-semibold">Verificar cupom</span>.
          </p>
        </div>
      </div>

      {pendingRewards.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <button
            onClick={() => setShowRewardsQueue((v) => !v)}
            className="w-full flex items-center justify-between text-sm font-semibold text-amber-800"
          >
            <span className="flex items-center gap-1.5">
              <Users size={15} />
              {pendingRewards.length} prêmio(s) esperando entrega
            </span>
            <span className="text-xs underline">{showRewardsQueue ? 'esconder' : 'ver'}</span>
          </button>
          {showRewardsQueue && (
            <div className="mt-2.5 flex flex-col gap-1.5">
              {pendingRewards.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between bg-white rounded-lg px-3 py-2 text-xs"
                >
                  <div>
                    <p className="font-semibold text-gray-700">{r.customer?.name ?? 'Cliente'}</p>
                    <p className="text-gray-400">
                      {r.program?.name} — {r.program?.rewardDescription}
                    </p>
                  </div>
                  <button
                    onClick={() => handleFulfill(r.id)}
                    className="text-green-700 font-semibold underline underline-offset-2 shrink-0"
                  >
                    Marcar entregue
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {programs.map((program) =>
        editingId === program.id ? (
          <ProgramForm
            key={program.id}
            initial={program}
            locations={locations}
            onCancel={() => setEditingId(null)}
            onSave={(payload) => updateLoyaltyProgram(program.id, payload)}
            onDone={async () => {
              setEditingId(null);
              await load();
            }}
          />
        ) : (
          <div key={program.id} className="bg-white border border-gray-100 rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-gray-900">{program.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  A cada {program.stampsRequired} pedido(s) → {REWARD_LABELS[program.rewardType]}:{' '}
                  {program.rewardDescription}
                </p>
                {program.description && (
                  <p className="text-xs text-gray-400 mt-1">{program.description}</p>
                )}
                <div className="flex items-center gap-2 mt-2 flex-wrap text-[11px] text-gray-400">
                  {program.minOrderValue > 0 && (
                    <span>
                      Pedido mínimo R$ {program.minOrderValue.toFixed(2).replace('.', ',')}
                    </span>
                  )}
                  <span>
                    {program.locations.length === 0
                      ? 'Todas as lojas'
                      : `Só em: ${program.locations.map((l) => l.name).join(', ')}`}
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <button
                  onClick={() => handleToggleActive(program)}
                  className={`text-[11px] font-semibold px-2 py-1 rounded-full ${
                    program.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {program.isActive ? 'Ativo' : 'Pausado'}
                </button>
                <div className="flex items-center gap-2">
                  <button onClick={() => setEditingId(program.id)} className="text-gray-400">
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => handleDelete(program.id)} className="text-gray-400">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ),
      )}

      {isCreating ? (
        <ProgramForm
          locations={locations}
          onCancel={() => setIsCreating(false)}
          onSave={(payload) => createLoyaltyProgram(payload as Required<LoyaltyProgramPayload>)}
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
          Novo programa de fidelidade
        </button>
      )}
    </div>
  );
}

function ProgramForm({
  initial,
  locations,
  onCancel,
  onSave,
  onDone,
}: {
  initial?: LoyaltyProgram;
  locations: Location[];
  onCancel: () => void;
  onSave: (payload: LoyaltyProgramPayload) => Promise<LoyaltyProgram>;
  onDone: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [stampsRequired, setStampsRequired] = useState(String(initial?.stampsRequired ?? 5));
  const [rewardType, setRewardType] = useState<RewardType>(initial?.rewardType ?? 'sobremesa');
  const [rewardDescription, setRewardDescription] = useState(initial?.rewardDescription ?? '');
  const [cashbackAmount, setCashbackAmount] = useState(
    initial?.cashbackAmount ? String(initial.cashbackAmount) : '',
  );
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>(
    initial?.discountType ?? 'percentage',
  );
  const [discountValue, setDiscountValue] = useState(
    initial?.discountValue ? String(initial.discountValue) : '',
  );
  const [minOrderValue, setMinOrderValue] = useState(
    initial?.minOrderValue ? String(initial.minOrderValue) : '',
  );
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
      setError('Dá um nome pro programa (ex: "Cartão Fidelidade Sobremesas").');
      return;
    }
    if (!rewardDescription.trim()) {
      setError('Descreve o que o cliente ganha (ex: "1 milkshake de chocolate").');
      return;
    }
    if (rewardType === 'cashback' && (!cashbackAmount || Number(cashbackAmount) <= 0)) {
      setError('Informa quanto de cashback o cliente ganha ao completar o cartão.');
      return;
    }
    if (rewardType === 'desconto' && (!discountValue || Number(discountValue) <= 0)) {
      setError('Informa o valor do desconto que o cliente ganha ao completar o cartão.');
      return;
    }

    setIsSaving(true);
    try {
      const saved = await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        stampsRequired: Number(stampsRequired) || 1,
        rewardType,
        rewardDescription: rewardDescription.trim(),
        cashbackAmount: rewardType === 'cashback' ? Number(cashbackAmount) : undefined,
        discountType: rewardType === 'desconto' ? discountType : undefined,
        discountValue: rewardType === 'desconto' ? Number(discountValue) : undefined,
        minOrderValue: minOrderValue ? Number(minOrderValue) : 0,
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
      <Field label="Nome do programa">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Cartão Fidelidade Sobremesas"
          className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full"
        />
      </Field>

      <Field label="Descrição (opcional, só pro seu controle)">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full"
        />
      </Field>

      <Field label="Quantos pedidos válidos pra ganhar o prêmio">
        <input
          type="number"
          min={1}
          value={stampsRequired}
          onChange={(e) => setStampsRequired(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full"
        />
        {initial && (
          <p className="text-[11px] text-gray-400 mt-1">
            Só dá pra aumentar depois de criado, nunca diminuir — evita descontar progresso que
            clientes já acumularam.
          </p>
        )}
      </Field>

      <Field label="O que o cliente ganha">
        <div className="grid grid-cols-4 gap-1.5">
          {(Object.keys(REWARD_LABELS) as RewardType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setRewardType(type)}
              className={`py-2 rounded-lg text-xs font-semibold border ${
                rewardType === type
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-200 text-gray-500'
              }`}
            >
              {REWARD_LABELS[type]}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Descrição do prêmio (aparece pro cliente)">
        <input
          value={rewardDescription}
          onChange={(e) => setRewardDescription(e.target.value)}
          placeholder={
            rewardType === 'cashback'
              ? 'Ex: R$10 de cashback'
              : rewardType === 'desconto'
                ? 'Ex: 20% off na próxima compra'
                : 'Ex: 1 milkshake de chocolate'
          }
          className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full"
        />
      </Field>

      {rewardType === 'cashback' && (
        <Field label="Valor do cashback (R$)">
          <input
            type="number"
            step="0.01"
            min={0.01}
            value={cashbackAmount}
            onChange={(e) => setCashbackAmount(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full"
          />
        </Field>
      )}

      {rewardType === 'desconto' && (
        <div className="flex gap-2">
          <Field label="Tipo">
            <select
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as 'percentage' | 'fixed')}
              className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full"
            >
              <option value="percentage">%</option>
              <option value="fixed">R$</option>
            </select>
          </Field>
          <Field label="Valor">
            <input
              type="number"
              step="0.01"
              min={0.01}
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full"
            />
          </Field>
        </div>
      )}

      <Field label="Pedido mínimo pra contar carimbo (opcional)">
        <input
          type="number"
          step="0.01"
          min={0}
          value={minOrderValue}
          onChange={(e) => setMinOrderValue(e.target.value)}
          placeholder="Sem mínimo"
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
