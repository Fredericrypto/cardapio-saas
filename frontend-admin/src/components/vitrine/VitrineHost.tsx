// Modo Vitrine — host. Fica no AdminLayout, FORA do container que rola, e só decide
// QUANDO a vitrine abre/fecha. Desligada: não registra nada. Armada: listeners
// passivos que só gravam um timestamp (sem setState) + UM timeout que se reprograma.
// Os eventos operacionais vêm do DashboardDataProvider (useAttentionStatus) — nenhum
// polling novo. O overlay (imagens, CSS) é um chunk lazy, pré-carregado quando armada.
import { Component, Suspense, lazy, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useAttentionStatus } from '../../hooks/useAttentionStatus';
import { getDeviceSettings, subscribeDeviceSettings } from '../../lib/vitrine/deviceSettings';
import { getPreviewTick, subscribePreview } from '../../lib/vitrine/preview';
import { ATTENTION_RECHECK_MS, HIDDEN_RECHECK_MS, movedEnough, msUntilIdle, type Point } from '../../lib/vitrine/idle';
import { hasNewWatchedId, hasWatchedPending, snapshotAttention } from '../../lib/vitrine/attention';
import type { AttentionIds } from '../../types/vitrine';

const loadOverlay = () => import('./VitrineOverlay');
const VitrineOverlay = lazy(loadOverlay);

const ACTIVITY_EVENTS = ['mousedown', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

// Falha ao baixar o chunk (ex.: deploy novo com a aba antiga aberta) NÃO pode derrubar o painel.
class OverlayBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const NOTICE_MS = 9000;

export function VitrineHost() {
  const device = useSyncExternalStore(subscribeDeviceSettings, getDeviceSettings);
  const previewTick = useSyncExternalStore(subscribePreview, getPreviewTick);
  const attention = useAttentionStatus();
  const [active, setActive] = useState<'idle' | 'preview' | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const attentionRef = useRef(attention.ids);
  attentionRef.current = attention.ids;
  const wakeOnRef = useRef(device.wakeOn);
  wakeOnRef.current = device.wakeOn;
  const baselineRef = useRef<AttentionIds | null>(null);
  const lastPreviewTick = useRef(previewTick);

  // Armada: conta a inatividade e abre quando completa.
  useEffect(() => {
    if (!device.enabled || active) return;
    void loadOverlay().catch(() => {}); // aquece o chunk (cache do módulo) enquanto armada
    const idleMs = device.idleMinutes * 60_000;
    let last = performance.now();
    let pos: Point | null = null;
    let timer = 0;

    const onActivity = () => {
      last = performance.now();
    };
    const onMouseMove = (e: MouseEvent) => {
      const next = { x: e.clientX, y: e.clientY };
      if (pos === null || movedEnough(pos, next)) {
        if (pos !== null) last = performance.now(); // o 1º movimento só fixa a referência
        pos = next;
      }
    };
    const tick = () => {
      const remaining = msUntilIdle(last, performance.now(), idleMs);
      if (remaining > 0) {
        timer = window.setTimeout(tick, remaining);
        return;
      }
      if (document.hidden) {
        timer = window.setTimeout(tick, HIDDEN_RECHECK_MS);
        return;
      }
      // Não abre por cima de pendência numa categoria monitorada (o pedido ficaria escondido).
      if (hasWatchedPending(attentionRef.current, wakeOnRef.current)) {
        timer = window.setTimeout(tick, ATTENTION_RECHECK_MS);
        return;
      }
      baselineRef.current = snapshotAttention(attentionRef.current);
      setActive('idle');
    };

    for (const ev of ACTIVITY_EVENTS) window.addEventListener(ev, onActivity, { capture: true, passive: true });
    window.addEventListener('mousemove', onMouseMove, { capture: true, passive: true });
    timer = window.setTimeout(tick, idleMs);
    return () => {
      window.clearTimeout(timer);
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, onActivity, true);
      window.removeEventListener('mousemove', onMouseMove, true);
    };
  }, [device.enabled, device.idleMinutes, active]);

  // "Pré-visualizar": abre na hora, mesmo com o recurso desligado neste aparelho.
  useEffect(() => {
    if (previewTick === lastPreviewTick.current) return;
    lastPreviewTick.current = previewTick;
    baselineRef.current = null;
    setNotice(null);
    setReady(false);
    setActive('preview');
  }, [previewTick]);

  // Aberta por inatividade: id NOVO numa categoria monitorada fecha a vitrine.
  // Remoção de item (atendido) não fecha. Usa os ids por categoria, não só a assinatura.
  useEffect(() => {
    if (active !== 'idle' || !baselineRef.current) return;
    if (hasNewWatchedId(baselineRef.current, attentionRef.current, wakeOnRef.current)) setActive(null);
  }, [active, attention.signature]);

  // Avisos da PRÉ-VISUALIZAÇÃO (a vitrine por inatividade nunca incomoda ninguém).
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(t);
  }, [notice]);

  const exit = (reason?: string) => {
    if (active === 'preview' && reason) setNotice(reason);
    setActive(null);
  };

  return (
    <>
      {active === 'preview' && !ready && (
        <div role="status" className="fixed bottom-4 right-4 z-[70] rounded-xl bg-gray-900 text-white text-sm px-4 py-3 shadow-lg">
          Abrindo a vitrine… (Esc cancela)
        </div>
      )}
      {notice && (
        <div role="status" className="fixed bottom-4 right-4 z-[70] max-w-sm rounded-xl bg-gray-900 text-white text-sm px-4 py-3 shadow-lg flex items-start gap-3">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-white/70 hover:text-white" aria-label="Fechar aviso">×</button>
        </div>
      )}
      {active && (
        <OverlayBoundary
          key={attempt}
          onError={() => {
            if (active === 'preview') setNotice('Não consegui carregar a vitrine (falha ao baixar o módulo). Recarregue a página com Ctrl+Shift+R e tente de novo.');
            setActive(null);
            setAttempt((n) => n + 1);
          }}
        >
          <Suspense fallback={null}>
            <VitrineOverlay mode={active} onExit={exit} onReady={() => setReady(true)} />
          </Suspense>
        </OverlayBoundary>
      )}
    </>
  );
}
