// O gesto que acorda a vitrine NÃO pode atingir a interface de baixo (ex.: o clique
// cair no "Cancelar pedido"). O overlay consome o primeiro evento; este módulo — que
// sobrevive ao desmonte do overlay — segue consumindo o RESTO do mesmo gesto
// (mouseup/click/keyup...) até soltar o botão/tecla (+120 ms), com teto de 3 s.
const EVENTS = [
  'pointerdown', 'mousedown', 'touchstart', 'pointerup', 'mouseup', 'touchend', 'touchcancel',
  'pointercancel', 'click', 'dblclick', 'auxclick', 'contextmenu', 'keydown', 'keypress', 'keyup', 'wheel',
] as const;
const RELEASE = new Set<string>(['pointerup', 'mouseup', 'touchend', 'touchcancel', 'pointercancel', 'keyup']);
const AFTER_RELEASE_MS = 120;
const MAX_MS = 3000;

export function swallowCurrentGesture(): void {
  if (typeof window === 'undefined') return;
  let done = false;
  let releaseTimer: number | undefined;
  const stop = () => {
    if (done) return;
    done = true;
    window.clearTimeout(releaseTimer);
    window.clearTimeout(maxTimer);
    for (const ev of EVENTS) window.removeEventListener(ev, handler, true);
  };
  const handler = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (RELEASE.has(e.type) && releaseTimer === undefined) releaseTimer = window.setTimeout(stop, AFTER_RELEASE_MS);
  };
  const maxTimer = window.setTimeout(stop, MAX_MS);
  for (const ev of EVENTS) window.addEventListener(ev, handler, { capture: true, passive: false });
}
