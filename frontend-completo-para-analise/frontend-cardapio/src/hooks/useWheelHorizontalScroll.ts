import { useEffect } from 'react';

// Converte a roda do mouse (rolagem vertical) em rolagem horizontal fluida num
// container que rola na horizontal (abas de categorias, carrossel de promoções).
//
// Por que um listener nativo e não `onWheel` do React: o React registra
// `wheel` como passivo, e um handler passivo não pode chamar `preventDefault()`
// — sem isso a página rolaria na vertical ao mesmo tempo. Aqui o listener é
// registrado como `{ passive: false }`.
//
// Comportamento:
// - só age se o container realmente tem conteúdo escondido na horizontal
//   (no desktop o carrossel de promoções vira grade e o hook fica inerte);
// - gesto já horizontal (trackpad, shift+roda) e ctrl+roda (zoom) seguem o
//   padrão do navegador;
// - nas pontas (início/fim) a roda volta a rolar a PÁGINA, pra o cursor sobre
//   o container nunca "prender" a rolagem vertical;
// - a rolagem é suavizada por interpolação (sem interpolação, cada "clique" da
//   roda salta ~100 px de uma vez); com `prefers-reduced-motion` o salto é direto;
// - durante a animação o `scroll-snap` do container é suspenso (senão o
//   `snap-mandatory` puxa de volta pro card mais próximo a cada passo) e
//   restaurado ao terminar.
export function useWheelHorizontalScroll(
  ref: { readonly current: HTMLElement | null },
  enabled = true,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let target = 0;
    let frame = 0;
    let savedSnap: string | null = null;

    const suspendSnap = () => {
      if (savedSnap === null) {
        savedSnap = el.style.scrollSnapType;
        el.style.scrollSnapType = 'none';
      }
    };
    const restoreSnap = () => {
      if (savedSnap !== null) {
        el.style.scrollSnapType = savedSnap;
        savedSnap = null;
      }
    };

    const step = () => {
      const diff = target - el.scrollLeft;
      if (Math.abs(diff) <= 1) {
        el.scrollLeft = target;
        frame = 0;
        restoreSnap();
        return;
      }
      // Pelo menos 1 px por quadro: scrollLeft pode arredondar passos menores
      // que 1 px e a animação travaria antes de chegar no alvo.
      el.scrollLeft += Math.sign(diff) * Math.max(1, Math.abs(diff) * 0.22);
      frame = requestAnimationFrame(step);
    };

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;

      const max = el.scrollWidth - el.clientWidth;
      if (max <= 1) return;

      // deltaMode: 0 = pixels, 1 = linhas, 2 = páginas.
      const delta =
        event.deltaMode === 1
          ? event.deltaY * 16
          : event.deltaMode === 2
            ? event.deltaY * el.clientWidth
            : event.deltaY;

      const current = frame ? target : el.scrollLeft;
      if ((delta < 0 && current <= 0) || (delta > 0 && current >= max - 1)) return;

      event.preventDefault();

      if (reduceMotion) {
        el.scrollLeft = Math.min(max, Math.max(0, el.scrollLeft + delta));
        return;
      }

      if (!frame) target = el.scrollLeft;
      target = Math.round(Math.min(max, Math.max(0, target + delta)));
      suspendSnap();
      if (!frame) frame = requestAnimationFrame(step);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      if (frame) cancelAnimationFrame(frame);
      restoreSnap();
    };
  }, [ref, enabled]);
}
