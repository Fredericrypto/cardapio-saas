// Modo Vitrine — overlay em tela cheia (carregado com React.lazy pelo VitrineHost).
// O painel continua montado por baixo: nada é desmontado, recarregado ou perde estado.
// Performance: só `opacity` anima (animação CSS finita); a rotação é um setTimeout por
// slide (sem rAF); só 2 <img> existem por vez; a próxima imagem é pré-carregada e
// decodificada antes do crossfade.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import './vitrine.css';
import { fetchVitrine } from '../../lib/admin-api';
import { chooseFit } from '../../lib/vitrine/fit';
import { WAKE_GRACE_MS, graceElapsed, movedEnough, type Point } from '../../lib/vitrine/idle';
import { preloadImage, type PreloadResult } from '../../lib/vitrine/preload';
import { FADE_MS, ROTATION_MS, logoCornerFor, nextValidIndex, validCount, type LogoCorner } from '../../lib/vitrine/rotation';
import { swallowCurrentGesture } from '../../lib/vitrine/swallow';
import type { VitrineData } from '../../types/vitrine';

interface Shown {
  key: number;
  slideIdx: number;
  w: number;
  h: number;
  corner: LogoCorner;
}

const GESTURE_EVENTS = ['pointerdown', 'mousedown', 'touchstart', 'keydown', 'wheel'] as const;

// Por que a vitrine não abriu — mostrado ao usuário na PRÉ-VISUALIZAÇÃO (falhar em silêncio
// deixa a pessoa sem saber se o recurso quebrou ou se falta alguma coisa).
function failureReason(err: unknown): string {
  const status = (err as { response?: { status?: number } } | null)?.response?.status;
  if (status === 404) return 'A vitrine não abriu: o servidor não conhece a rota nova (/tenants/me/vitrine). Reinicie o backend para carregar a versão atualizada.';
  if (typeof status === 'number') return `A vitrine não abriu: o servidor respondeu com erro ${status}.`;
  return 'A vitrine não abriu: não consegui falar com o servidor.';
}

interface OverlayProps {
  mode: 'idle' | 'preview';
  onExit: (reason?: string) => void;
  onReady: () => void;
}

export default function VitrineOverlay({ mode, onExit, onReady }: OverlayProps) {
  const [data, setData] = useState<VitrineData | null>(null);
  const [shown, setShown] = useState<Shown[]>([]);
  const [viewport, setViewport] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const failedRef = useRef<Set<number>>(new Set());
  const stepRef = useRef(0);
  const keyRef = useRef(0);
  const holdRef = useRef<HTMLImageElement | null>(null); // mantém a imagem decodificada até o slide entrar
  const visibleAtRef = useRef<number | null>(null);
  const exitedRef = useRef(false);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const previewRef = useRef(mode === 'preview');

  // 1) Carrega os slides e só abre quando há uma primeira imagem pronta e decodificada.
  //    Sem imagem utilizável (ou falha de rede): não abre — nunca mostra tela vazia.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const d = await fetchVitrine();
        if (cancelled) return;
        if (d.slides.length === 0) {
          onExitRef.current('A vitrine não abriu: não há nenhuma imagem utilizável. Cadastre o banner do restaurante ou fotos nos produtos disponíveis, ou escolha as imagens em Configurações → Modo Vitrine.');
          return;
        }
        for (let i = 0; i < d.slides.length; i++) {
          const r = await preloadImage(d.slides[i].imageUrl);
          if (cancelled) return;
          if (r) {
            holdRef.current = r.img;
            visibleAtRef.current = performance.now();
            keyRef.current += 1;
            setData(d);
            setShown([{ key: keyRef.current, slideIdx: i, w: r.w, h: r.h, corner: logoCornerFor(0) }]);
            onReadyRef.current();
            return;
          }
          failedRef.current.add(i);
        }
        if (!cancelled) onExitRef.current('A vitrine não abriu: nenhuma das imagens carregou (confira se as fotos ainda existem).');
      } catch (err) {
        console.warn('[vitrine] falha ao carregar', err);
        if (!cancelled) onExitRef.current(failureReason(err));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // 2) Rotação: um timeout por slide. A próxima imagem é pré-carregada DEPOIS do fade
  //    (não disputa decodificação com a transição) e bem antes da hora de trocar.
  const current = shown.length > 0 ? shown[shown.length - 1] : null;
  const currentKey = current ? current.key : 0;
  useEffect(() => {
    if (!data || !current) return;
    const total = data.slides.length;
    const first = nextValidIndex(current.slideIdx, total, failedRef.current);
    if (first === null) return; // imagem única: fica parada, sem timers
    let cancelled = false;
    let candidate = first;
    let pending: Promise<PreloadResult | null> | null = null;
    const startPreload = () => {
      pending = preloadImage(data.slides[candidate].imageUrl);
    };
    const kick = window.setTimeout(startPreload, FADE_MS + 400);
    const advance = (idx: number, r: PreloadResult) => {
      holdRef.current = r.img;
      stepRef.current += 1;
      const cycle = Math.floor(stepRef.current / Math.max(1, validCount(total, failedRef.current)));
      keyRef.current += 1;
      const next: Shown = { key: keyRef.current, slideIdx: idx, w: r.w, h: r.h, corner: logoCornerFor(cycle) };
      setShown((prev) => [prev[prev.length - 1], next]);
    };
    const timer = window.setTimeout(async () => {
      for (;;) {
        if (!pending) startPreload();
        const r = await pending;
        if (cancelled) return;
        if (r) {
          advance(candidate, r);
          return;
        }
        failedRef.current.add(candidate);
        const nxt = nextValidIndex(current.slideIdx, total, failedRef.current);
        if (nxt === null) return; // sobrou só a atual
        candidate = nxt;
        startPreload();
      }
    }, ROTATION_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(kick);
      window.clearTimeout(timer);
    };
    // `current` muda junto com `currentKey`; `data` só muda uma vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, currentKey]);

  // 3) Terminado o crossfade, o slide antigo sai do DOM (volta a ter só 1 <img> de foto).
  useEffect(() => {
    if (shown.length < 2) return;
    const t = window.setTimeout(() => {
      setShown((prev) => prev.slice(-1));
      holdRef.current = null;
    }, FADE_MS + 250);
    return () => window.clearTimeout(t);
  }, [shown.length]);

  // 4) Acordar por interação. Clique/toque/tecla/roda: consome o evento (não chega na
  //    interface de baixo) — SÓ se a vitrine já está visível; durante o carregamento
  //    apenas cancela a abertura. Mouse: ignora tremor e o primeiro segundo.
  useEffect(() => {
    let lastPos: Point | null = null;
    const exit = (swallow: boolean) => {
      if (exitedRef.current) return;
      exitedRef.current = true;
      if (swallow) swallowCurrentGesture();
      onExitRef.current();
    };
    const onMove = (e: MouseEvent) => {
      const pos = { x: e.clientX, y: e.clientY };
      const shownAt = visibleAtRef.current;
      // Na pré-visualização, mexer o mouse enquanto a imagem carrega NÃO cancela (a pessoa acabou de clicar).
      if (previewRef.current && shownAt === null) return;
      if (lastPos === null || (shownAt !== null && !graceElapsed(shownAt, performance.now(), WAKE_GRACE_MS))) {
        lastPos = pos;
        return;
      }
      if (movedEnough(lastPos, pos)) exit(false);
    };
    const onGesture = (e: Event) => {
      const shownAt = visibleAtRef.current;
      const visible = shownAt !== null;
      // Pré-visualização carregando: só Esc cancela; o resto (clique duplo, roda) é ignorado.
      if (previewRef.current && !visible) {
        if (e.type === 'keydown' && (e as KeyboardEvent).key === 'Escape') exit(false);
        return;
      }
      // Inércia da roda/trackpad logo depois de abrir não pode fechar (nem rolar o painel por baixo).
      if (e.type === 'wheel' && visible && !graceElapsed(shownAt, performance.now(), WAKE_GRACE_MS)) {
        e.preventDefault();
        return;
      }
      // Tecla segurada (auto-repeat) logo após abrir, ex.: Enter do "Pré-visualizar".
      if (e.type === 'keydown' && (e as KeyboardEvent).repeat && visible && !graceElapsed(visibleAtRef.current as number, performance.now())) {
        e.preventDefault();
        return;
      }
      if (visible) {
        e.preventDefault();
        e.stopPropagation();
      }
      exit(visible);
    };
    window.addEventListener('mousemove', onMove, { capture: true, passive: true });
    for (const ev of GESTURE_EVENTS) window.addEventListener(ev, onGesture, { capture: true, passive: false });
    return () => {
      window.removeEventListener('mousemove', onMove, true);
      for (const ev of GESTURE_EVENTS) window.removeEventListener(ev, onGesture, true);
    };
  }, []);

  // 5) Enquanto visível: mantém o monitor ligado (Screen Wake Lock) e pausa as piscadas
  //    do painel que ficam por baixo (ver vitrine.css).
  const visible = data !== null;
  useEffect(() => {
    if (!visible) return;
    document.documentElement.dataset.vitrine = 'on';
    let sentinel: WakeLockSentinel | null = null;
    let released = false;
    const acquire = async () => {
      try {
        if (document.visibilityState !== 'visible' || !navigator.wakeLock) return;
        const s = await navigator.wakeLock.request('screen');
        if (released) void s.release().catch(() => {});
        else sentinel = s;
      } catch {
        /* contexto inseguro, bateria baixa ou sem suporte: segue sem o lock */
      }
    };
    void acquire();
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !sentinel) void acquire();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      released = true;
      document.removeEventListener('visibilitychange', onVisibility);
      delete document.documentElement.dataset.vitrine;
      void sentinel?.release().catch(() => {});
      sentinel = null;
    };
  }, [visible]);

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!data || shown.length === 0) return null;

  const rootStyle = { '--vt-fade': `${FADE_MS}ms` } as CSSProperties;
  return createPortal(
    <div className="vt-root" style={rootStyle} role="presentation" aria-hidden="true">
      {shown.map((s, i) => {
        const slide = data.slides[s.slideIdx];
        const fit = chooseFit(s.w, s.h, viewport.w, viewport.h);
        const entering = shown.length > 1 && i === shown.length - 1;
        return (
          <div key={s.key} className={entering ? 'vt-slide vt-enter' : 'vt-slide'}>
            {fit === 'contain' && <img className="vt-ambient" src={slide.imageUrl} alt="" draggable={false} />}
            <img className={`vt-photo vt-${fit}`} src={slide.imageUrl} alt="" draggable={false} />
            <div className="vt-scrim" />
            <div className={`vt-mark vt-mark--${s.corner}`}>
              {data.logoUrl ? <img src={data.logoUrl} alt="" draggable={false} /> : <span>{data.name}</span>}
            </div>
            {slide.name && <div className="vt-caption">{slide.name}</div>}
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
