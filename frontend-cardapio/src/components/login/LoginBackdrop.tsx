import { memo, useEffect, useMemo, useState } from 'react';
import { FOOD_ICONS, FOOD_STEP } from '../foodIcons';

const CELL_W = 92;
const CELL_H = 88;

function measure() {
  return {
    cols: Math.min(44, Math.ceil(window.innerWidth / CELL_W) + 2),
    rows: Math.min(26, Math.ceil(window.innerHeight / CELL_H) + 2),
  };
}

// Fundo da tela de login: ícones de comida em linhas de zigue-zague cobrindo 100% da tela,
// bem discretos. Só decoração (aria-hidden, sem toque); a malha é recalculada ao redimensionar.
function LoginBackdropBase() {
  const [{ cols, rows }, setGrid] = useState(measure);

  useEffect(() => {
    let timer = 0;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setGrid(measure()), 150);
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
          <span key={`${r}-${c}`} className={c % 2 === 0 ? 'lg-cell lg-cell--up' : 'lg-cell lg-cell--down'}>
            <Icon size={26} strokeWidth={1.25} />
          </span>,
        );
      }
    }
    return list;
  }, [cols, rows]);

  return (
    <div
      aria-hidden="true"
      className="lg-pattern"
      style={{
        gridTemplateColumns: `repeat(${cols}, ${CELL_W}px)`,
        gridAutoRows: `${CELL_H}px`,
      }}
    >
      {cells}
    </div>
  );
}

export const LoginBackdrop = memo(LoginBackdropBase);
