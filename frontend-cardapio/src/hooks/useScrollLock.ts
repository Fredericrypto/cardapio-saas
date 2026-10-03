import { useEffect } from 'react';

// Trava a rolagem da página enquanto QUALQUER modal está aberto (decisão
// do Felipe, 02/10: com modal aberto é IMPOSSÍVEL rolar a tela). Contador
// de referência: vários modais empilhados travam uma vez só e a rolagem
// só volta quando o ÚLTIMO fecha. Usa `position: fixed` no body (e não só
// `overflow: hidden`), que é o que realmente segura a página no iOS/Safari
// e no Chrome Android; a posição de rolagem é restaurada ao destravar.
let locks = 0;
let savedScrollY = 0;
let savedStyles: { position: string; top: string; left: string; right: string; width: string; overflow: string } | null = null;

function lock() {
  if (locks === 0) {
    const body = document.body;
    savedScrollY = window.scrollY;
    savedStyles = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = 'fixed';
    body.style.top = `-${savedScrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
  }
  locks += 1;
}

function unlock() {
  locks = Math.max(0, locks - 1);
  if (locks === 0 && savedStyles) {
    const body = document.body;
    body.style.position = savedStyles.position;
    body.style.top = savedStyles.top;
    body.style.left = savedStyles.left;
    body.style.right = savedStyles.right;
    body.style.width = savedStyles.width;
    body.style.overflow = savedStyles.overflow;
    savedStyles = null;
    window.scrollTo(0, savedScrollY);
  }
}

export function useScrollLock(active = true) {
  useEffect(() => {
    if (!active) return;
    lock();
    return unlock;
  }, [active]);
}
