// Rotação dos slides (PURO). Nada de loop contínuo: um setTimeout por slide.
export const ROTATION_MS = 12_000;
export const FADE_MS = 1_600;

export type LogoCorner = 'tr' | 'tl' | 'br'; // 'bl' fica livre para a legenda
const LOGO_CORNERS: readonly LogoCorner[] = ['tr', 'tl', 'br'];

// A marca muda de canto a cada volta completa na lista (proteção contra retenção de imagem).
export function logoCornerFor(cycle: number): LogoCorner {
  const n = LOGO_CORNERS.length;
  return LOGO_CORNERS[((Math.floor(cycle) % n) + n) % n];
}

// Próximo índice utilizável depois de `current` (pula os que falharam). null = não há outro.
export function nextValidIndex(current: number, total: number, failed: ReadonlySet<number>): number | null {
  for (let step = 1; step < total; step++) {
    const idx = (current + step) % total;
    if (!failed.has(idx)) return idx;
  }
  return null;
}

export function validCount(total: number, failed: ReadonlySet<number>): number {
  let bad = 0;
  failed.forEach((i) => {
    if (i >= 0 && i < total) bad += 1;
  });
  return Math.max(0, total - bad);
}
