import { useEffect, useRef, useState } from 'react';
import { Percent, Plus, Trash2, Pencil, ImagePlus, Clock, Users } from 'lucide-react';
import {
  fetchPromotions,
  createPromotion,
  updatePromotion,
  deletePromotion,
  uploadPromotionImage,
  fetchCategories,
  fetchProducts,
  fetchLocations,
  fetchPromotionRedemptions,
  fetchPromotionCustomerUsage,
  resetPromotionCustomerUsage,
  resetPromotionAllUsage,
} from '../lib/admin-api';
import type { PromotionPayload } from '../lib/admin-api';
import { MaskedNumberField } from '../components/MaskedNumberField';
import type {
  Promotion,
  Category,
  Product,
  Location,
  PromotionRedemption,
  PromotionCustomerUsage,
} from '../types';

function money(value: number): string {
  return `R$ ${Number(value).toFixed(2).replace('.', ',')}`;
}

function formatCurrency(raw: string): string {
  const num = Number(raw);
  return Number.isNaN(num) ? '' : money(num);
}

function formatPercent(raw: string): string {
  const num = Number(raw);
  return Number.isNaN(num) ? '' : `${num}%`;
}

function discountLabel(promo: Promotion): string {
  return promo.discountType === 'percentage'
    ? `${promo.discountValue}% off`
    : `${money(promo.discountValue)} off`;
}

function scopeLabel(promo: Promotion): string {
  if (promo.scope === 'category') {
    const names = promo.categories.map((c) => c.name).join(', ');
    return names ? `Só em: ${names}` : 'Categoria (nenhuma escolhida)';
  }
  if (promo.scope === 'product') {
    const names = promo.products.map((p) => p.name).join(', ');
    return names ? `Só em: ${names}` : 'Produto (nenhum escolhido)';
  }
  return 'Todos os itens do cardápio';
}

// Igual ao datetime-local do input HTML (sem segundos, sem timezone).
function toDatetimeLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// "Termina em 2h 15min" / "Começa em 3 dias" / nada se não tiver janela
// de validade — a mesma contagem regressiva que o cliente vê no
// cardápio, só que aqui é o admin conferindo se está configurada certo.
function ValidityBadge({ promo }: { promo: Promotion }) {
  const now = useNow(30000);

  if (!promo.startsAt && !promo.endsAt) return null;

  if (promo.startsAt && new Date(promo.startsAt).getTime() > now) {
    const diffMs = new Date(promo.startsAt).getTime() - now;
    const hours = Math.floor(diffMs / 3600000);
    return (
      <span className="text-[11px] text-gray-400 flex items-center gap-1">
        <Clock size={11} /> Começa em {hours < 48 ? `${hours}h` : `${Math.floor(hours / 24)} dias`}
      </span>
    );
  }

  if (promo.endsAt) {
    const diffMs = new Date(promo.endsAt).getTime() - now;
    if (diffMs <= 0) {
      return (
        <span className="text-[11px] text-red-400 flex items-center gap-1">
          <Clock size={11} /> Expirada
        </span>
      );
    }
    const totalHours = diffMs / 3600000;
    if (totalHours >= 48) {
      const days = Math.floor(totalHours / 24);
      return (
        <span className="text-[11px] text-orange-500 font-semibold flex items-center gap-1">
          <Clock size={11} />
          Termina em {days} dias
        </span>
      );
    }
    const hours = Math.floor(diffMs / 3600000);
    const minutes = Math.floor((diffMs % 3600000) / 60000);
    return (
      <span className="text-[11px] text-orange-500 font-semibold flex items-center gap-1">
        <Clock size={11} />
        Termina em {hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`}
      </span>
    );
  }

  return null;
}

// Drill-down "quem usou essa promoção" — pedido, cliente e quanto foi
// descontado em cada um. Só busca quando o admin abre (não precisa
// carregar isso pra toda promoção da lista o tempo todo).
function RedemptionsPanel({
  promotionId,
  usageLimitPerCustomer,
  usageResetAt,
  usageCountBeforeReset,
}: {
  promotionId: string;
  usageLimitPerCustomer: number | null;
  usageResetAt: string | null;
  usageCountBeforeReset: number | null;
}) {
  const [redemptions, setRedemptions] = useState<PromotionRedemption[] | null>(null);
  const [customerUsage, setCustomerUsage] = useState<PromotionCustomerUsage[] | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmingAll, setConfirmingAll] = useState(false);
  const [resettingAll, setResettingAll] = useState(false);

  function loadAll() {
    fetchPromotionRedemptions(promotionId).then(setRedemptions);
    // Só faz sentido buscar/mostrar uso por cliente se a promoção TEM
    // limite por cliente — sem limite, não existe "reset" (não há nada
    // travando o cliente pra devolver).
    if (usageLimitPerCustomer != null) {
      fetchPromotionCustomerUsage(promotionId).then(setCustomerUsage);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promotionId]);

  async function handleReset(customerId: string) {
    setResettingId(customerId);
    try {
      await resetPromotionCustomerUsage(promotionId, customerId);
      setConfirmingId(null);
      loadAll();
    } finally {
      setResettingId(null);
    }
  }

  async function handleResetAll() {
    setResettingAll(true);
    try {
      await resetPromotionAllUsage(promotionId);
      setConfirmingAll(false);
      loadAll();
    } finally {
      setResettingAll(false);
    }
  }

  if (redemptions === null) {
    return <p className="text-xs text-gray-400 mt-2">Carregando pedidos...</p>;
  }

  return (
    <div className="mt-2 flex flex-col gap-3">
      {usageLimitPerCustomer != null && (
        <div>
          <div className="flex items-center justify-between mb-1 gap-2">
            <p className="text-[11px] font-semibold text-gray-500">
              Uso por cliente (limite: {usageLimitPerCustomer}x)
            </p>
            {confirmingAll ? (
              <div className="flex items-center gap-1.5 shrink-0 text-[11px]">
                <span className="text-gray-500">Reiniciar pra TODOS os clientes?</span>
                <button
                  onClick={handleResetAll}
                  disabled={resettingAll}
                  className="text-red-600 font-semibold underline underline-offset-2 disabled:opacity-50"
                >
                  {resettingAll ? 'Confirmando...' : 'Confirmar'}
                </button>
                <button
                  onClick={() => setConfirmingAll(false)}
                  className="text-gray-400 underline underline-offset-2"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingAll(true)}
                className="text-[11px] text-gray-600 font-semibold underline underline-offset-2 shrink-0"
              >
                Resetar pra todos
              </button>
            )}
          </div>
          {usageResetAt && (
            <p className="text-[11px] text-gray-400 mb-1.5">
              Última vez que resetou pra todos: {new Date(usageResetAt).toLocaleString('pt-BR')}
              {usageCountBeforeReset != null && ` · ${usageCountBeforeReset} cliente(s) tinham usado até lá`}
            </p>
          )}
          {customerUsage === null ? (
            <p className="text-xs text-gray-400">Carregando...</p>
          ) : customerUsage.length === 0 ? (
            <p className="text-xs text-gray-400">Nenhum cliente usou essa promoção ainda.</p>
          ) : (
            <div className="border border-gray-100 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto">
              {customerUsage.map((c) => {
                const reachedLimit = c.usedCount >= (c.usageLimitPerCustomer ?? Infinity);
                return (
                  <div key={c.customerId} className="flex items-center justify-between px-3 py-2 text-xs gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-700 truncate">
                        {c.customerName}
                        {c.lastUsedLocationName && (
                          <span className="font-normal text-gray-400"> · {c.lastUsedLocationName}</span>
                        )}
                      </p>
                      <p className={reachedLimit ? 'text-red-500 font-semibold' : 'text-gray-400'}>
                        {c.usedCount}/{c.usageLimitPerCustomer}x usado · último em{' '}
                        {new Date(c.lastUsedAt).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    {confirmingId === c.customerId ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-gray-500">Reiniciar pra esse cliente?</span>
                        <button
                          onClick={() => handleReset(c.customerId)}
                          disabled={resettingId === c.customerId}
                          className="text-red-600 font-semibold underline underline-offset-2 disabled:opacity-50"
                        >
                          {resettingId === c.customerId ? 'Confirmando...' : 'Confirmar'}
                        </button>
                        <button
                          onClick={() => setConfirmingId(null)}
                          className="text-gray-400 underline underline-offset-2"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmingId(c.customerId)}
                        className="text-gray-600 font-semibold underline underline-offset-2 shrink-0"
                      >
                        Resetar uso
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div>
        {usageLimitPerCustomer != null && (
          <p className="text-[11px] font-semibold text-gray-500 mb-1">Todos os pedidos</p>
        )}
        {redemptions.length === 0 ? (
          <p className="text-xs text-gray-400">Nenhum pedido usou essa promoção ainda.</p>
        ) : (
          <div className="border border-gray-100 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
            {redemptions.map((r) => (
              <div key={r.orderId} className="flex items-center justify-between px-3 py-2 text-xs">
                <div>
                  <p className="font-semibold text-gray-700">
                    {r.customerName ?? 'Cliente sem nome'}
                    {r.locationName && <span className="font-normal text-gray-400"> · {r.locationName}</span>}
                  </p>
                  <p className="text-gray-400">{new Date(r.createdAt).toLocaleString('pt-BR')}</p>
                </div>
                <span className="text-red-500 font-semibold">- {money(r.discountAmount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Promoções de verdade, no molde iFood/McDonald's: banner com foto,
// escopo (tudo / categoria / produto), limite de uso por cliente, teto
// global de usos, e validade com contagem regressiva. O desconto é
// SEMPRE recalculado no backend na hora do pedido — nunca confia em
// nada vindo do cliente.
export function PromotionsSettingsPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedStatsId, setExpandedStatsId] = useState<string | null>(null);

  async function load() {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [promos, cats, prods, locs] = await Promise.all([
        fetchPromotions(),
        fetchCategories(),
        fetchProducts(),
        fetchLocations(),
      ]);
      setPromotions(promos);
      setCategories(cats);
      setProducts(prods);
      setLocations(locs);
    } catch {
      // Causa mais comum: a migration "AddPromotions" ainda não rodou
      // no backend (tabela `promotions` não existe ainda).
      setLoadError(
        'Não foi possível carregar as promoções. Confere se o backend está rodando e se a migration mais recente já foi aplicada (npm run migration:run).',
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleToggleActive(promo: Promotion) {
    const updated = await updatePromotion(promo.id, { isActive: !promo.isActive });
    setPromotions((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover esta promoção? Ela some do cardápio imediatamente.')) return;
    await deletePromotion(id);
    await load();
  }

  if (isLoading) {
    return <div className="p-6 text-sm text-gray-400">Carregando...</div>;
  }

  if (loadError) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="font-display text-xl font-bold text-gray-900 mb-4">Promoções</h1>
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex flex-col gap-3">
          <p className="text-sm text-red-600">{loadError}</p>
          <button
            onClick={load}
            className="self-start bg-gray-900 text-white text-xs font-semibold px-3 py-2 rounded-lg"
          >
            Tentar de novo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="font-display text-xl font-bold text-gray-900 mb-1">Promoções</h1>
      <p className="text-xs text-gray-400 mb-6">
        Aparecem como cards no cardápio do cliente, com foto, escopo e validade — igual
        iFood/McDonald's. O cliente escolhe usar (ou não) no carrinho, igual um cupom — nunca é
        aplicada sozinha. O cálculo de verdade é sempre feito no servidor.
      </p>

      <div className="flex flex-col gap-3 mb-6">
        {promotions.length === 0 && (
          <p className="text-sm text-gray-400 border border-dashed border-gray-200 rounded-xl p-4 text-center">
            Nenhuma promoção cadastrada ainda.
          </p>
        )}

        {promotions.map((promo) =>
          editingId === promo.id ? (
            <PromotionForm
              key={promo.id}
              initial={promo}
              categories={categories}
              products={products}
              locations={locations}
              onCancel={() => setEditingId(null)}
              onSave={(payload) => updatePromotion(promo.id, payload)}
              onDone={async () => {
                setEditingId(null);
                await load();
              }}
            />
          ) : (
            <div
              key={promo.id}
              className="bg-white border border-gray-100 rounded-xl overflow-hidden"
            >
              <div className="relative h-28 bg-gray-100">
                {promo.imageUrl ? (
                  <img src={promo.imageUrl} alt={promo.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300">
                    <Percent size={28} />
                  </div>
                )}
                {!promo.isActive && (
                  <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                    <span className="text-xs font-bold text-gray-500 bg-white px-2 py-0.5 rounded-full shadow-sm">
                      Desativada
                    </span>
                  </div>
                )}
              </div>

              <div className="p-3.5 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900">{promo.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {discountLabel(promo)}
                    {promo.minOrderValue > 0 && ` · pedido mínimo ${money(promo.minOrderValue)}`}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{scopeLabel(promo)}</p>
                  {promo.description && (
                    <p className="text-xs text-gray-400 mt-0.5">{promo.description}</p>
                  )}

                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <ValidityBadge promo={promo} />
                    {promo.usageLimitPerCustomer != null && (
                      <span className="text-[11px] text-gray-400 flex items-center gap-1">
                        <Users size={11} />
                        Limite {promo.usageLimitPerCustomer}x por cliente
                      </span>
                    )}
                    {/* Contador corrido, sem teto — ver reasoning na
                        migration RecomputeRedemptionCountAndDropMaxRedemptions:
                        uma promoção pode (e geralmente deve) ser usada por
                        quantos clientes diferentes aparecerem, só o limite
                        por cliente acima controla abuso. */}
                    {promo.redemptionCount > 0 && (
                      <span className="text-[11px] text-gray-400">
                        {promo.redemptionCount} usados
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => setExpandedStatsId(expandedStatsId === promo.id ? null : promo.id)}
                    className="text-[11px] font-semibold text-gray-700 mt-2 underline underline-offset-2"
                  >
                    {/* Mesma fonte (redemptionCount) decide as DUAS frases —
                        antes "descontado" vinha de uma soma separada
                        (totalDiscountGiven) que podia ficar fora de sincronia
                        e mostrar "ainda não foi usada" ao lado de "1/1
                        usados" ao mesmo tempo. Nunca mais duas fontes pra
                        mesmo fato. */}
                    {promo.redemptionCount > 0
                      ? `${money(promo.totalDiscountGiven)} descontados no total · ver pedidos`
                      : 'Ainda não foi usada'}
                  </button>

                  {expandedStatsId === promo.id && (
                    <RedemptionsPanel
                      promotionId={promo.id}
                      usageLimitPerCustomer={promo.usageLimitPerCustomer}
                      usageResetAt={promo.usageResetAt}
                      usageCountBeforeReset={promo.usageCountBeforeReset}
                    />
                  )}
                </div>

                <div className="flex flex-col items-end gap-2 shrink-0">
                  <button
                    onClick={() => handleToggleActive(promo)}
                    className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${
                      promo.isActive ? 'bg-green-500' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                        promo.isActive ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setEditingId(promo.id)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-50"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(promo.id)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ),
        )}
      </div>

      {isCreating ? (
        <PromotionForm
          categories={categories}
          products={products}
          locations={locations}
          onCancel={() => setIsCreating(false)}
          onSave={(payload) => createPromotion(payload)}
          onDone={async () => {
            setIsCreating(false);
            await load();
          }}
        />
      ) : (
        <button
          onClick={() => setIsCreating(true)}
          className="w-full bg-gray-900 text-white rounded-lg py-3 flex items-center justify-center gap-1.5 text-sm font-semibold"
        >
          <Plus size={16} />
          Nova promoção
        </button>
      )}
    </div>
  );
}

function PromotionForm({
  initial,
  categories,
  products,
  locations,
  onSave,
  onCancel,
  onDone,
}: {
  initial?: Promotion;
  categories: Category[];
  products: Product[];
  locations: Location[];
  onSave: (payload: PromotionPayload) => Promise<Promotion>;
  onCancel: () => void;
  onDone: (final: Promotion) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>(
    initial?.discountType ?? 'percentage',
  );
  const [discountValue, setDiscountValue] = useState(
    initial ? String(initial.discountValue) : '',
  );
  const [maxDiscountAmount, setMaxDiscountAmount] = useState(
    initial?.maxDiscountAmount ? String(initial.maxDiscountAmount) : '',
  );
  const [minOrderValue, setMinOrderValue] = useState(
    initial?.minOrderValue ? String(initial.minOrderValue) : '',
  );
  const [scope, setScope] = useState<'all' | 'category' | 'product'>(initial?.scope ?? 'all');
  const [categoryIds, setCategoryIds] = useState<string[]>(
    initial?.categories.map((c) => c.id) ?? [],
  );
  const [productIds, setProductIds] = useState<string[]>(
    initial?.products.map((p) => p.id) ?? [],
  );
  const [locationIds, setLocationIds] = useState<string[]>(
    initial?.locations.map((l) => l.id) ?? [],
  );
  const [allowReuseAcrossLocations, setAllowReuseAcrossLocations] = useState(
    initial?.allowReuseAcrossLocations ?? false,
  );
  const [hasCustomerLimit, setHasCustomerLimit] = useState(initial?.usageLimitPerCustomer != null);
  const [usageLimitPerCustomer, setUsageLimitPerCustomer] = useState(
    initial?.usageLimitPerCustomer ? String(initial.usageLimitPerCustomer) : '1',
  );
  const [hasMaxEligibleQuantity, setHasMaxEligibleQuantity] = useState(
    initial?.maxEligibleQuantity != null,
  );
  const [maxEligibleQuantity, setMaxEligibleQuantity] = useState(
    initial?.maxEligibleQuantity ? String(initial.maxEligibleQuantity) : '1',
  );
  // Trava de quantidade não existe pra escopo "todos os itens" (ver
  // campo escondido acima) — se o admin tinha marcado com outro escopo
  // e volta pra "todos", desmarca sozinho pra não mandar um valor
  // fantasma que não tem mais campo visível pra editar.
  useEffect(() => {
    if (scope === 'all' && hasMaxEligibleQuantity) {
      setHasMaxEligibleQuantity(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);
  const [startsAt, setStartsAt] = useState(toDatetimeLocal(initial?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(toDatetimeLocal(initial?.endsAt ?? null));
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imagePreview, setImagePreview] = useState(initial?.imageUrl ?? null);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Foto pode ser escolhida ANTES de a promoção existir — fica só como
  // preview local (object URL) e é enviada de verdade logo depois que
  // "Salvar" cria/atualiza a promoção (ver handleSubmit). Antes, só dava
  // pra subir foto editando de novo uma promoção já salva — chato e sem
  // necessidade.
  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function toggleInArray(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  async function handleSubmit() {
    setError(null);
    if (!title.trim()) {
      setError('Dê um título pra promoção (ex: "50% off").');
      return;
    }
    const value = Number(discountValue);
    if (!value || value <= 0) {
      setError('Informe um valor de desconto maior que zero.');
      return;
    }
    if (discountType === 'percentage' && value > 100) {
      setError('Desconto percentual não pode passar de 100%.');
      return;
    }
    const maxDiscount = Number(maxDiscountAmount);
    if (discountType === 'percentage' && (!maxDiscount || maxDiscount <= 0)) {
      setError('Promoção percentual precisa de um teto de desconto em R$ (ex: "50% off, até R$15").');
      return;
    }
    if (scope === 'category' && categoryIds.length === 0) {
      setError('Escolha ao menos uma categoria.');
      return;
    }
    if (scope === 'product' && productIds.length === 0) {
      setError('Escolha ao menos um produto.');
      return;
    }

    setIsSaving(true);
    try {
      const saved = await onSave({
        title: title.trim(),
        description: description.trim() || undefined,
        discountType,
        discountValue: value,
        maxDiscountAmount: discountType === 'percentage' ? maxDiscount : undefined,
        minOrderValue: minOrderValue ? Number(minOrderValue) : 0,
        scope,
        categoryIds: scope === 'category' ? categoryIds : [],
        productIds: scope === 'product' ? productIds : [],
        locationIds,
        allowReuseAcrossLocations,
        usageLimitPerCustomer: hasCustomerLimit ? Number(usageLimitPerCustomer) || 1 : 0,
        // Sem teto de usos NO TOTAL — só o limite por cliente acima
        // controla abuso. Manda 0 sempre pra "limpar" qualquer valor
        // antigo que uma promoção já tenha (a UI de configurar isso
        // foi removida — ver migration RecomputeRedemptionCountAndDropMaxRedemptions).
        maxRedemptions: 0,
        maxEligibleQuantity: hasMaxEligibleQuantity ? Number(maxEligibleQuantity) || 1 : 0,
        isActive: initial?.isActive ?? true,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      });

      let final = saved;
      if (pendingImageFile) {
        setIsUploadingImage(true);
        try {
          final = await uploadPromotionImage(saved.id, pendingImageFile);
        } finally {
          setIsUploadingImage(false);
        }
      }
      onDone(final);
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      setError(message ?? 'Não foi possível salvar essa promoção.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 flex flex-col gap-3">
      <div>
        <label className="text-xs font-semibold text-gray-500 block mb-1">Foto do banner</label>
        <button
          type="button"
          disabled={isUploadingImage}
          onClick={() => fileInputRef.current?.click()}
          className="w-full h-28 rounded-xl border border-dashed border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden disabled:opacity-50"
        >
          {imagePreview ? (
            <img src={imagePreview} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-gray-400 text-xs flex flex-col items-center gap-1">
              <ImagePlus size={20} />
              Escolher foto
            </span>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleImageChange}
        />
        {scope === 'product' && productIds.length === 1 && !imagePreview && (
          <p className="text-[11px] text-gray-400 mt-1">
            Sem foto própria, o card usa a foto do produto escolhido.
          </p>
        )}
      </div>

      <Field label="Título (aparece no card do cardápio)">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex: 50% off"
          className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full"
        />
      </Field>

      <Field label="Descrição (opcional)">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ex: Só hoje, aproveite!"
          className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full"
        />
      </Field>

      <div className="flex gap-3">
        <Field label="Tipo de desconto">
          <select
            value={discountType}
            onChange={(e) => setDiscountType(e.target.value as 'percentage' | 'fixed')}
            className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full bg-white"
          >
            <option value="percentage">Percentual (%)</option>
            <option value="fixed">Valor fixo (R$)</option>
          </select>
        </Field>
        <Field label={discountType === 'percentage' ? 'Percentual' : 'Valor (R$)'}>
          <MaskedNumberField
            value={discountValue}
            onChange={setDiscountValue}
            formatDisplay={discountType === 'percentage' ? formatPercent : formatCurrency}
            placeholder={discountType === 'percentage' ? '50' : '10'}
            className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full"
          />
        </Field>
      </div>

      {discountType === 'percentage' && (
        <Field label="Desconto máximo (R$) — obrigatório, evita desconto sem limite em pedidos grandes">
          <MaskedNumberField
            value={maxDiscountAmount}
            onChange={setMaxDiscountAmount}
            formatDisplay={formatCurrency}
            placeholder="Ex: 15"
            className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full"
          />
        </Field>
      )}

      <Field label="Pedido mínimo (R$) — vale sobre o carrinho inteiro, não só o item elegível">
        <MaskedNumberField
          value={minOrderValue}
          onChange={setMinOrderValue}
          formatDisplay={formatCurrency}
          placeholder="Sem mínimo"
          className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full"
        />
      </Field>

      <div>
        <label className="text-xs font-semibold text-gray-500 block mb-1.5">
          Em quais lojas vale
        </label>
        <div className="flex flex-wrap gap-1.5">
          {locations.length === 0 && (
            <p className="text-xs text-gray-400">Nenhuma loja cadastrada ainda.</p>
          )}
          {locations.map((loc) => (
            <button
              type="button"
              key={loc.id}
              onClick={() => setLocationIds((prev) => toggleInArray(prev, loc.id))}
              className={`px-2.5 py-1 rounded-full text-xs border ${
                locationIds.includes(loc.id)
                  ? 'bg-red-50 border-red-200 text-red-600 font-semibold'
                  : 'bg-white border-gray-200 text-gray-500'
              }`}
            >
              {loc.name}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 mt-1">
          {locationIds.length === 0
            ? 'Nenhuma loja marcada = vale em todas.'
            : `Vale só nas ${locationIds.length} loja(s) marcada(s) acima.`}
        </p>
      </div>

      {locationIds.length > 1 && (
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={allowReuseAcrossLocations}
            onChange={(e) => setAllowReuseAcrossLocations(e.target.checked)}
          />
          Cliente pode usar em mais de uma dessas lojas (senão, usar em uma já conta o limite nas
          outras)
        </label>
      )}

      <div>
        <label className="text-xs font-semibold text-gray-500 block mb-1.5">
          Onde o desconto vale
        </label>
        <div className="flex gap-2">
          {(['all', 'category', 'product'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold border ${
                scope === s
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-500 border-gray-200'
              }`}
            >
              {s === 'all' ? 'Todos os itens' : s === 'category' ? 'Categoria' : 'Produto'}
            </button>
          ))}
        </div>

        {scope === 'category' && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {categories.length === 0 && (
              <p className="text-xs text-gray-400">Nenhuma categoria cadastrada ainda.</p>
            )}
            {categories.map((cat) => (
              <button
                type="button"
                key={cat.id}
                onClick={() => setCategoryIds((prev) => toggleInArray(prev, cat.id))}
                className={`px-2.5 py-1 rounded-full text-xs border ${
                  categoryIds.includes(cat.id)
                    ? 'bg-red-50 border-red-200 text-red-600 font-semibold'
                    : 'bg-white border-gray-200 text-gray-500'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}

        {scope === 'product' && (
          <div className="mt-2 flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
            {products.length === 0 && (
              <p className="text-xs text-gray-400">Nenhum produto cadastrado ainda.</p>
            )}
            {products.map((prod) => (
              <button
                type="button"
                key={prod.id}
                onClick={() => setProductIds((prev) => toggleInArray(prev, prod.id))}
                className={`px-2.5 py-1 rounded-full text-xs border ${
                  productIds.includes(prod.id)
                    ? 'bg-red-50 border-red-200 text-red-600 font-semibold'
                    : 'bg-white border-gray-200 text-gray-500'
                }`}
              >
                {prod.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <label className="flex items-center gap-2 text-xs text-gray-600">
        <input
          type="checkbox"
          checked={hasCustomerLimit}
          onChange={(e) => setHasCustomerLimit(e.target.checked)}
        />
        Limitar quantas vezes CADA cliente pode usar (ex: só na primeira compra)
      </label>
      {hasCustomerLimit && (
        <Field label="Quantas vezes por cliente (exige cliente logado)">
          <input
            type="number"
            min={1}
            value={usageLimitPerCustomer}
            onChange={(e) => setUsageLimitPerCustomer(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full"
          />
          {initial && initial.redemptionCount > 0 && (
            <p className="text-[11px] text-gray-400 mt-1">Já usada {initial.redemptionCount}x.</p>
          )}
        </Field>
      )}

      {/* Trava de quantidade só faz sentido pra "categoria" ou "produto"
          específico — travar "1 unidade" num cupom de "todos os itens"
          não tem significado claro (qual unidade, de qual produto?) e
          fazia o cálculo escolher meio que arbitrariamente o item mais
          caro do carrinho pra isolar, o que parecia "aleatório" pro
          cliente. Ver PromotionsService.eligibleSubtotalCents. */}
      {scope !== 'all' && (
        <>
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={hasMaxEligibleQuantity}
              onChange={(e) => setHasMaxEligibleQuantity(e.target.checked)}
            />
            Travar o desconto numa quantidade fixa de itens (ex: cupom vale só pra 1 unidade)
          </label>
          {hasMaxEligibleQuantity && (
            <Field label="Quantas unidades elegíveis recebem o desconto">
              <input
                type="number"
                min={1}
                value={maxEligibleQuantity}
                onChange={(e) => setMaxEligibleQuantity(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Sem marcar, o desconto escala com a quantidade (ex: 10% em toda a categoria). Marcando, o
                desconto fica travado nessas unidades mesmo se o cliente adicionar mais do mesmo item — as
                unidades com cupom aparecem isoladas no carrinho do cliente.
              </p>
            </Field>
          )}
        </>
      )}


      <div className="flex gap-3">
        <Field label="Começa em (opcional)">
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full"
          />
        </Field>
        <Field label="Termina em (opcional — vira contagem regressiva)">
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full"
          />
        </Field>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm font-semibold text-gray-600"
        >
          Cancelar
        </button>
        <button
          onClick={handleSubmit}
          disabled={isSaving || isUploadingImage}
          className="flex-1 bg-gray-900 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60"
        >
          {isUploadingImage ? 'Enviando foto...' : isSaving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
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
