// Pré-carrega e DECODIFICA uma imagem antes de ela entrar na tela (nada de pop-in
// no meio do crossfade). Resolve null se falhar ou demorar demais.
export interface PreloadResult {
  img: HTMLImageElement;
  w: number;
  h: number;
}

const PRELOAD_TIMEOUT_MS = 20_000;

export function preloadImage(url: string): Promise<PreloadResult | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    let settled = false;
    const finish = (value: PreloadResult | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), PRELOAD_TIMEOUT_MS);
    img.onload = () => {
      const done = () => finish({ img, w: img.naturalWidth, h: img.naturalHeight });
      if (typeof img.decode === 'function') img.decode().then(done, done);
      else done();
    };
    img.onerror = () => finish(null);
    img.src = url;
  });
}
