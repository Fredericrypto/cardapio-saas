// Regras PURAS de inatividade/acordar (sem DOM) — testadas em test/vitrine.test.ts.
export const MOUSE_MOVE_THRESHOLD_PX = 8; // tremor da mesa não conta como atividade
export const WAKE_GRACE_MS = 1000; // logo depois de abrir, o mouse parado/tremendo não fecha
export const ATTENTION_RECHECK_MS = 5000; // reavalia a pendência enquanto bloqueia a abertura
export const HIDDEN_RECHECK_MS = 15000;

export interface Point {
  x: number;
  y: number;
}

// Quanto falta para a inatividade completar (0 = já completou).
export function msUntilIdle(lastActivityAt: number, now: number, idleMs: number): number {
  return Math.max(0, idleMs - (now - lastActivityAt));
}

// `from` nulo = ainda não há referência: o chamador grava a posição e não conta como movimento.
export function movedEnough(from: Point | null, to: Point, threshold: number = MOUSE_MOVE_THRESHOLD_PX): boolean {
  if (!from) return false;
  return Math.hypot(to.x - from.x, to.y - from.y) >= threshold;
}

export function graceElapsed(shownAt: number, now: number, grace: number = WAKE_GRACE_MS): boolean {
  return now - shownAt >= grace;
}
