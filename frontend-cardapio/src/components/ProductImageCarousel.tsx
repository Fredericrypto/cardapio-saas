import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { swipeDirection, wrapIndex } from '../lib/productImages';

// Carrossel de fotos de um ITEM do cardápio (estilo Instagram). Só é usado em
// ProductCard e ProductDetailPage — promoções continuam com a imagem única.
//
//  - 0 ou 1 foto: devolve só a <img> (o mesmo markup de antes) — sem setas, sem
//    bolinhas, sem timers.
//  - 2 a 5 fotos: slide horizontal com loop infinito, autoplay a cada 5 s,
//    setas sutis, bolinhas pequenas num fundo translúcido e arrastar com o dedo.
//
// O autoplay só roda quando faz sentido: card visível na tela, aba em primeiro
// plano, sem mouse em cima, sem dedo tocando, sem foco nos controles e sem
// "reduzir movimento" ligado no aparelho. Qualquer navegação (seta, arrastar)
// reinicia a contagem dos 5 s.

export const CAROUSEL_AUTOPLAY_MS = 5000;
const SLIDE_MS = 380;

interface ProductImageCarouselProps {
  // Já normalizada (getProductImages): sem vazias nem repetidas, no máximo 5.
  images: string[];
  alt: string;
  // 'card' = setas pequenas (grade de 2 colunas); 'detail' = setas maiores.
  size?: 'card' | 'detail';
  // O ProductCard inteiro é um <button>: <button> dentro de <button> é HTML
  // inválido, então nesse caso as setas viram <span role="button">.
  nestedInButton?: boolean;
  // Classes extras das fotos (indisponível = cinza, loja fechada = atenuado).
  imgClassName?: string;
  autoplayMs?: number;
  // Quando informado, quem usa o carrossel CONTROLA o autoplay: roda só enquanto
  // for true (ex.: card do cardápio, que só anda com o mouse em cima do card) e a
  // pausa por mouse em cima da foto deixa de existir. Sem ele: autoplay sempre
  // ligado e pausado com o mouse em cima (tela do item).
  playing?: boolean;
}

interface View {
  index: number;
  // Foto que está saindo durante a transição (null = parado).
  prev: number | null;
  dir: 1 | -1;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function ProductImageCarousel(props: ProductImageCarouselProps) {
  const { images, alt, imgClassName = '' } = props;
  if (images.length === 0) return null;
  if (images.length === 1) {
    return <img src={images[0]} alt={alt} className={`w-full h-full object-cover ${imgClassName}`} />;
  }
  // A key zera o estado quando a lista de fotos muda (ex.: o dono trocou fotos).
  return <CarouselSlides key={images.join('|')} {...props} />;
}

function CarouselSlides({
  images,
  alt,
  size = 'card',
  nestedInButton = false,
  imgClassName = '',
  autoplayMs = CAROUSEL_AUTOPLAY_MS,
  playing: controlledPlaying,
}: ProductImageCarouselProps) {
  const count = images.length;
  const [view, setView] = useState<View>({ index: 0, prev: null, dir: 1 });
  const [inView, setInView] = useState<boolean>(() => typeof IntersectionObserver === 'undefined');
  const [docVisible, setDocVisible] = useState<boolean>(() => typeof document === 'undefined' || !document.hidden);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [touching, setTouching] = useState(false);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const currentRef = useRef<HTMLDivElement | null>(null);
  const outgoingRef = useRef<HTMLDivElement | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const draggedRef = useRef(false);

  // Navegação. Enquanto uma transição está rolando, o pedido é ignorado (evita
  // "pulo" visual); o autoplay e os toques rápidos continuam consistentes.
  const go = useCallback(
    (delta: 1 | -1) => {
      setView((v) => (v.prev !== null ? v : { index: wrapIndex(v.index + delta, count), prev: v.index, dir: delta }));
    },
    [count],
  );

  // Transição: a foto nova entra de um lado e a antiga sai pelo outro. Roda antes
  // da pintura, então o primeiro quadro já está na posição inicial (sem flash).
  useLayoutEffect(() => {
    if (view.prev === null) return;
    const incoming = currentRef.current;
    const outgoing = outgoingRef.current;
    if (!incoming || !outgoing || typeof incoming.animate !== 'function') {
      setView((v) => (v.prev === null ? v : { ...v, prev: null }));
      return;
    }
    const options: KeyframeAnimationOptions = {
      duration: prefersReducedMotion() ? 0 : SLIDE_MS,
      easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
      fill: 'both',
    };
    const enter = incoming.animate(
      [{ transform: `translateX(${view.dir * 100}%)` }, { transform: 'translateX(0)' }],
      options,
    );
    const leave = outgoing.animate(
      [{ transform: 'translateX(0)' }, { transform: `translateX(${-view.dir * 100}%)` }],
      options,
    );
    let cancelled = false;
    enter.finished.then(
      () => {
        if (!cancelled) setView((v) => (v.prev === null ? v : { ...v, prev: null }));
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
      enter.cancel();
      leave.cancel();
    };
  }, [view.index, view.prev, view.dir]);

  // Só anima quando o card está (quase) visível na tela.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const last = entries[entries.length - 1];
        if (last) setInView(last.isIntersecting);
      },
      { threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Aba em segundo plano: pausa.
  useEffect(() => {
    const onChange = () => setDocVisible(!document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  // Autoplay: um timer por foto exibida. Mudou a foto (autoplay ou manual) =
  // contagem de 5 s recomeça do zero.
  const allowed = controlledPlaying === undefined ? !hovered : controlledPlaying;
  const playing = allowed && inView && docVisible && !focused && !touching;
  useEffect(() => {
    if (!playing || prefersReducedMotion()) return;
    const timer = window.setTimeout(() => go(1), autoplayMs);
    return () => window.clearTimeout(timer);
  }, [playing, view.index, go, autoplayMs]);

  // Pré-carrega a próxima foto para a transição não mostrar um quadro vazio.
  const nextSrc = images[wrapIndex(view.index + 1, count)];
  useEffect(() => {
    if (!inView) return;
    const preload = new Image();
    preload.src = nextSrc;
  }, [inView, nextSrc]);

  // ---- Arrastar (touch, caneta e mouse) -------------------------------------
  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    startRef.current = { x: e.clientX, y: e.clientY };
    draggedRef.current = false;
    setTouching(true);
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const start = startRef.current;
    if (start && Math.abs(e.clientX - start.x) > 10) draggedRef.current = true;
  }
  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const start = startRef.current;
    startRef.current = null;
    setTouching(false);
    if (!start) return;
    const direction = swipeDirection(e.clientX - start.x, e.clientY - start.y);
    if (direction !== 0) go(direction);
  }
  function onPointerCancel() {
    startRef.current = null;
    setTouching(false);
  }
  // Depois de ARRASTAR, o clique que o navegador gera não pode abrir o item
  // (o card inteiro é clicável). Toque simples continua passando normalmente.
  function onClickCapture(e: ReactMouseEvent<HTMLDivElement>) {
    if (!draggedRef.current) return;
    draggedRef.current = false;
    e.stopPropagation();
    e.preventDefault();
  }

  const slides = view.prev === null ? [view.index] : [view.prev, view.index];

  return (
    <div
      ref={rootRef}
      role="group"
      aria-roledescription="carrossel"
      aria-label={`Fotos de ${alt}`}
      className="absolute inset-0 overflow-hidden touch-pan-y select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') setHovered(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse') setHovered(false);
        startRef.current = null;
        setTouching(false);
      }}
      // Só foco de TECLADO pausa (clicar numa seta com o mouse também a foca, e
      // isso não pode travar o autoplay para sempre).
      onFocus={(e) => setFocused(e.target.matches(':focus-visible'))}
      onBlur={() => setFocused(false)}
      onClickCapture={onClickCapture}
    >
      {slides.map((i) => (
        <div key={i} ref={i === view.index ? currentRef : outgoingRef} className="absolute inset-0" data-slide={i}>
          <img
            src={images[i]}
            alt={`${alt} — foto ${i + 1} de ${count}`}
            draggable={false}
            className={`w-full h-full object-cover ${imgClassName}`}
          />
        </div>
      ))}

      <Arrow side="left" label="Foto anterior" size={size} asSpan={nestedInButton} onActivate={() => go(-1)} />
      <Arrow side="right" label="Próxima foto" size={size} asSpan={nestedInButton} onActivate={() => go(1)} />

      <div
        aria-hidden="true"
        data-dots
        className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-black/30 px-1.5 py-1 pointer-events-none"
      >
        {images.map((_, i) => (
          <span
            key={i}
            data-dot={i === view.index ? 'active' : 'idle'}
            className={`block rounded-full transition-all duration-300 ${
              i === view.index ? 'w-1.5 h-1.5 bg-white' : 'w-[5px] h-[5px] bg-white/50'
            }`}
          />
        ))}
      </div>
      <span className="sr-only">{`Foto ${view.index + 1} de ${count}`}</span>
    </div>
  );
}

interface ArrowProps {
  side: 'left' | 'right';
  label: string;
  size: 'card' | 'detail';
  asSpan: boolean;
  onActivate: () => void;
}

function Arrow({ side, label, size, asSpan, onActivate }: ArrowProps) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  const box = size === 'card' ? 'w-6 h-6' : 'w-8 h-8';
  const className = `absolute top-1/2 -translate-y-1/2 ${side === 'left' ? 'left-1.5' : 'right-1.5'} ${box} rounded-full flex items-center justify-center bg-black/25 text-white hover:bg-black/40 active:scale-90 transition`;
  const icon = <Icon size={size === 'card' ? 14 : 18} strokeWidth={1.5} />;
  // A seta não pode abrir o item (clique) nem iniciar um arrastar (pointerdown).
  const onClick = (e: ReactMouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onActivate();
  };
  const onPointerDown = (e: ReactPointerEvent) => e.stopPropagation();

  if (asSpan) {
    return (
      <span role="button" aria-label={label} data-arrow={side} onClick={onClick} onPointerDown={onPointerDown} className={className}>
        {icon}
      </span>
    );
  }
  return (
    <button type="button" aria-label={label} data-arrow={side} onClick={onClick} onPointerDown={onPointerDown} className={className}>
      {icon}
    </button>
  );
}
