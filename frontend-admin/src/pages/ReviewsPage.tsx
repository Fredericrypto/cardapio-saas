import { useEffect, useMemo, useState } from 'react';
import { Star, MessageSquare, Send, User } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { fetchAdminReviews, fetchReviewsSummary, respondToReview, fetchLocations } from '../lib/admin-api';
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
export function ReviewsPage() {
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationFilter, setLocationFilter] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);

  async function load() {
    const [s, r, locs] = await Promise.all([
      fetchReviewsSummary(),
      fetchAdminReviews({ locationId: locationFilter }),
      fetchLocations(),
    ]);
    setSummary(s);
    setReviews(r);
    setLocations(locs);
    setIsLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationFilter]);

  const chartData = useMemo(() => {
    if (!summary) return [];
    return [5, 4, 3, 2, 1].map((n) => ({
      stars: `${n}★`,
      count: summary.distribution[n as 1 | 2 | 3 | 4 | 5],
    }));
  }, [summary]);

  return (
    <div className="p-6 max-w-3xl mx-auto flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-display font-bold flex items-center gap-2">
          <Star size={22} className="text-amber-500" fill="#F59E0B" />
          Avaliações
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Só clientes que realmente fizeram o pedido podem avaliar — uma avaliação por pedido, e
          fica lá permanentemente, boa ou ruim.
        </p>
      </div>

      {summary && (
        <div className="bg-white border border-gray-100 rounded-xl p-5 flex flex-col sm:flex-row gap-5">
          <div className="flex flex-col items-center justify-center gap-1 sm:border-r sm:border-gray-100 sm:pr-5 shrink-0">
            <p className="text-4xl font-bold text-gray-900">
              {summary.count > 0 ? summary.average.toFixed(1) : '—'}
            </p>
            {summary.count > 0 && <Stars rating={Math.round(summary.average)} size={16} />}
            <p className="text-xs text-gray-400">
              {summary.count} {summary.count === 1 ? 'avaliação' : 'avaliações'}
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

      {isLoading && <p className="text-sm text-gray-400 py-8 text-center">Carregando...</p>}

      {!isLoading && reviews.length === 0 && (
        <p className="text-sm text-gray-400 py-12 text-center">Nenhuma avaliação por aqui ainda.</p>
      )}

      <div className="flex flex-col gap-3">
        {reviews.map((review) => (
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
              {review.isAnonymous && (
                <span className="text-[10px] font-normal text-gray-400">(publicou anônimo)</span>
              )}
            </p>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
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
