import { localizedField } from '../i18n/contentText';
import { useI18n } from '../i18n/I18nContext';
import { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import type { Promotion } from '../types';
import { CLOSED_MUTED_CLASS } from '../lib/storeStatus';
import { ShareButton } from './ShareButton';
import { useWheelHorizontalScroll } from '../hooks/useWheelHorizontalScroll';
import { Tooltip } from './Tooltip';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { PROMO_SERIF } from '../lib/promotionTheme';

interface PromoCardsProps {
  promotions: Promotion[];
  primaryColor: string;
  onSelect: (promotionId: string) => void;
  // Loja fechada: visual atenuado, mas o carrossel rola e os cards abrem normalmente.
  muted?: boolean;
  // Monta o link público de cada promoção; sem ele não há botão de compartilhar.
  buildShareUrl?: (promotionId: string) => string;
}

// "1h 20min" / "45min" / "2 dias" — countdown de verdade. Acima de 48h
// vira dias (evita mostrar algo tipo "600h restantes", que ninguém lê
// como tempo de verdade). Atualiza a cada minuto.
function useCountdownLabel(endsAt: string | null): string | null {
  const { t } = useI18n();
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!endsAt) {
      setLabel(null);
      return;
    }
    function tick() {
      const diffMs = new Date(endsAt!).getTime() - Date.now();
      if (diffMs <= 0) {
        setLabel(t('promoCards.encerrada'));
        return;
      }
      const totalHours = diffMs / 3600000;
      if (totalHours >= 48) {
        const days = Math.floor(totalHours / 24);
        setLabel(`${days} dias`);
        return;
      }
      const hours = Math.floor(diffMs / 3600000);
      const minutes = Math.floor((diffMs % 3600000) / 60000);
      setLabel(hours > 0 ? t('promoCards.hours_h_minutes_min', { hours: hours, minutes: minutes }) : `${minutes}min`);
    }
    tick();
    const interval = setInterval(tick, 60000);
    return () => clearInterval(interval);
  }, [endsAt]);

  return label;
}

// Cards grandes e tocáveis — tocar abre a tela de detalhe da promoção
// (foto grande, regras, botão "Usar promoção"), igual iFood. Foto
// própria ou herdada do produto vinculado (ver
// PromotionsService.attachDisplayImage). Só mostra promoções cadastradas
// de verdade, nunca inventa desconto.
// Slide automático: a cada 5 s o carrossel avança UM card; no fim volta ao começo. Só roda com
// 2+ promoções E quando elas não cabem de uma vez na tela (senão não há para onde deslizar).
// Pausa com o mouse/foco sobre um card, com toque/roda do usuário (8 s), com a aba escondida e
// com "reduzir movimento". Desktop e celular usam o mesmo carrossel horizontal.
const PROMO_SLIDE_MS = 5000;
const PROMO_MANUAL_HOLD_MS = 8000;

export function PromoCards({ promotions, primaryColor, onSelect, muted = false, buildShareUrl }: PromoCardsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef(false);
  const holdUntilRef = useRef(0);
  const wide = useMediaQuery('(min-width: 768px)');
  // Roda do mouse sobre o carrossel rola na horizontal só na janela estreita
  // (no desktop a roda continua rolando a página).
  useWheelHorizontalScroll(scrollRef, promotions.length > 0 && !wide);

  const count = promotions.length;
  useEffect(() => {
    if (count < 2) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => {
      const el = scrollRef.current;
      if (!el || hoverRef.current || document.hidden || Date.now() < holdUntilRef.current) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 2) return; // tudo cabe na tela: nada a deslizar
      if (el.scrollLeft >= max - 4) {
        el.scrollTo({ left: 0, behavior: 'smooth' });
        return;
      }
      const base = el.getBoundingClientRect().left;
      const pad = parseFloat(getComputedStyle(el).paddingLeft) || 0;
      const lefts = Array.from(el.children).map(
        (child) => (child as HTMLElement).getBoundingClientRect().left - base + el.scrollLeft,
      );
      const next = lefts.find((left) => left - pad > el.scrollLeft + 4);
      if (next === undefined) el.scrollTo({ left: 0, behavior: 'smooth' });
      else el.scrollTo({ left: Math.min(next - pad, max), behavior: 'smooth' });
    }, PROMO_SLIDE_MS);
    return () => window.clearInterval(id);
  }, [count]);

  if (count === 0) return null;

  const holdAutoSlide = () => {
    holdUntilRef.current = Date.now() + PROMO_MANUAL_HOLD_MS;
  };

  // pb-4 + -mb-3: o container rola na horizontal, o que corta a sombra no fundo; o respiro
  // embaixo (compensado pela margem negativa) deixa a sombra inteira aparecer.
  // Desktop (md+): também é carrossel (2/3 cards visíveis); o respiro de 2rem nas laterais e
  // embaixo (e 1,25rem em cima), compensado por margem negativa, deixa a luz ambiente aparecer.
  return (
    <div
      ref={scrollRef}
      onTouchStart={holdAutoSlide}
      onWheel={holdAutoSlide}
      className="flex gap-3 px-4 pt-1 pb-4 -mb-3 overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-pl-4 md:gap-4 md:-mx-8 md:px-8 md:-mt-5 md:pt-5 md:-mb-8 md:pb-8 md:scroll-pl-8"
    >
      {promotions.map((promo) => (
        <PromoCard
          key={promo.id}
          promo={promo}
          primaryColor={primaryColor}
          onSelect={onSelect}
          muted={muted}
          shareUrl={buildShareUrl?.(promo.id)}
          onHoverChange={(hovering) => {
            hoverRef.current = hovering;
          }}
        />
      ))}
    </div>
  );
}

function PromoCard({
  promo,
  primaryColor,
  onSelect,
  muted,
  shareUrl,
  onHoverChange,
}: {
  promo: Promotion;
  primaryColor: string;
  onSelect: (id: string) => void;
  muted: boolean;
  shareUrl?: string;
  onHoverChange: (hovering: boolean) => void;
}) {
  const { t } = useI18n();
  const countdownLabel = useCountdownLabel(promo.endsAt);

  const gradient = `linear-gradient(135deg, ${primaryColor}, ${primaryColor}99)`;

  return (
    // Invólucro = o item do carrossel/grade (leva as classes de tamanho e de
    // snap que antes ficavam no botão) + a luz ambiente do card, que fica ATRÁS
    // dele e só acende ao passar o mouse (ver .promo-ambient no index.css).
    // Cards em cinza (loja fechada / promoção já usada) não têm luz.
    <div
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') onHoverChange(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse') onHoverChange(false);
      }}
      onFocus={() => onHoverChange(true)}
      onBlur={() => onHoverChange(false)}
      className={`promo-item relative shrink-0 w-[290px] md:w-[calc((100%_-_1rem)/2)] lg:w-[calc((100%_-_2rem)/3)] h-40 md:h-44 snap-start ${muted || promo.alreadyUsedUp ? 'promo-item-quiet' : ''}`}
    >
      {promo.imageUrl ? (
        <img src={promo.imageUrl} alt="" aria-hidden="true" decoding="async" draggable={false} className="promo-ambient" />
      ) : (
        <span aria-hidden="true" className="promo-ambient" style={{ background: gradient }} />
      )}
    <button
      onClick={() => onSelect(promo.id)}
      className={`group atm-card w-full h-full rounded-2xl border border-black/5 dark:border-white/10 transition-[transform,box-shadow] overflow-hidden relative text-left active:scale-[0.98] ${muted ? CLOSED_MUTED_CLASS : ''}`}
    >
      <div className="relative h-full w-full">
        {promo.imageUrl ? (
          <img
            src={promo.imageUrl}
            alt={localizedField(promo, 'title')}
            className={`w-full h-full object-cover transition-transform duration-500 motion-reduce:transition-none md:group-hover:scale-[1.03] ${promo.alreadyUsedUp ? 'grayscale' : ''}`}
          />
        ) : (
          <div
            className="w-full h-full"
            style={{
              // Reflexo suave no canto superior esquerdo (longe do texto, que fica
              // embaixo) sobre o mesmo degradê de antes.
              background: `radial-gradient(120% 90% at 0% 0%, rgb(255 255 255 / 0.14), transparent 55%), ${gradient}`,
            }}
          />
        )}

        {/* Gradiente pra legibilidade do texto sobre a foto */}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(90deg, rgba(0,0,0,.72), rgba(0,0,0,.28) 58%, transparent), linear-gradient(0deg, rgba(0,0,0,.5), transparent 55%)' }}
        />

        {shareUrl && (
          <ShareButton
            variant="chip"
            className="absolute top-2 right-2"
            url={shareUrl}
            title={localizedField(promo, 'title')}
            text={promo.description ?? undefined}
          />
        )}

        {countdownLabel && !promo.alreadyUsedUp && (
          <span className="absolute top-2.5 left-2.5 bg-white text-orange-600 text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 shadow-sm">
            <Clock size={10} />
            {countdownLabel}
          </span>
        )}

        <div className="absolute inset-y-0 left-0 flex max-w-[78%] items-center p-4 md:p-5">
          <div className="min-w-0">
            <p className="text-[1.6rem] font-light italic leading-[1.05] text-white drop-shadow-sm md:text-[1.9rem]" style={{ fontFamily: PROMO_SERIF }}>
              {localizedField(promo, 'title')}
            </p>
            {promo.description && (
              // Descrição de uma linha: o balão com o texto completo só abre
              // quando ela está de fato cortada (reticências).
              <Tooltip label={localizedField(promo, 'description')} onlyIfTruncated className="block min-w-0">
                <p data-truncate className="mt-1.5 truncate text-[13px] leading-snug text-white/85">
                  {localizedField(promo, 'description')}
                </p>
              </Tooltip>
            )}
          </div>
        </div>

        {promo.alreadyUsedUp && (
          <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
            <span className="bg-white text-gray-700 text-xs font-bold px-3 py-1 rounded-full shadow-sm">
              {t('promoCards.voce_ja_usou_essa')}
            </span>
          </div>
        )}
      </div>

    </button>
    </div>
  );
}
