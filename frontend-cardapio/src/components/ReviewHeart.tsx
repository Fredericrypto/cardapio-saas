import './review-extras.css';

// Coração só do app: traço único, solto, só contorno (oco por dentro), com a linha cruzando a
// ponta de baixo como se tivesse sido desenhado à mão, um segundo traço pontilhado em "renda"
// por fora e faíscas no lobo direito. Inclinado e flutuando devagar. Cor: terracota do app (a mesma laranja da página).
export function ReviewHeart({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
      overflow="visible"
      className={`rv-heart ${className}`}
      fill="none"
      stroke="#d97757"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path
        d="M52 90 C30 74 8 56 10 34 C12 14 38 10 49 31 C58 8 88 12 90 34 C92 56 66 76 46 94"
        strokeWidth="4"
      />
      <path
        d="M52 90 C30 74 8 56 10 34 C12 14 38 10 49 31 C58 8 88 12 90 34 C92 56 66 76 46 94"
        strokeWidth="2"
        strokeDasharray="1.5 6"
        opacity="0.65"
        transform="translate(50 50) scale(1.07) translate(-50 -50)"
      />
      <path d="M84 8 L90 2 M92 15 L99 12 M76 4 L77 -3" strokeWidth="3" />
    </svg>
  );
}
