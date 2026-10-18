import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { swipeDirection, wrapIndex } from '../lib/productImages';
import { CAROUSEL_AUTOPLAY_MS } from './ProductImageCarousel';
import { FullscreenOverlay } from './LogoViewer';
import { Tooltip } from './Tooltip';

// Foto(s) de um item em tela cheia (estilo Instagram). Usa a MESMA casca do
// logo/banner do restaurante (FullscreenOverlay: fundo escurecido com blur, fecha
// ao tocar fora ou no voltar do aparelho), então o resto da tela fica desfocado e
// só a foto em destaque.
//
// Diferente do carrossel do card: NÃO tem autoplay. Com 2+ fotos troca só pelas
// setas (ou teclado ←/→, ou arrastando o dedo) e mostra as bolinhas embaixo. Com
// 1 foto não tem setas nem bolinhas.
//
// Esc fecha SÓ o visualizador: o listener é em fase de captura e interrompe o
// evento, para não fechar também o painel/sheet que está por baixo.

interface ImageLightboxProps {
  // Já normalizada (getProductImages): sem vazias nem repetidas.
  images: string[];
  alt: string;
  // Foto que estava na tela quando o visualizador abriu.
  initialIndex?: number;
  onClose: () => void;
}

const FLOAT_BUTTON =
  'flex items-center justify-center rounded-full bg-black/45 text-[#FFFFFF] shadow-md backdrop-blur-sm transition ' +
  'hover:bg-black/65 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white';

export function ImageLightbox({ images, alt, initialIndex = 0, onClose }: ImageLightboxProps) {
  const { t } = useI18n();
  const count = images.length;
  const multi = count > 1;
  const [index, setIndex] = useState(() => wrapIndex(initialIndex, count));
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const [hold, setHold] = useState(false);
  const [docVisible, setDocVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const go = useCallback((delta: 1 | -1) => setIndex((i) => wrapIndex(i + delta, count)), [count]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopImmediatePropagation();
        onCloseRef.current();
      } else if (multi && event.key === 'ArrowLeft') {
        event.stopImmediatePropagation();
        go(-1);
      } else if (multi && event.key === 'ArrowRight') {
        event.stopImmediatePropagation();
        go(1);
      }
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [go, multi]);

  useEffect(() => {
    closeButtonRef.current?.focus({ preventScroll: true });
  }, []);

  // Pré-carrega as vizinhas para a troca não mostrar quadro vazio.
  useEffect(() => {
    if (!multi) return;
    for (const delta of [1, -1]) {
      const preload = new Image();
      preload.src = images[wrapIndex(index + delta, count)];
    }
  }, [index, images, count, multi]);

  useEffect(() => {
    const onChange = () => setDocVisible(!document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  useEffect(() => {
    if (!multi || hold || !docVisible) return;
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setTimeout(() => go(1), CAROUSEL_AUTOPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [multi, hold, docVisible, index, go]);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    startRef.current = { x: e.clientX, y: e.clientY };
    setHold(true);
  }
  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const start = startRef.current;
    startRef.current = null;
    setHold(false);
    if (!start || !multi) return;
    const direction = swipeDirection(e.clientX - start.x, e.clientY - start.y);
    if (direction !== 0) go(direction);
  }

  const counter = t('promotionMode.photoCounter', { n: index + 1, total: count });
  const prevLabel = t('promotionMode.photoPrev');
  const nextLabel = t('promotionMode.photoNext');

  return (
    <FullscreenOverlay label={alt} onClose={onClose}>
      <Tooltip label={t('promotionMode.closePhoto')} className="contents">
        <button
          ref={closeButtonRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label={t('promotionMode.closePhoto')}
          className={`absolute right-4 top-4 h-10 w-10 ${FLOAT_BUTTON}`}
        >
          <X size={20} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </Tooltip>

      <div className="relative flex max-w-full flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
        <div
          className="relative touch-pan-y select-none"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            startRef.current = null;
            setHold(false);
          }}
        >
          <img
            key={index}
            src={images[index]}
            alt={multi ? `${alt} — ${counter}` : alt}
            draggable={false}
            data-lightbox-image
            className="promo-fade-in block max-h-[78vh] max-w-[min(92vw,64rem)] rounded-2xl bg-black/20 object-contain shadow-2xl"
          />
          {multi && (
            <>
              <Tooltip label={prevLabel} className="contents">
                <button
                  type="button"
                  data-arrow="left"
                  aria-label={prevLabel}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => go(-1)}
                  className={`absolute left-2 top-1/2 h-11 w-11 -translate-y-1/2 ${FLOAT_BUTTON}`}
                >
                  <ChevronLeft size={22} strokeWidth={1.5} aria-hidden="true" />
                </button>
              </Tooltip>
              <Tooltip label={nextLabel} className="contents">
                <button
                  type="button"
                  data-arrow="right"
                  aria-label={nextLabel}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => go(1)}
                  className={`absolute right-2 top-1/2 h-11 w-11 -translate-y-1/2 ${FLOAT_BUTTON}`}
                >
                  <ChevronRight size={22} strokeWidth={1.5} aria-hidden="true" />
                </button>
              </Tooltip>
            </>
          )}
        </div>

        {multi && (
          <div aria-hidden="true" className="flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1.5">
            {images.map((_, i) => (
              <span
                key={i}
                data-dot={i === index ? 'active' : 'idle'}
                className={`block rounded-full transition-all duration-300 ${
                  i === index ? 'h-2 w-2 bg-white' : 'h-1.5 w-1.5 bg-white/50'
                }`}
              />
            ))}
          </div>
        )}
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {counter}
      </span>
    </FullscreenOverlay>
  );
}
