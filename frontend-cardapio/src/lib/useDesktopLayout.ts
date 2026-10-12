import { useEffect, useState } from 'react';

// `lg` do Tailwind (1024px): a partir daqui as páginas de pedidos usam o
// layout lado a lado (lista + detalhe). Abaixo disso nada muda.
const DESKTOP_QUERY = '(min-width: 1024px)';

export function useDesktopLayout(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(DESKTOP_QUERY).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setIsDesktop(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
}
