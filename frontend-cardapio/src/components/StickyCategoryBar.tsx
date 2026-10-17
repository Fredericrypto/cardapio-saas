import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

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
    // Linha em que a faixa gruda: abaixo da navbar no desktop (64px), no topo
    // da tela no celular (0). Refaz o observador se a largura cruzar o breakpoint.
    const mq = window.matchMedia('(min-width: 768px)');
    let observer: IntersectionObserver | null = null;
    const start = () => {
      observer?.disconnect();
      const top = mq.matches ? STICKY_TOP_PX : 0;
      observer = new IntersectionObserver(
        ([entry]) => setStuck(!entry.isIntersecting && entry.boundingClientRect.top < top),
        { rootMargin: `-${top}px 0px 0px 0px`, threshold: 0 },
      );
      observer.observe(el);
    };
    start();
    mq.addEventListener('change', start);
    return () => {
      mq.removeEventListener('change', start);
      observer?.disconnect();
    };
  }, []);

  // Presa no topo, o vidro da faixa vai de uma borda à outra da PÁGINA (como a navbar),
  // enquanto as abas continuam alinhadas ao conteúdo. Posição/largura medidas na hora.
  const barRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!stuck) return;
    const place = () => {
      const bar = barRef.current;
      const layer = layerRef.current;
      if (!bar || !layer) return;
      layer.style.left = `${-bar.getBoundingClientRect().left}px`;
      layer.style.width = `${document.documentElement.clientWidth}px`;
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [stuck]);

  return (
    <>
      {/* h-px + -mb-px: ocupa 1px de altura mas devolve 1px de margem, então o
          layout não muda. */}
      <div ref={sentinelRef} aria-hidden="true" className="h-px -mb-px pointer-events-none" />
      <div ref={barRef} className="sticky top-0 md:top-16 z-30 bg-transparent atm-glass">
        {stuck && (
          <div
            ref={layerRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 -z-10 bg-transparent backdrop-blur-md"
          />
        )}
        {children}
      </div>
    </>
  );
}
