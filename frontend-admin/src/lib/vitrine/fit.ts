// Foto preenche a tela (cover) quando a proporção é parecida; senão aparece inteira
// (contain) sobre a camada ambiente — o prato nunca é cortado.
export const FIT_TOLERANCE = 0.15;
export type Fit = 'cover' | 'contain';

export function chooseFit(imgW: number, imgH: number, viewW: number, viewH: number): Fit {
  if (!(imgW > 0 && imgH > 0 && viewW > 0 && viewH > 0)) return 'contain';
  const ratio = imgW / imgH / (viewW / viewH);
  return Math.abs(ratio - 1) <= FIT_TOLERANCE ? 'cover' : 'contain';
}
