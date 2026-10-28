// Quando a vitrine pode abrir / deve fechar por eventos operacionais (PURO).
// Só ids NOVOS acordam: item que some (atendido) nunca acorda a vitrine.
import type { AttentionIds, WakeOn } from '../../types/vitrine';

const CATEGORIES = ['orders', 'calls', 'closings'] as const;

// Há pendência numa categoria que o aparelho marcou para acordar? Então NÃO abre.
export function hasWatchedPending(ids: AttentionIds, wakeOn: WakeOn): boolean {
  return CATEGORIES.some((c) => wakeOn[c] && ids[c].length > 0);
}

export function snapshotAttention(ids: AttentionIds): AttentionIds {
  return { orders: [...ids.orders], calls: [...ids.calls], closings: [...ids.closings] };
}

// Surgiu, desde a fotografia, algum id que não estava lá — numa categoria monitorada?
export function hasNewWatchedId(baseline: AttentionIds, current: AttentionIds, wakeOn: WakeOn): boolean {
  return CATEGORIES.some((c) => {
    if (!wakeOn[c]) return false;
    const known = new Set(baseline[c]);
    return current[c].some((id) => !known.has(id));
  });
}
