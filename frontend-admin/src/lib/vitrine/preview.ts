// Botão "Pré-visualizar" → VitrineHost (mesmo padrão de store do lib/theme.ts,
// sem Context novo). Cada chamada incrementa um contador que o host observa.
let tick = 0;
const listeners = new Set<() => void>();

export function requestVitrinePreview(): void {
  tick += 1;
  listeners.forEach((l) => l());
}

export function getPreviewTick(): number {
  return tick;
}

export function subscribePreview(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
