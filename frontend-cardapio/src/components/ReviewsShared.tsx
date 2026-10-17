import { activeDateLocale } from '../i18n/languages';
import { useI18n } from '../i18n/I18nContext';
import { memo, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { ArrowLeft, ChevronDown, Star, User } from 'lucide-react';
import type { PublicReview, ReviewSummary } from '../lib/customer-api';
import { useTenant } from '../contexts/TenantContext';
import { MENU_BORDER, MENU_PAGE_BG, MENU_SURFACE, MENU_TEXT, MENU_TEXT_BODY, MENU_TEXT_MUTED, MENU_TEXT_SOFT } from '../lib/menuTheme';
import { PAGE_CONTAINER } from '../lib/profileTheme';
import { FoodBackdrop } from './FoodBackdrop';
import { GlassCard } from './GlassCard';
import { GlowButton } from './GlowButton';
import { LikeButton } from './LikeButton';
import { ReviewFilter } from './ReviewFilter';
import type { RatingFilterValue } from './ReviewFilter';
import './review-extras.css';
import { Tooltip } from './Tooltip';
import { VerifiedBadge } from './VerifiedBadge';

// Peças visuais ÚNICAS das telas de avaliação: a do restaurante
// (PublicReviewsPage) e a de cada item (ItemReviewsPage) usam exatamente
// o mesmo padrão — nota geral + distribuição, cards de avaliação e a
// resposta do restaurante. Visual: o mesmo fundo de ícones de comida do
// cardápio (FoodBackdrop) e cartões de vidro com glow (GlassCard) da tela de
// login do painel, nos temas claro e escuro.

export function formatReviewDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(activeDateLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5" role="img" aria-label={`${rating}/5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          aria-hidden="true"
          fill={n <= rating ? '#F59E0B' : 'transparent'}
          className={n <= rating ? 'text-amber-500' : 'text-[#D1D5DB] dark:text-white/20'}
        />
      ))}
    </div>
  );
}

// Cliente tem avatar (predefinido, escolhido no perfil) — mostra a foto
// de verdade quando a review não é anônima e o cliente tem uma
// escolhida; cai pro círculo colorido com a inicial só quando não tem
// avatar definido. Anônimo sempre ganha o ícone neutro cinza, nunca a
// foto real — mesma regra de privacidade de sempre.
const AVATAR_COLORS = ['#F59E0B', '#EF4444', '#8B5CF6', '#10B981', '#3B82F6', '#EC4899'];
export function ReviewerAvatar({
  name,
  avatarUrl,
  isAnonymous,
  isVerified,
  size = 32,
}: {
  name: string;
  avatarUrl: string | null;
  isAnonymous: boolean;
  isVerified: boolean;
  size?: number;
}) {
  const box = { width: size, height: size };
  if (isAnonymous) {
    return (
      <div
        className="rounded-full bg-gray-200 dark:bg-white/10 flex items-center justify-center shrink-0"
        style={box}
      >
        <User size={Math.round(size / 2)} className="text-gray-400" />
      </div>
    );
  }
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const colorIndex = name.charCodeAt(0) % AVATAR_COLORS.length;
  return (
    <div className="relative shrink-0">
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="rounded-full object-cover bg-gray-100 dark:bg-white/10" style={box} />
      ) : (
        <div
          className={`rounded-full flex items-center justify-center text-white font-bold ${size >= 40 ? 'text-sm' : 'text-xs'}`}
          style={{ ...box, backgroundColor: AVATAR_COLORS[colorIndex] }}
        >
          {initial}
        </div>
      )}
      {isVerified && (
        <span className="absolute -bottom-0.5 -right-0.5">
          <VerifiedBadge size={12} />
        </span>
      )}
    </div>
  );
}

// Resposta do restaurante: identificada SÓ pelo nome do restaurante e
// pela foto dele — na mesma janelinha QUADRADA de cantos arredondados do
// perfil do restaurante (nunca redonda, que é o formato dos avatares de
// cliente) — seguidos do texto da resposta. `glass` = variante para cima
// de cartão de vidro (claro/escuro); sem ele, o visual original (usado por
// "Minhas avaliações").
export function RestaurantResponse({
  responseText,
  className = '',
  glass = false,
}: {
  responseText: string;
  className?: string;
  glass?: boolean;
}) {
  const { t } = useI18n();
  const { tenant } = useTenant();
  return (
    <div
      className={`${
        glass
          ? 'bg-black/[0.03] dark:bg-white/[0.05] rounded-xl px-3.5 py-3 border border-[#E5E7EB] dark:border-white/10'
          : 'bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100'
      } ${className}`}
    >
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg border-2 border-white dark:border-white/15 shadow-sm bg-white overflow-hidden shrink-0">
          {tenant?.logoUrl ? (
            <img src={tenant.logoUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-white text-xs font-bold"
              style={{ backgroundColor: tenant?.primaryColor }}
            >
              {tenant?.name?.[0]?.toUpperCase()}
            </div>
          )}
        </div>
        <p className={`text-xs font-semibold truncate ${glass ? MENU_TEXT_SOFT : 'text-gray-700'}`}>
          {tenant?.name ?? t('reviewsShared.restaurante')}
        </p>
      </div>
      <p className={`text-sm mt-2 ${glass ? MENU_TEXT_SOFT : 'text-gray-700'}`}>{responseText}</p>
    </div>
  );
}

function ReviewCardImpl({ review }: { review: PublicReview }) {
  return (
    <GlassCard radius={20} cursorGlow={false} flat bodyClassName="p-4 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <ReviewerAvatar
            name={review.customerDisplayName}
            avatarUrl={review.customerAvatarUrl}
            isAnonymous={review.isAnonymous}
            isVerified={review.customerIsVerified}
            size={40}
          />
          <div className="min-w-0">
            <p className={`flex items-center gap-1 text-sm font-semibold ${MENU_TEXT}`}>
              <span className="truncate">{review.customerDisplayName}</span>
              {review.customerIsVerified && <VerifiedBadge size={13} />}
            </p>
            <p className={`text-xs ${MENU_TEXT_MUTED}`}>{formatReviewDate(review.createdAt)}</p>
          </div>
        </div>
        <Stars rating={review.rating} size={15} />
      </div>
      {review.comment && (
        <p className={`mt-3 break-words text-sm leading-relaxed ${MENU_TEXT_SOFT}`}>{review.comment}</p>
      )}
      {review.response && <RestaurantResponse glass responseText={review.response.responseText} className="mt-3" />}
      <div className="mt-4 flex justify-start">
        <LikeButton
          reviewId={review.id}
          initialCount={review.likeCount ?? 0}
          initialLiked={review.likedByMe ?? false}
        />
      </div>
    </GlassCard>
  );
}

// Cartão de destaque: nota geral + distribuição por estrelas. Em telas grandes fica
// fixo na coluna da esquerda enquanto a lista rola ao lado.
// memo: a lista não re-renderiza todos os cartões a cada mudança de carregando/filtro.
export const ReviewCard = memo(ReviewCardImpl);

function SummaryBody({ summary, row = false }: { summary: ReviewSummary; row?: boolean }) {
  const { t } = useI18n();
  const hasReviews = summary.count > 0;
  return (
    <div className={`flex items-center gap-5 ${row ? '' : 'lg:flex-col lg:items-stretch lg:gap-6'}`}>
      <div className={`shrink-0 text-center ${row ? '' : 'lg:pt-1'}`}>
        <p className={`font-display text-5xl font-bold leading-none ${MENU_TEXT}`}>
          {hasReviews ? summary.average.toFixed(1) : '0.0'}
        </p>
        {hasReviews && (
          <div className="mt-2.5 flex justify-center">
            <Stars rating={Math.round(summary.average)} size={18} />
          </div>
        )}
        <p className={`mt-2 text-xs ${MENU_TEXT_MUTED}`}>
          {summary.count} {summary.count === 1 ? t('reviewsShared.avaliacao') : t('reviewsShared.avaliacoes_2')}
        </p>
      </div>
      <div className="flex flex-1 flex-col gap-2">
        {[5, 4, 3, 2, 1].map((n) => {
          const count = summary.distribution[n as 1 | 2 | 3 | 4 | 5];
          const pct = hasReviews ? (count / summary.count) * 100 : 0;
          return (
            <div key={n} className="flex items-center gap-2">
              <span className={`w-3 text-right text-[11px] font-semibold tabular-nums ${MENU_TEXT_BODY}`}>{n}</span>
              <Star size={11} fill="#F59E0B" className="shrink-0 text-amber-500" aria-hidden="true" />
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/10">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #FBBF24, #F59E0B)' }}
                />
              </div>
              <span className={`w-6 text-right text-[11px] tabular-nums ${MENU_TEXT_MUTED}`}>{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryCard({ summary }: { summary: ReviewSummary }) {
  return (
    <GlassCard orbit cursorGlow={false} radius={28} className="lg:sticky lg:top-24" bodyClassName="p-5 md:p-6">
      <SummaryBody summary={summary} />
    </GlassCard>
  );
}

// Esqueletos enquanto a primeira página carrega (no lugar do vazio de antes).
function SummarySkeleton() {
  return (
    <GlassCard radius={28} cursorGlow={false} className="lg:sticky lg:top-24" bodyClassName="p-5 md:p-6">
      <div className="flex animate-pulse items-center gap-5 lg:flex-col lg:items-stretch lg:gap-6" aria-hidden="true">
        <div className="mx-auto h-24 w-24 rounded-2xl bg-black/[0.06] dark:bg-white/10" />
        <div className="flex flex-1 flex-col gap-2.5 self-stretch">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-2 rounded-full bg-black/[0.06] dark:bg-white/10" />
          ))}
        </div>
      </div>
    </GlassCard>
  );
}

function ReviewSkeleton() {
  return (
    <GlassCard radius={20} cursorGlow={false} flat bodyClassName="p-4 md:p-5">
      <div className="flex animate-pulse flex-col gap-3" aria-hidden="true">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-black/[0.06] dark:bg-white/10" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="h-3 w-1/3 rounded-full bg-black/[0.06] dark:bg-white/10" />
            <div className="h-2.5 w-1/5 rounded-full bg-black/[0.06] dark:bg-white/10" />
          </div>
        </div>
        <div className="h-3 w-full rounded-full bg-black/[0.06] dark:bg-white/10" />
        <div className="h-3 w-2/3 rounded-full bg-black/[0.06] dark:bg-white/10" />
      </div>
    </GlassCard>
  );
}

// Em telas largas ocupa exatamente o que sobra da janela (da posição onde começa até o rodapé),
// então a PÁGINA não rola: só o que for `overflow-y-auto` lá dentro. Abaixo de 1024px não faz
// nada (fluxo normal, a página rola). A altura é medida, não chutada, p/ não depender da navbar.
function FillViewport({ children, className = '', bottom = 24 }: { children: ReactNode; className?: string; bottom?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = () => {
      if (!mq.matches) {
        setHeight(null);
        return;
      }
      const top = el.getBoundingClientRect().top + window.scrollY;
      setHeight(Math.max(440, Math.round(window.innerHeight - top - bottom)));
    };
    update();
    window.addEventListener('resize', update);
    mq.addEventListener('change', update);
    return () => {
      window.removeEventListener('resize', update);
      mq.removeEventListener('change', update);
    };
  }, [bottom]);
  return (
    <div ref={ref} className={className} style={height ? { height } : undefined}>
      {children}
    </div>
  );
}

// Página completa de avaliações (cabeçalho com voltar, nota geral com a distribuição, filtro por
// nota, lista de cards e "Ver mais"). A do restaurante e a de cada item usam este mesmo layout.
//  - COM `hero` (página do restaurante): grid assimétrico no desktop — hero à esquerda (fixo) e,
//    à direita, UM painel de vidro com os pontos de luz na borda contendo resumo + filtro + lista.
//  - SEM `hero` (página de item): layout de sempre (nota geral à esquerda, lista ao lado).
// Celular: uma coluna. A navbar vem do NavLayout; aqui só o conteúdo e o fundo.
export function ReviewsPageLayout({
  subtitle,
  onBack,
  summary,
  reviews,
  total,
  isLoading,
  onLoadMore,
  hero,
  ratingFilter = 0,
  onRatingFilterChange,
}: {
  subtitle?: string;
  onBack: () => void;
  summary: ReviewSummary | null;
  reviews: PublicReview[];
  total: number;
  isLoading: boolean;
  onLoadMore: () => void;
  hero?: ReactNode;
  ratingFilter?: RatingFilterValue;
  onRatingFilterChange?: (v: RatingFilterValue) => void;
}) {
  const { t } = useI18n();
  const { tenant } = useTenant();
  const heading = subtitle ?? tenant?.name;
  const showSide = summary !== null || isLoading;
  const firstLoad = isLoading && reviews.length === 0;
  const filtering = ratingFilter !== 0;
  const wide = !hero; // sem hero a lista pode ter 2 colunas em telas largas

  const filterBar = onRatingFilterChange ? (
    <ReviewFilter value={ratingFilter} onChange={onRatingFilterChange} summary={summary} />
  ) : null;

  const list = (
    // `key` = filtro: ao trocar, a lista remonta e os cartões entram de novo, escalonados.
    <div
      key={`f-${ratingFilter}`}
      aria-busy={isLoading}
      className={`rv-stagger grid grid-cols-1 gap-3 transition-opacity duration-200 ${wide ? 'xl:grid-cols-2 xl:gap-4' : ''} ${
        isLoading && reviews.length > 0 ? 'opacity-60' : 'opacity-100'
      }`}
    >
      {firstLoad && [0, 1, 2].map((i) => <ReviewSkeleton key={i} />)}

      {!isLoading && reviews.length === 0 && (
        <div className={wide ? 'xl:col-span-2' : ''}>
          <GlassCard radius={20} cursorGlow={false} flat bodyClassName="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <Star size={28} strokeWidth={1.5} className={MENU_TEXT_MUTED} aria-hidden="true" />
            <p className={`text-sm ${MENU_TEXT_BODY}`}>
              {filtering ? t('reviewsFilter.empty') : t('reviewsShared.ainda_nao_ha_avaliacoes')}
            </p>
          </GlassCard>
        </div>
      )}

      {reviews.map((review, i) => (
        <div key={review.id} style={{ '--rv-i': Math.min(i, 8) } as CSSProperties}>
          <ReviewCard review={review} />
        </div>
      ))}

      {reviews.length > 0 && reviews.length < total && (
        <div className={`flex justify-center pt-2 ${wide ? 'xl:col-span-2' : ''}`}>
          <GlowButton
            onClick={onLoadMore}
            loading={isLoading}
            icon={<ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />}
          >
            {isLoading ? t('common.loading') : t('reviewsShared.ver_mais_avaliacoes')}
          </GlowButton>
        </div>
      )}
    </div>
  );

  const header = (
    <div className="mb-5 flex items-center gap-3 md:mb-8 lg:mb-6 print:hidden">
      <Tooltip label={t('common.back')}>
        <button
          onClick={onBack}
          aria-label={t('common.back')}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${MENU_SURFACE} ${MENU_BORDER} ${MENU_TEXT} transition-colors hover:bg-black/[0.03] dark:hover:bg-white/5`}
        >
          <ArrowLeft size={20} strokeWidth={1.5} />
        </button>
      </Tooltip>
      <div className="min-w-0">
        <h1 className={`font-display text-lg font-bold leading-tight md:text-2xl ${MENU_TEXT}`}>
          {t('reviewsShared.avaliacoes')}
        </h1>
        {heading && <p className={`truncate text-xs md:text-sm ${MENU_TEXT_MUTED}`}>{heading}</p>}
      </div>
    </div>
  );

  return (
    <div
      className={`relative isolate ${hero ? 'lg:min-h-0 lg:pb-6' : ''} min-h-screen ${MENU_PAGE_BG} pb-10 md:pb-16 print:bg-white`}
    >
      <FoodBackdrop />
      <div className={PAGE_CONTAINER}>
        {hero ? (
          // Desktop: a página não rola. Esquerda (voltar + título + mensagens) parada; só a lista
          // de avaliações, dentro do painel, rola. Sem divisórias entre os lados.
          <FillViewport className="lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12 xl:gap-24">
            <div className="mb-10 lg:mb-0 lg:min-h-0 xl:-ml-14 2xl:-ml-24">
              {header}
              {hero}
            </div>
            <GlassCard
              orbit
              cursorGlow={false}
              radius={28}
              className="rv-panel lg:h-full"
              bodyClassName="flex flex-col gap-4 p-4 md:p-6 lg:h-full lg:min-h-0"
            >
              <div className="flex flex-col gap-4 lg:shrink-0">
                {summary ? (
                  <SummaryBody summary={summary} row />
                ) : (
                  showSide && <div className="h-24 animate-pulse rounded-2xl bg-black/[0.06] dark:bg-white/10" aria-hidden="true" />
                )}
                {filterBar}
              </div>
              <div key={`s-${ratingFilter}`} className="rv-scroll lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                {list}
              </div>
            </GlassCard>
          </FillViewport>
        ) : (
          <>
            {header}
            <div className={showSide ? 'lg:grid lg:grid-cols-[21rem_minmax(0,1fr)] lg:items-start lg:gap-8' : ''}>
              {showSide && (
                <div className="mb-4 lg:mb-0">{summary ? <SummaryCard summary={summary} /> : <SummarySkeleton />}</div>
              )}
              <div className="flex flex-col gap-3">
                {filterBar}
                {list}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
