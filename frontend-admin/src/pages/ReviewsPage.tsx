import { useEffect, useMemo, useState } from 'react';
import { Star, MessageSquare, Send, User, Check } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import {
  fetchAdminReviews,
  fetchItemReviewStats,
  fetchReviewsSummary,
  respondToReview,
  fetchLocations,
  type ItemReviewStat,
} from '../lib/admin-api';
import type { AdminReview, ReviewSummary, Location } from '../types';

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          fill={n <= rating ? '#F59E0B' : 'transparent'}
          className={n <= rating ? 'text-amber-500' : 'text-gray-300'}
        />
      ))}
    </div>
  );
}

// Avaliações — depois de publicada, a review do cliente é IMUTÁVEL pra
// quem administra: não existe (de propósito) nenhum botão de ocultar,
// apagar ou editar nessa tela. O único jeito de uma review sumir é o
// PRÓPRIO cliente apagar a dele, do lado do app dele. Nota baixa fica,
// sempre — a média nunca é maquiada. O único poder de ação do
// estabelecimento aqui é RESPONDER publicamente.
type ReviewTab = 'restaurant' | 'item';

const TABS: { id: ReviewTab; label: string; description: string }[] = [
  {
    id: 'restaurant',
    label: 'Avaliações da Loja',
    description: 'Atendimento, tempo de entrega, embalagem e a experiência geral com o estabelecimento.',
  },
  {
    id: 'item',
    label: 'Avaliações de Itens / Pratos',
    description: 'O que os clientes acharam de cada prato ou produto pedido.',
  },
];

export function ReviewsPage() {
  const [tab, setTab] = useState<ReviewTab>('restaurant');
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [itemStats, setItemStats] = useState<ItemReviewStat[]>([]);
  const [productFilter, setProductFilter] = useState<string | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationFilter, setLocationFilter] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    fetchLocations().then(setLocations).catch(() => setLocations([]));
  }, []);

  // Cada aba busca SÓ o seu tipo, na unidade escolhida: a nota da loja nunca
  // mistura com a dos pratos, e trocar de loja refiltra as duas.
  async function load() {
    setLoadError(false);
    try {
      const filters = { locationId: locationFilter, targetType: tab } as const;
      const [s, r, stats] = await Promise.all([
        fetchReviewsSummary(filters),
        fetchAdminReviews(filters),
        tab === 'item' ? fetchItemReviewStats({ locationId: locationFilter }) : Promise.resolve([] as ItemReviewStat[]),
      ]);
      setSummary(s);
      setReviews(r);
      setItemStats(stats);
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    setIsLoading(true);
    setProductFilter(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationFilter, tab]);

  const chartData = useMemo(() => {
    if (!summary) return [];
    return [5, 4, 3, 2, 1].map((n) => ({
      stars: `${n}★`,
      count: summary.distribution[n as 1 | 2 | 3 | 4 | 5],
    }));
  }, [summary]);

  const visibleReviews = useMemo(() => {
    if (tab !== 'item' || !productFilter) return reviews;
    const name = itemStats.find((s) => s.productId === productFilter)?.productName;
    return name ? reviews.filter((r) => r.productName === name) : reviews;
  }, [tab, productFilter, reviews, itemStats]);

  const activeTab = TABS.find((t) => t.id === tab)!;

  return (
    <div className="p-6 max-w-3xl mx-auto flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-display font-bold flex items-center gap-2">
          <Star size={22} strokeWidth={1.5} className="text-amber-500" fill="#F59E0B" />
          Avaliações
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Só clientes que realmente fizeram o pedido podem avaliar — uma avaliação por pedido, e
          fica lá permanentemente, boa ou ruim.
        </p>
      </div>

      <div role="tablist" aria-label="Tipo de avaliação" className="flex gap-1 border-b border-gray-200 dark:border-white/10">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-semibold -mb-px border-b-2 transition-colors ${
              tab === t.id ? 'border-gray-900 text-gray-900 dark:border-white dark:text-white' : 'border-transparent text-gray-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-400 -mt-2">{activeTab.description}</p>

      {locations.length > 1 && (
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setLocationFilter(undefined)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
              locationFilter === undefined ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'
            }`}
          >
            Todas as lojas
          </button>
          {locations.map((loc) => (
            <button
              key={loc.id}
              onClick={() => setLocationFilter(loc.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                locationFilter === loc.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'
              }`}
            >
              {loc.name}
            </button>
          ))}
        </div>
      )}

      {summary && (
        <div className="bg-white border border-gray-100 rounded-xl p-5 flex flex-col sm:flex-row gap-5">
          <div className="flex flex-col items-center justify-center gap-1 sm:border-r sm:border-gray-100 sm:pr-5 shrink-0">
            <p className="text-4xl font-bold text-gray-900">
              {summary.count > 0 ? summary.average.toFixed(1) : '—'}
            </p>
            {summary.count > 0 && <Stars rating={Math.round(summary.average)} size={16} />}
            <p className="text-xs text-gray-400">
              {summary.count} {summary.count === 1 ? 'avaliação' : 'avaliações'}
              {tab === 'item' ? ' de itens' : ' da loja'}
            </p>
          </div>
          <div className="flex-1 h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 8 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="stars" width={28} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: '#F9FAFB' }} formatter={(v) => [`${v}`, 'avaliações']} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={14}>
                  {chartData.map((entry) => (
                    <Cell key={entry.stars} fill="#F59E0B" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {tab === 'item' && itemStats.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <p className="px-4 pt-3 pb-2 text-xs font-semibold text-gray-500">Por prato (toque para filtrar os comentários)</p>
          {itemStats.map((stat) => (
            <button
              key={stat.productId}
              onClick={() => setProductFilter((current) => (current === stat.productId ? null : stat.productId))}
              aria-pressed={productFilter === stat.productId}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left border-t border-gray-50 ${
                productFilter === stat.productId ? 'bg-gray-50' : ''
              }`}
            >
              <span className="flex-1 min-w-0 text-sm font-medium text-gray-800 truncate">{stat.productName}</span>
              <Stars rating={Math.round(stat.average)} size={12} />
              <span className="text-sm font-bold text-gray-900 w-8 text-right">{stat.average.toFixed(1)}</span>
              <span className="text-xs text-gray-400 w-20 text-right">
                {stat.count} {stat.count === 1 ? 'avaliação' : 'avaliações'}
              </span>
            </button>
          ))}
        </div>
      )}

      {isLoading && <p className="text-sm text-gray-400 py-8 text-center">Carregando...</p>}
      {loadError && !isLoading && (
        <p className="text-sm text-red-500 py-8 text-center">Não foi possível carregar as avaliações. Tente de novo.</p>
      )}

      {!isLoading && !loadError && visibleReviews.length === 0 && (
        <p className="text-sm text-gray-400 py-12 text-center">
          {tab === 'item' ? 'Nenhuma avaliação de prato por aqui ainda.' : 'Nenhuma avaliação da loja por aqui ainda.'}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {visibleReviews.map((review) => (
          <ReviewCard key={review.id} review={review} onChanged={load} />
        ))}
      </div>
    </div>
  );
}

function ReviewCard({ review, onChanged }: { review: AdminReview; onChanged: () => void }) {
  const [isResponding, setIsResponding] = useState(false);
  const [responseText, setResponseText] = useState(review.response?.responseText ?? '');
  const [isSaving, setIsSaving] = useState(false);

  async function handleRespond() {
    if (!responseText.trim()) return;
    setIsSaving(true);
    try {
      await respondToReview(review.id, responseText.trim());
      setIsResponding(false);
      onChanged();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Stars rating={review.rating} />
            <p className="text-sm font-semibold text-gray-900 truncate flex items-center gap-1">
              {review.isAnonymous && <User size={12} className="text-gray-400" />}
              {review.customerName}
              {review.customerIsVerified && (
                <span
                  className="inline-flex items-center justify-center rounded-full shrink-0"
                  style={{ backgroundColor: '#1D9BF0', width: 13, height: 13 }}
                  title="Cliente verificado"
                >
                  <Check size={8} className="text-white" strokeWidth={4} />
                </span>
              )}
              {review.isAnonymous && (
                <span className="text-[10px] font-normal text-gray-400">(publicou anônimo)</span>
              )}
            </p>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {review.targetType === 'item' && review.productName && (
              <span className="font-medium text-gray-500">Item: {review.productName} · </span>
            )}
            {review.locationName ? `${review.locationName} · ` : ''}
            {formatDateTime(review.createdAt)}
          </p>
        </div>
      </div>

      {review.comment && <p className="text-sm text-gray-700 mt-2.5">{review.comment}</p>}

      {review.response && !isResponding && (
        <div className="mt-2.5 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
          <p className="text-xs font-semibold text-gray-500">Sua resposta</p>
          <p className="text-sm text-gray-700 mt-0.5">{review.response.responseText}</p>
        </div>
      )}

      {isResponding ? (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={responseText}
            onChange={(e) => setResponseText(e.target.value)}
            placeholder="Agradeça ou responda com profissionalismo — fica visível pra todo mundo."
            maxLength={1000}
            rows={3}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none resize-none w-full"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setIsResponding(false)}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600"
            >
              Cancelar
            </button>
            <button
              onClick={handleRespond}
              disabled={isSaving || !responseText.trim()}
              className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5"
            >
              <Send size={12} />
              {review.response ? 'Atualizar resposta' : 'Publicar resposta'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsResponding(true)}
          className="mt-3 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 flex items-center gap-1.5"
        >
          <MessageSquare size={13} />
          {review.response ? 'Editar resposta' : 'Responder'}
        </button>
      )}
    </div>
  );
}
