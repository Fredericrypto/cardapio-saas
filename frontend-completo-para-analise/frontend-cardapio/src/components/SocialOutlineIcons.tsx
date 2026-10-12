import type { ReactNode } from 'react';

// Ícones de redes sociais em TRAÇO FINO (outlined), todos no mesmo desenho
// base: viewBox 24x24, `currentColor`, traço 1.5 e pontas arredondadas — o
// mesmo estilo dos ícones lucide usados no resto do app. A cor vem do texto
// do pai (nada de cores de marca), então acompanham o tema claro/escuro.
//
// Usados só no painel "Informações" do cardápio. Os ícones coloridos oficiais
// continuam em BrandIcons.tsx (usados em outros lugares).

interface OutlineIconProps {
  size?: number;
}

function Outline({ size = 20, children }: OutlineIconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function WhatsAppOutlineIcon(props: OutlineIconProps) {
  return (
    <Outline {...props}>
      <path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" />
      <path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1" />
    </Outline>
  );
}

export function TelegramOutlineIcon(props: OutlineIconProps) {
  return (
    <Outline {...props}>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </Outline>
  );
}

export function InstagramOutlineIcon(props: OutlineIconProps) {
  return (
    <Outline {...props}>
      <rect x="2.5" y="2.5" width="19" height="19" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <path d="M17.5 6.5h.01" />
    </Outline>
  );
}

export function FacebookOutlineIcon(props: OutlineIconProps) {
  return (
    <Outline {...props}>
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </Outline>
  );
}

export function YoutubeOutlineIcon(props: OutlineIconProps) {
  return (
    <Outline {...props}>
      <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
      <path d="m10 15 5-3-5-3z" />
    </Outline>
  );
}

export function TikTokOutlineIcon(props: OutlineIconProps) {
  return (
    <Outline {...props}>
      <path d="M21 7.917v4.034a9.948 9.948 0 0 1-5-1.951v4.5a6.5 6.5 0 1 1-8-6.326v4.326a2.5 2.5 0 1 0 4 2v-11.5h4.083a6.005 6.005 0 0 0 4.917 4.917z" />
    </Outline>
  );
}

export function XOutlineIcon(props: OutlineIconProps) {
  return (
    <Outline {...props}>
      <path d="M4 4l11.733 16h4.267l-11.733-16z" />
      <path d="M4 20l6.768-6.768m2.46-2.46L20 4" />
    </Outline>
  );
}

export function MessengerOutlineIcon(props: OutlineIconProps) {
  return (
    <Outline {...props}>
      <path d="M3 20l1.3-3.9c-2.324-3.437-1.426-7.872 2.1-10.374 3.526-2.501 8.59-2.296 11.845.48 3.255 2.777 3.695 7.266 1.029 10.501-2.666 3.235-7.615 4.215-11.574 2.293l-4.7 1" />
      <path d="M8 13l3-2 2 2 3-2" />
    </Outline>
  );
}

export function EmailOutlineIcon(props: OutlineIconProps) {
  return (
    <Outline {...props}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </Outline>
  );
}
