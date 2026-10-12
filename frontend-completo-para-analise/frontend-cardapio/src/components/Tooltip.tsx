import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  /** Texto exibido no balão. Vazio = nenhum balão. */
  label: string;
  children: ReactNode;
  /** Lado preferido; se não couber na tela, inverte sozinho. */
  placement?: 'top' | 'bottom';
  /**
   * Só mostra o balão quando algum descendente marcado com `data-truncate`
   * está de fato cortado (reticências). Texto que cabe inteiro não gera balão.
   */
  onlyIfTruncated?: boolean;
  disabled?: boolean;
  /**
   * Classes do invólucro. O padrão (`inline-flex`) faz o invólucro ter
   * exatamente a caixa do filho. Use `contents` quando o filho é
   * posicionado de forma absoluta e não pode ganhar um pai com caixa.
   */
  className?: string;
}

const GAP = 8; // distância entre o elemento e o balão
const EDGE = 8; // margem mínima até a borda da janela
const SHOW_DELAY_MS = 250; // evita piscar ao varrer uma fileira de ícones

function hasTruncatedText(root: HTMLElement): boolean {
  const candidates = [root, ...Array.from(root.querySelectorAll<HTMLElement>('[data-truncate]'))];
  return candidates.some((el) => el.hasAttribute('data-truncate') && el.scrollWidth > el.clientWidth + 1);
}

function isKeyboardFocus(target: EventTarget): boolean {
  try {
    return (target as Element).matches(':focus-visible');
  } catch {
    return false;
  }
}

// Tooltip minimalista (hover no desktop, foco por teclado). Renderiza num
// portal em `position: fixed`, então NUNCA é cortado por um pai com
// `overflow` (carrossel de promoções, barra de categorias, painel de infos).
//
// - Toque (celular) não abre balão: só `pointerType === 'mouse'` e foco por
//   teclado (`:focus-visible`). Em tela de toque o balão ficaria preso.
// - O balão é `aria-hidden`: todo gatilho do app já tem nome acessível
//   (`aria-label` ou o próprio texto), e repetir leria duas vezes.
// - Cores: claro = fundo escuro com texto branco; escuro = fundo claro
//   (#E3E2E6) com texto #131314, a paleta do tema do app.
export function Tooltip({
  label,
  children,
  placement = 'top',
  onlyIfTruncated = false,
  disabled = false,
  className = 'inline-flex',
}: TooltipProps) {
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [shown, setShown] = useState(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  const hide = useCallback(() => {
    clearTimer();
    setOpen(false);
    setShown(false);
    setCoords(null);
  }, [clearTimer]);

  const scheduleShow = useCallback(
    (delay: number) => {
      if (disabled || !label) return;
      clearTimer();
      timerRef.current = window.setTimeout(() => {
        const el = wrapperRef.current;
        if (!el) return;
        if (onlyIfTruncated && !hasTruncatedText(el)) return;
        setOpen(true);
      }, delay);
    },
    [disabled, label, onlyIfTruncated, clearTimer],
  );

  // Mede e posiciona (antes de pintar) e só então faz o fade-in.
  useLayoutEffect(() => {
    if (!open) return;
    const wrapper = wrapperRef.current;
    const tip = tipRef.current;
    if (!wrapper || !tip) return;

    // `contents` não tem caixa própria: mede o primeiro filho.
    const anchor = (wrapper.firstElementChild as HTMLElement | null) ?? wrapper;
    const a = anchor.getBoundingClientRect();
    const tipW = tip.offsetWidth;
    const tipH = tip.offsetHeight;

    const fitsTop = a.top - GAP - tipH >= EDGE;
    const fitsBottom = a.bottom + GAP + tipH <= window.innerHeight - EDGE;
    const useTop = placement === 'top' ? fitsTop || !fitsBottom : !fitsBottom && fitsTop;

    const top = useTop ? a.top - GAP - tipH : a.bottom + GAP;
    const rawLeft = a.left + a.width / 2 - tipW / 2;
    const left = Math.min(Math.max(rawLeft, EDGE), Math.max(EDGE, window.innerWidth - tipW - EDGE));

    setCoords({ top, left });
    const raf = window.requestAnimationFrame(() => setShown(true));
    return () => window.cancelAnimationFrame(raf);
  }, [open, label, placement]);

  // Enquanto aberto: rolagem, redimensionamento e Esc fecham (a posição
  // calculada ficaria velha).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide();
    };
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, hide]);

  useEffect(() => clearTimer, [clearTimer]);

  return (
    <span
      ref={wrapperRef}
      className={className}
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') scheduleShow(SHOW_DELAY_MS);
      }}
      onPointerLeave={hide}
      onPointerDown={hide}
      onFocus={(e) => {
        if (isKeyboardFocus(e.target)) scheduleShow(0);
      }}
      onBlur={hide}
    >
      {children}
      {open &&
        createPortal(
          <div
            ref={tipRef}
            aria-hidden="true"
            style={{
              position: 'fixed',
              top: coords?.top ?? 0,
              left: coords?.left ?? 0,
              visibility: coords ? 'visible' : 'hidden',
              opacity: shown ? 1 : 0,
            }}
            className="pointer-events-none select-none z-[1000] max-w-[16rem] break-words rounded-md px-2 py-1 text-center text-[11px] font-medium leading-tight shadow-lg ring-1 ring-black/5 transition-opacity duration-150 motion-reduce:transition-none bg-[#111827] text-white dark:bg-[#E3E2E6] dark:text-[#131314] dark:ring-white/10"
          >
            {label}
          </div>,
          document.body,
        )}
    </span>
  );
}
