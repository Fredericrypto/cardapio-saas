interface IconProps {
  size?: number;
  className?: string;
}

// Pedido do Felipe (18/09): ícones com "aparência oficial" — cor de
// marca + glifo branco, no mesmo formato de badge que toda plataforma
// disponibiliza no próprio kit de marca pra "siga a gente"/"fale com a
// gente" (não é rastreamento pixel a pixel do logotipo registrado —
// evita qualquer questão de reprodução de arte-final —, mas
// reconhecível na hora). Todos os ícones seguem o MESMO estilo de
// badge agora, incluindo WhatsApp/Instagram, que antes eram só um
// traço monocromático simplificado.

export function WhatsAppIcon({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className}>
      <circle cx="24" cy="24" r="24" fill="#25D366" />
      <path
        d="M24 12.5c-6.4 0-11.5 5.1-11.5 11.5 0 2 .5 3.9 1.5 5.6L13 35.5l6-1.6c1.7 1 3.5 1.5 5 1.5 6.4 0 11.5-5.1 11.5-11.5S30.4 12.5 24 12.5z"
        fill="#fff"
      />
      <path
        d="M20.2 19.4c.2-.5.5-.5.7-.5h.5c.2 0 .4 0 .6.4.2.5.7 1.6.7 1.7.1.1.1.3 0 .4-.1.2-.1.3-.3.5-.1.2-.3.3-.4.5-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.5 1.5.3.1.5.1.6-.1.2-.2.7-.8.9-1.1.2-.2.4-.2.6-.1l1.5.7c.2.1.4.2.4.4.1.4.1 1.2-.3 1.6-.4.5-1.3.9-2.1.9-.7 0-2.2-.3-4.1-1.9-2.3-2-3.4-4.3-3.5-4.5-.1-.2-.7-1-.7-2 0-1 .5-1.5.7-1.7z"
        fill="#25D366"
      />
    </svg>
  );
}

export function InstagramIcon({ size = 22, className }: IconProps) {
  const gradId = 'ig-grad';
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className}>
      <defs>
        <radialGradient id={gradId} cx="30%" cy="107%" r="150%">
          <stop offset="0" stopColor="#FFDD55" />
          <stop offset="0.1" stopColor="#FFDD55" />
          <stop offset="0.5" stopColor="#FF543E" />
          <stop offset="1" stopColor="#C837AB" />
        </radialGradient>
      </defs>
      <rect width="48" height="48" rx="13" fill={`url(#${gradId})`} />
      <rect x="14" y="14" width="20" height="20" rx="6" fill="none" stroke="#fff" strokeWidth="2.2" />
      <circle cx="24" cy="24" r="5.2" fill="none" stroke="#fff" strokeWidth="2.2" />
      <circle cx="30.5" cy="17.5" r="1.4" fill="#fff" />
    </svg>
  );
}

export function YoutubeIcon({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className}>
      <rect width="48" height="48" rx="12" fill="#FF0000" />
      <path d="M20 17l12 7-12 7V17z" fill="#fff" />
    </svg>
  );
}

export function FacebookIcon({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className}>
      <rect width="48" height="48" rx="12" fill="#1877F2" />
      <path
        d="M27 17.5h3.5V13h-3.9c-3.4 0-5.6 2.4-5.6 6.1v2.9H17v4.5h3.9V35h4.9v-8.5h3.7l.7-4.5h-4.4v-2.4c0-1.3.4-2.1 2.2-2.1z"
        fill="#fff"
      />
    </svg>
  );
}

export function TikTokIcon({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className}>
      <rect width="48" height="48" rx="12" fill="#000" />
      <path
        d="M29 12c.6 3 2.5 5 5.6 5.3v3.9c-2 .1-3.8-.5-5.6-1.7v8.2c0 4.3-3.5 7.3-7.3 7.3-1.6 0-3.1-.5-4.3-1.5-2-1.6-3-4.1-2.6-6.7.5-3.3 3.4-5.8 6.8-5.8.4 0 .8 0 1.2.1v4.1a3.5 3.5 0 0 0-1.4-.3 3.6 3.6 0 1 0 3.6 4V12H29z"
        fill="#fff"
      />
      <path
        d="M29 12c.6 3 2.5 5 5.6 5.3v3.9c-2 .1-3.8-.5-5.6-1.7"
        stroke="#25F4EE"
        strokeWidth="0.6"
        fill="none"
      />
      <path d="M20.4 24.9c-3.4 0-6.3 2.5-6.8 5.8" stroke="#FE2C55" strokeWidth="0.6" fill="none" />
    </svg>
  );
}

export function TwitterXIcon({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className}>
      <rect width="48" height="48" rx="12" fill="#000" />
      <path
        d="M13 13l9.1 12.2L13 35h3l7.2-8.1L29 35h6l-9.6-12.9L34 13h-3l-6.6 7.4L18.5 13h-5.5z"
        fill="#fff"
      />
    </svg>
  );
}

export function TelegramIcon({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className}>
      <circle cx="24" cy="24" r="24" fill="#26A5E4" />
      <path
        d="M34.5 15.5l-4.2 19.1c-.3 1.4-1.1 1.7-2.3 1.1l-6.4-4.7-3.1 3c-.3.3-.6.6-1.3.6l.5-6.6L29.3 17.4c.6-.5-.1-.8-.9-.3L15.5 25.7l-6.4-2c-1.4-.4-1.4-1.4.3-2.1l25-9.6c1.2-.4 2.2.3 1.9 2z"
        fill="#fff"
      />
    </svg>
  );
}

export function MessengerIcon({ size = 22, className }: IconProps) {
  const gradId = 'msgr-grad';
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="48" x2="48" y2="0">
          <stop offset="0" stopColor="#0099FF" />
          <stop offset="0.6" stopColor="#A033FF" />
          <stop offset="1" stopColor="#FF5280" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="24" fill={`url(#${gradId})`} />
      <path
        d="M24 12c-6.9 0-12.5 5.1-12.5 11.9 0 3.6 1.6 6.8 4.2 9.1v4.5l4.1-2.2c1.3.4 2.7.6 4.2.6 6.9 0 12.5-5.1 12.5-11.9S30.9 12 24 12z"
        fill="#fff"
      />
      <path d="M17.5 27.3l4.3-4.6 3.4 3 4.3-4.6-4.9 8.9-3.5-3-4.6 4.6z" fill={`url(#${gradId})`} />
    </svg>
  );
}
