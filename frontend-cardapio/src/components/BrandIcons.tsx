interface IconProps {
  size?: number;
  className?: string;
}

// Ícone de linha simplificado (não reproduz a marca oficial em pixel a
// pixel) — bolha de conversa com um fone de telefone dentro, no mesmo
// estilo de traço dos outros ícones do header (lucide-react).
export function WhatsAppIcon({ size = 13, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.38 5.07L2 22l5.07-1.36A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M8.4 8.6c.2-.5.5-.5.7-.5h.5c.2 0 .4 0 .6.4.2.5.7 1.6.7 1.7.1.1.1.3 0 .4-.1.2-.1.3-.3.5-.1.2-.3.3-.4.5-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.5 1.5.3.1.5.1.6-.1.2-.2.7-.8.9-1.1.2-.2.4-.2.6-.1l1.5.7c.2.1.4.2.4.4.1.4.1 1.2-.3 1.6-.4.5-1.3.9-2.1.9-.7 0-2.2-.3-4.1-1.9-2.3-2-3.4-4.3-3.5-4.5-.1-.2-.7-1-.7-2 0-1 .5-1.5.7-1.7z"
        fill="currentColor"
      />
    </svg>
  );
}

// Ícone de linha simplificado (quadrado arredondado + círculo + ponto),
// convenção genérica usada em várias bibliotecas de ícones abertas — não
// é a arte-final da marca oficial.
export function InstagramIcon({ size = 13, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
