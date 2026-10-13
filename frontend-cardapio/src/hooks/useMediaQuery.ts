import { useSyncExternalStore } from 'react';

// true enquanto a media query casar (ex.: '(min-width: 1024px)'). Usado pelo
// carrinho para montar o card do método de pagamento em UM só lugar (painel
// lateral no desktop, coluna principal no celular/tablet), sem duplicar o DOM
// nem o estado local do cartão ilustrativo.
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
