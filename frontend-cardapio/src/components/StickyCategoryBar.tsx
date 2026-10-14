import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MENU_PAGE_BG } from '../lib/menuTheme';

// Altura da barra superior do desktop (h-16). Tem que ser igual ao `md:top-16`
// da faixa abaixo: é a linha em que ela "gruda" ao rolar a página.
const STICKY_TOP_PX = 64;

// Faixa de categorias do desktop (fixa logo abaixo da barra superior).
//
// - EM REPOUSO (no lugar natural dela, abaixo das promoções): SEM cor de fundo
//   (`atm-glass` deixa transparente). Quem dá a cor é o fundo da tela, no claro
//   e no escuro, e a luz ambiente dos cards de promoção passa por trás sem
//   nenhuma faixa escurecida.
// - PRESA NO TOPO (rolando a página): volta ao fundo normal da tela
//   (`MENU_PAGE_BG`, a mesma cor da página — não aparece como "cor"), porque
//   os produtos passam por baixo dos nomes das categorias e, sem fundo, o texto
//   ficaria ilegível sobre fotos claras.
//
// Detecção sem ouvir `scroll`: um sentinela de 1px logo acima da faixa; quando
// ele sai pela linha dos 64px, a faixa está presa (IntersectionObserver). No
// celular a faixa não é fixa e o estado não muda nada (as regras só valem em md+).
export function StickyCategoryBar({ children }: { children: ReactNode }) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setStuck(!entry.isIntersecting && entry.boundingClientRect.top < STICKY_TOP_PX),
      { rootMargin: `-${STICKY_TOP_PX}px 0px 0px 0px`, threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* h-px + -mb-px: ocupa 1px de altura mas devolve 1px de margem, então o
          layout não muda. */}
      <div ref={sentinelRef} aria-hidden="true" className="h-px -mb-px pointer-events-none" />
      <div className={`md:sticky md:top-16 md:z-30 ${MENU_PAGE_BG} atm-glass ${stuck ? 'atm-stuck' : ''}`}>
        {children}
      </div>
    </>
  );
}
