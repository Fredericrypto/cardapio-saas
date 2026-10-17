import { useCallback, useEffect, useRef, useState } from 'react';
import { ThumbsUp, Utensils } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useTenant } from '../contexts/TenantContext';
import { toggleReviewLike } from '../lib/customer-api';
import './review-extras.css';

const FOOD_ICON_MS = 2000;
const HINT_MS = 2400;

interface LikeButtonProps {
  reviewId: string;
  initialCount: number;
  initialLiked: boolean;
}

// Pílula de vidro (canto inferior esquerdo do cartão) com polegar + contador. Curtir alterna
// (otimista, com rollback se o servidor falhar) e dispara a micro-animação: o ícone dá um "pop",
// vira talheres (Utensils) por 2 s e volta ao polegar. Cada cartão tem o próprio estado; só
// cliente logado curte (visitante vê um aviso curto). Sem Framer Motion: CSS puro.
export function LikeButton({ reviewId, initialCount, initialLiked }: LikeButtonProps) {
  const { t } = useI18n();
  const { tenant } = useTenant();
  const { token } = useCustomerAuth();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [food, setFood] = useState(false);
  const [animated, setAnimated] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const busy = useRef(false);
  const foodTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Lista recarregada (ex.: nova avaliação publicada) → alinha com o que o servidor disse.
  useEffect(() => {
    setLiked(initialLiked);
    setCount(initialCount);
  }, [initialLiked, initialCount]);

  useEffect(
    () => () => {
      if (foodTimer.current) clearTimeout(foodTimer.current);
      if (hintTimer.current) clearTimeout(hintTimer.current);
    },
    [],
  );

  const showHint = useCallback((text: string) => {
    setHint(text);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(null), HINT_MS);
  }, []);

  const startFood = useCallback(() => {
    setAnimated(true);
    setFood(true);
    if (foodTimer.current) clearTimeout(foodTimer.current);
    foodTimer.current = setTimeout(() => setFood(false), FOOD_ICON_MS);
  }, []);

  async function handleClick() {
    if (!token || !tenant) {
      showHint(t('reviewLike.loginRequired'));
      return;
    }
    if (busy.current) return; // um pedido por vez neste cartão (duplo toque)
    busy.current = true;
    const prevLiked = liked;
    const prevCount = count;
    const nextLiked = !prevLiked;
    setLiked(nextLiked);
    setCount(Math.max(0, prevCount + (nextLiked ? 1 : -1)));
    if (nextLiked) startFood();
    else {
      setAnimated(true);
      setFood(false);
    }
    try {
      const res = await toggleReviewLike(tenant.id, token, reviewId);
      setLiked(res.liked);
      setCount(res.likeCount);
    } catch (err) {
      console.error('[like] falhou', (err as any)?.response?.status, (err as any)?.response?.data ?? err);
      setLiked(prevLiked);
      setCount(prevCount);
      setFood(false);
      showHint(t('reviewLike.error'));
    } finally {
      busy.current = false;
    }
  }

  const label = liked ? t('reviewLike.unlike') : t('reviewLike.like');

  return (
    <div className="relative inline-flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        aria-pressed={liked}
        aria-label={`${label}. ${count}`}
        className={`inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-xs font-semibold tabular-nums md:backdrop-blur-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d97757] ${
          liked
            ? 'border-[#d97757]/50 bg-[#d97757]/15 text-[#b85430] dark:text-[#f0a98d]'
            : 'border-black/10 bg-white/70 text-gray-600 hover:bg-white/80 md:bg-white/50 dark:border-white/15 dark:bg-white/[0.1] md:dark:bg-white/[0.07] dark:text-gray-300 dark:hover:bg-white/[0.12]'
        }`}
      >
        <span key={food ? 'food' : 'thumb'} className={animated ? 'rv-like-pop' : 'inline-flex'} aria-hidden="true">
          {food ? (
            <Utensils size={16} strokeWidth={1.75} />
          ) : (
            <ThumbsUp size={16} strokeWidth={1.75} fill={liked ? 'currentColor' : 'none'} />
          )}
        </span>
        <span>{count}</span>
      </button>
      <span role="status" aria-live="polite" className="text-[11px] text-gray-500 dark:text-gray-400">
        {hint}
      </span>
    </div>
  );
}
