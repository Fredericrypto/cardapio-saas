import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { useScrollLock } from '../../hooks/useScrollLock';
import { MENU_BORDER } from '../../lib/menuTheme';

// Arrastar o puxador mais que isto (px), ou soltar com velocidade, fecha.
const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 0.55; // px/ms
const EXIT_MS = 200;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface PromotionItemSheetProps {
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
}

// Bottom-sheet do celular/tablet: o mesmo painel do desktop, subindo de baixo.
// Comportamento de modal de verdade: trava a rolagem da página (regra 11),
// fecha no Esc / toque no fundo / arrastando o puxador, mantém o foco dentro,
// devolve o foco a quem o abriu e respeita "reduzir movimento".
export function PromotionItemSheet({ labelledBy, onClose, children }: PromotionItemSheetProps) {
  useScrollLock(true);

  const sheetRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  // Depois da entrada a classe de animação sai: com fill-mode `both` ela
  // seguraria o transform e o arrastar do puxador não moveria nada.
  const [entered, setEntered] = useState(false);
  const [dragY, setDragY] = useState(0);
  const drag = useRef<{ startY: number; startT: number; id: number } | null>(null);
  const closeRequested = useRef(false);

  // Animação de saída e só depois avisa o pai (que desmonta o sheet).
  const requestClose = useCallback(() => {
    if (closeRequested.current) return;
    closeRequested.current = true;
    if (prefersReducedMotion()) {
      onClose();
      return;
    }
    setClosing(true);
    window.setTimeout(onClose, EXIT_MS);
  }, [onClose]);

  // Foco: entra no sheet ao abrir; ao desmontar volta pro elemento anterior.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    sheetRef.current?.focus({ preventScroll: true });
    return () => {
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        requestClose();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [requestClose]);

  // Deslizar para baixo em qualquer parte do card minimiza. Regras: so conta gesto
  // VERTICAL para baixo; se o toque comecou numa area rolavel, so arrasta o card quando ela
  // ja esta no topo (senao e rolagem normal); gesto horizontal (carrossel de fotos) e de
  // quem o recebeu. Listener nativo nao-passivo: precisa de preventDefault para a pagina
  // nao rolar junto durante o arraste.
  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    let startX = 0;
    let startY = 0;
    let startT = 0;
    let tracking = false;
    let dragging = false;
    let scroller: HTMLElement | null = null;

    function findScroller(start: EventTarget | null): HTMLElement | null {
      let node = start instanceof HTMLElement ? start : null;
      while (node && node !== el) {
        const overflowY = getComputedStyle(node).overflowY;
        if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
        node = node.parentElement;
      }
      return null;
    }
    function onStart(event: TouchEvent) {
      if (closeRequested.current || event.touches.length !== 1) {
        tracking = false;
        return;
      }
      const touch = event.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      startT = performance.now();
      scroller = findScroller(event.target);
      tracking = true;
      dragging = false;
    }
    function onMove(event: TouchEvent) {
      if (!tracking) return;
      const touch = event.touches[0];
      const dy = touch.clientY - startY;
      const dx = touch.clientX - startX;
      if (!dragging) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (Math.abs(dx) > Math.abs(dy) || dy <= 0 || (scroller && scroller.scrollTop > 0)) {
          tracking = false;
          return;
        }
        dragging = true;
      }
      if (event.cancelable) event.preventDefault();
      setDragY(Math.max(0, dy));
    }
    function onEnd(event: TouchEvent) {
      if (!tracking) return;
      tracking = false;
      if (!dragging) return;
      dragging = false;
      const dy = Math.max(0, event.changedTouches[0].clientY - startY);
      const velocity = dy / Math.max(1, performance.now() - startT);
      if (dy > DISMISS_DISTANCE || (dy > 30 && velocity > DISMISS_VELOCITY)) requestClose();
      else setDragY(0);
    }
    function onCancel() {
      if (dragging) setDragY(0);
      tracking = false;
      dragging = false;
    }
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onCancel);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onCancel);
    };
  }, [requestClose]);

  function trapTab(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab' || !sheetRef.current) return;
    const nodes = Array.from(sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    );
    if (nodes.length === 0) {
      event.preventDefault();
      return;
    }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === sheetRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function onHandleDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'touch') return;
    drag.current = { startY: event.clientY, startT: performance.now(), id: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function onHandleMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'touch') return;
    if (!drag.current || drag.current.id !== event.pointerId) return;
    setDragY(Math.max(0, event.clientY - drag.current.startY));
  }
  function onHandleUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'touch') return;
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    drag.current = null;
    const dy = Math.max(0, event.clientY - current.startY);
    const velocity = dy / Math.max(1, performance.now() - current.startT);
    if (dy > DISMISS_DISTANCE || (dy > 30 && velocity > DISMISS_VELOCITY)) {
      requestClose();
    } else {
      setDragY(0);
    }
  }

  return (
    <div className="fixed inset-0 z-[60]">
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={requestClose}
        className={`absolute inset-0 h-full w-full cursor-default bg-black/45 ${closing ? 'promo-fade-out' : 'promo-fade-in'}`}
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onKeyDown={trapTab}
        style={{
          bottom: 'calc(var(--bottom-nav-h, 0px) + 0.75rem)',
          '--sheet-drag': `${dragY}px`,
          transform: dragY > 0 && !closing ? `translateY(${dragY}px)` : undefined,
          // Solta antes do limite: volta suave (durante o arraste nao ha transicao, senao o card "atrasa" no dedo).
          transition: entered && !closing && dragY === 0 ? 'transform 180ms ease' : undefined,
        } as React.CSSProperties}
        className={`absolute left-0 right-0 mx-auto flex max-h-[calc(100dvh-var(--bottom-nav-h,0px)-3rem)] w-[calc(100%-1.5rem)] max-w-xl flex-col overflow-hidden rounded-3xl border ${MENU_BORDER} bg-[#FFFFFF]/75 shadow-[0_12px_40px_rgba(0,0,0,0.3)] backdrop-blur-xl outline-none dark:bg-[#131314]/75 ${
          closing ? 'promo-sheet-out' : entered ? '' : 'promo-sheet-in'
        }`}
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget && event.animationName === 'promo-sheet-in') setEntered(true);
        }}
      >
        <div
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
          className="flex shrink-0 cursor-grab touch-none justify-center pb-1 pt-2.5 active:cursor-grabbing"
        >
          <span aria-hidden="true" className="h-1.5 w-11 rounded-full bg-black/15 dark:bg-white/20" />
        </div>
        {children}
      </div>
    </div>
  );
}
