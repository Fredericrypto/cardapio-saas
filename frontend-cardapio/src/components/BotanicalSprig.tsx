import type { CSSProperties } from 'react';
import { SPRIG_HEIGHT, SPRIG_SRC, SPRIG_WIDTH } from '../lib/botanicalSprig';

// Ramo botanico decorativo do perfil. O desenho (public/ramo-botanico.webp) e so a forma:
// traco opaco, resto transparente. Funciona como MASCARA; a cor vem do `background-color`
// de quem usa (ex.: bg-[#111827]/30 dark:bg-[#C2C0B6]/35), entao acompanha o tema sem segunda
// imagem. A largura vem do chamador; a altura sai do aspect-ratio do arquivo (sem salto de layout).
// A mascara so carrega de mesma origem (ou com CORS): o arquivo fica em /public, junto do app.
const MASK_URL = `url(${SPRIG_SRC})`;
const SPRIG_STYLE: CSSProperties = {
  aspectRatio: `${SPRIG_WIDTH} / ${SPRIG_HEIGHT}`,
  WebkitMaskImage: MASK_URL,
  maskImage: MASK_URL,
  WebkitMaskRepeat: 'no-repeat',
  maskRepeat: 'no-repeat',
  WebkitMaskSize: '100% 100%',
  maskSize: '100% 100%',
};

export function BotanicalSprig({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={className} style={SPRIG_STYLE} />;
}
