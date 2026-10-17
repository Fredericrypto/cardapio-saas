import { memo, useEffect, useMemo, useState } from 'react';
import { FOOD_ICONS, FOOD_STEP } from './foodIcons';
import './food-backdrop.css';

const CELL_W = 92;
const CELL_H = 88;

function measure() {
  return {
    cols: Math.min(44, Math.ceil(window.innerWidth / CELL_W) + 2),
    rows: Math.min(26, Math.ceil(Math.max(window.innerHeight, window.screen?.height ?? 0) / CELL_H) + 2),
  };
}

// Fundo da página: ícones de comida (Lucide, traço fino) em linhas de zigue-zague cobrindo a
// tela inteira, bem discretos. Só decoração: aria-hidden, sem toque, não rola, some na
// impressão. Renderize DENTRO de um contêiner `isolate` (como a MenuPage) para ele ficar
// atrás do conteúdo mas à frente do fundo da página.
function FoodBackdropBase() {
  const [{ cols, rows }, setGrid] = useState(measure);

  useEffect(() => {
    let timer = 0;
    let lastWidth = window.innerWidth;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        // Ao rolar, a barra de endereço do celular encolhe/volta e dispara resize só de
        // altura: ignorar, senão a grade é refeita e o fundo treme.
        if (window.innerWidth === lastWidth) return;
        lastWidth = window.innerWidth;
        setGrid(measure());
      }, 150);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const cells = useMemo(() => {
    const total = FOOD_ICONS.length;
    const list = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const Icon = FOOD_ICONS[(r * FOOD_STEP + c) % total];
        list.push(
          <span key={`${r}-${c}`} className={c % 2 === 0 ? 'fb-cell fb-cell--up' : 'fb-cell fb-cell--down'}>
            <Icon size={26} strokeWidth={1.25} />
          </span>,
        );
      }
    }
    return list;
  }, [cols, rows]);

  return (
    <div aria-hidden="true" className="fb-layer">
      <div className="fb-ambient" />
      <div
        className="fb-pattern"
        style={{ gridTemplateColumns: `repeat(${cols}, ${CELL_W}px)`, gridAutoRows: `${CELL_H}px` }}
      >
        {cells}
      </div>
      <div className="fb-vignette" />
    </div>
  );
}

export const FoodBackdrop = memo(FoodBackdropBase);
