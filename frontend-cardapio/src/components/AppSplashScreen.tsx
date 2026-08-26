import { useEffect, useState } from 'react';

interface AppSplashScreenProps {
  onFinish: () => void;
}

// Splash da MARCA DO APP (não do restaurante — essa é a SplashScreen.tsx,
// que já existe e continua intocada). Essa aqui aparece uma vez, logo
// depois do login, antes de entrar no cardápio.
//
// É PROPOSITALMENTE genérica: nem nome nem logo definitivos existem
// ainda (Felipe ainda não decidiu como o app vai se chamar). Por isso:
// - Usa o mesmo raio do favicon atual (`/favicon.svg`) em vez de um logo
//   próprio — quando o logo de verdade existir, é só trocar essa
//   referência (ou o próprio arquivo do favicon, já que vão ser a mesma
//   imagem).
// - Não escreve nenhum nome do app na tela — só o ícone. Assim que o
//   nome for decidido, adicionar um <h1> aqui embaixo do ícone é a única
//   mudança necessária.
// - Fundo CLARO (bg-gray-50), igual todo o resto do app e a própria
//   tela de login — nunca um preto genérico. Só o glow atrás do raio
//   usa as cores do favicon (roxo/azul).
const MIN_VISIBLE_MS = 1600;
const FADE_DURATION_MS = 400;

export function AppSplashScreen({ onFinish }: AppSplashScreenProps) {
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setIsFadingOut(true), MIN_VISIBLE_MS);
    const finishTimer = setTimeout(onFinish, MIN_VISIBLE_MS + FADE_DURATION_MS);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(finishTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-50 transition-opacity"
      style={{
        opacity: isFadingOut ? 0 : 1,
        transitionDuration: `${FADE_DURATION_MS}ms`,
        pointerEvents: isFadingOut ? 'none' : 'auto',
      }}
    >
      <div className="relative flex items-center justify-center">
        {/* Glow pulsando atrás do raio — mesma dupla de cor do favicon */}
        <div
          className="absolute w-40 h-40 rounded-full blur-3xl opacity-30 animate-pulse"
          style={{ background: 'radial-gradient(circle, #863bff 0%, transparent 70%)' }}
        />
        <img
          src="/favicon.svg"
          alt=""
          className="relative w-20 h-20 drop-shadow-[0_0_20px_rgba(134,59,255,0.35)] animate-pulse"
        />
      </div>
    </div>
  );
}
