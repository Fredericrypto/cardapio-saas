interface IconProps {
  size?: number;
  className?: string;
}

// Pedido do Felipe (19/09, refeito com fontes oficiais em 19/09):
// NENHUM desenho à mão aqui — todo caminho vetorial (`d=`) abaixo veio
// direto do pacote `simple-icons` (github.com/simple-icons/simple-icons,
// licença CC0), o projeto open source que mantém os ícones de marca
// mais usados no mundo conferidos e atualizados contra o kit de marca
// oficial de cada empresa. As cores hex também vêm do mesmo pacote
// (`simple-icons/data`), não escolhidas por mim.
//
// Duas ressalvas importantes, sem enrolação:
// - WhatsApp/Telegram/YouTube/Messenger: o `d` oficial já é o "selo"
//   inteiro (contorno + recorte do desenho por dentro, via
//   `fillRule="evenodd"`) — não precisa de nenhum fundo desenhado por
//   mim, só uma cor sólida.
// - Instagram/Facebook/TikTok/X/Gmail: o `d` oficial é só o SÍMBOLO
//   (a "câmera", o "f", a nota, o "X", o envelope) — o fundo colorido
//   é meu, usando a cor/degradê oficial documentado de cada marca.
// - O selo verificado de "Messenger" no simple-icons usa a cor atual
//   da Meta pro ícone (#0866FF, o mesmo azul do Facebook — a marca
//   unificou as duas cores há um tempo) — não é o degradê roxo/rosa
//   antigo. É a informação oficial mais atual que existe pra isso.
// - O selo verificado de "Gmail" no simple-icons é o envelope clássico
//   numa cor só (vermelho oficial do Google) — não achei uma fonte
//   igualmente verificada/livre pro ícone colorido "M" de tela inicial
//   (esse é um asset de loja de apps do Google, não um "brand mark"
//   público como os outros). Se for importante ter exatamente esse
//   segundo, me avisa que eu procuro uma fonte oficial específica do
//   Google pra ele.
//
// Atualização 19/09 (sessão S): Gmail, TikTok, Facebook e Instagram
// foram substituídos pelos SVGs oficiais que o Felipe colou direto
// (fonte dele, não mais o pacote simple-icons) — só ajustei o
// width/height via a prop `size` pra bater com o padrão dos outros
// ícones, sem mexer no viewBox nem nas cores/degradês originais.
// YouTube manteve o mesmo path oficial, só trocou o fill sólido
// vermelho por um degradê (#FF1A47 → #FF1DCF) a pedido dele.

export function WhatsAppIcon({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
      {/* Miolo branco fixo: o glifo é um recorte transparente do path (evenodd) e,
          sem isso, mostraria o fundo da página (escuro no tema escuro). */}
      <circle cx="12" cy="12" r="11" fill="#fff" />
      <path
        fillRule="evenodd"
        fill="#25D366"
        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"
      />
    </svg>
  );
}

export function TelegramIcon({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
      {/* Miolo branco fixo: o glifo é um recorte transparente do path (evenodd) e,
          sem isso, mostraria o fundo da página (escuro no tema escuro). */}
      <circle cx="12" cy="12" r="11.5" fill="#fff" />
      <path
        fillRule="evenodd"
        fill="#26A5E4"
        d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"
      />
    </svg>
  );
}

export function InstagramIcon({ size = 22, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 132.004 132"
      xmlnsXlink="http://www.w3.org/1999/xlink"
      className={className}
    >
      <defs>
        <linearGradient id="ig-b">
          <stop offset="0" stopColor="#3771c8" />
          <stop stopColor="#3771c8" offset=".128" />
          <stop offset="1" stopColor="#6600ff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="ig-a">
          <stop offset="0" stopColor="#fd5" />
          <stop offset=".1" stopColor="#fd5" />
          <stop offset=".5" stopColor="#ff543e" />
          <stop offset="1" stopColor="#c837ab" />
        </linearGradient>
        <radialGradient
          id="ig-c"
          cx="158.429"
          cy="578.088"
          r="65"
          xlinkHref="#ig-a"
          gradientUnits="userSpaceOnUse"
          gradientTransform="matrix(0 -1.98198 1.8439 0 -1031.402 454.004)"
          fx="158.429"
          fy="578.088"
        />
        <radialGradient
          id="ig-d"
          cx="147.694"
          cy="473.455"
          r="65"
          xlinkHref="#ig-b"
          gradientUnits="userSpaceOnUse"
          gradientTransform="matrix(.17394 .86872 -3.5818 .71718 1648.348 -458.493)"
          fx="147.694"
          fy="473.455"
        />
      </defs>
      <path
        fill="url(#ig-c)"
        d="M65.03 0C37.888 0 29.95.028 28.407.156c-5.57.463-9.036 1.34-12.812 3.22-2.91 1.445-5.205 3.12-7.47 5.468C4 13.126 1.5 18.394.595 24.656c-.44 3.04-.568 3.66-.594 19.188-.01 5.176 0 11.988 0 21.125 0 27.12.03 35.05.16 36.59.45 5.42 1.3 8.83 3.1 12.56 3.44 7.14 10.01 12.5 17.75 14.5 2.68.69 5.64 1.07 9.44 1.25 1.61.07 18.02.12 34.44.12 16.42 0 32.84-.02 34.41-.1 4.4-.207 6.955-.55 9.78-1.28 7.79-2.01 14.24-7.29 17.75-14.53 1.765-3.64 2.66-7.18 3.065-12.317.088-1.12.125-18.977.125-36.81 0-17.836-.04-35.66-.128-36.78-.41-5.22-1.305-8.73-3.127-12.44-1.495-3.037-3.155-5.305-5.565-7.624C116.9 4 111.64 1.5 105.372.596 102.335.157 101.73.027 86.19 0H65.03z"
        transform="translate(1.004 1)"
      />
      <path
        fill="url(#ig-d)"
        d="M65.03 0C37.888 0 29.95.028 28.407.156c-5.57.463-9.036 1.34-12.812 3.22-2.91 1.445-5.205 3.12-7.47 5.468C4 13.126 1.5 18.394.595 24.656c-.44 3.04-.568 3.66-.594 19.188-.01 5.176 0 11.988 0 21.125 0 27.12.03 35.05.16 36.59.45 5.42 1.3 8.83 3.1 12.56 3.44 7.14 10.01 12.5 17.75 14.5 2.68.69 5.64 1.07 9.44 1.25 1.61.07 18.02.12 34.44.12 16.42 0 32.84-.02 34.41-.1 4.4-.207 6.955-.55 9.78-1.28 7.79-2.01 14.24-7.29 17.75-14.53 1.765-3.64 2.66-7.18 3.065-12.317.088-1.12.125-18.977.125-36.81 0-17.836-.04-35.66-.128-36.78-.41-5.22-1.305-8.73-3.127-12.44-1.495-3.037-3.155-5.305-5.565-7.624C116.9 4 111.64 1.5 105.372.596 102.335.157 101.73.027 86.19 0H65.03z"
        transform="translate(1.004 1)"
      />
      <path
        fill="#fff"
        d="M66.004 18c-13.036 0-14.672.057-19.792.29-5.11.234-8.598 1.043-11.65 2.23-3.157 1.226-5.835 2.866-8.503 5.535-2.67 2.668-4.31 5.346-5.54 8.502-1.19 3.053-2 6.542-2.23 11.65C18.06 51.327 18 52.964 18 66s.058 14.667.29 19.787c.235 5.11 1.044 8.598 2.23 11.65 1.227 3.157 2.867 5.835 5.536 8.503 2.667 2.67 5.345 4.314 8.5 5.54 3.054 1.187 6.543 1.996 11.652 2.23 5.12.233 6.755.29 19.79.29 13.037 0 14.668-.057 19.788-.29 5.11-.234 8.602-1.043 11.656-2.23 3.156-1.226 5.83-2.87 8.497-5.54 2.67-2.668 4.31-5.346 5.54-8.502 1.18-3.053 1.99-6.542 2.23-11.65.23-5.12.29-6.752.29-19.788 0-13.036-.06-14.672-.29-19.792-.24-5.11-1.05-8.598-2.23-11.65-1.23-3.157-2.87-5.835-5.54-8.503-2.67-2.67-5.34-4.31-8.5-5.535-3.06-1.187-6.55-1.996-11.66-2.23-5.12-.233-6.75-.29-19.79-.29zm-4.306 8.65c1.278-.002 2.704 0 4.306 0 12.816 0 14.335.046 19.396.276 4.68.214 7.22.996 8.912 1.653 2.24.87 3.837 1.91 5.516 3.59 1.68 1.68 2.72 3.28 3.592 5.52.657 1.69 1.44 4.23 1.653 8.91.23 5.06.28 6.58.28 19.39s-.05 14.33-.28 19.39c-.214 4.68-.996 7.22-1.653 8.91-.87 2.24-1.912 3.835-3.592 5.514-1.68 1.68-3.275 2.72-5.516 3.59-1.69.66-4.232 1.44-8.912 1.654-5.06.23-6.58.28-19.396.28-12.817 0-14.336-.05-19.396-.28-4.68-.216-7.22-.998-8.913-1.655-2.24-.87-3.84-1.91-5.52-3.59-1.68-1.68-2.72-3.276-3.592-5.517-.657-1.69-1.44-4.23-1.653-8.91-.23-5.06-.276-6.58-.276-19.398s.046-14.33.276-19.39c.214-4.68.996-7.22 1.653-8.912.87-2.24 1.912-3.84 3.592-5.52 1.68-1.68 3.28-2.72 5.52-3.592 1.692-.66 4.233-1.44 8.913-1.655 4.428-.2 6.144-.26 15.09-.27zm29.928 7.97c-3.18 0-5.76 2.577-5.76 5.758 0 3.18 2.58 5.76 5.76 5.76 3.18 0 5.76-2.58 5.76-5.76 0-3.18-2.58-5.76-5.76-5.76zm-25.622 6.73c-13.613 0-24.65 11.037-24.65 24.65 0 13.613 11.037 24.645 24.65 24.645C79.617 90.645 90.65 79.613 90.65 66S79.616 41.35 66.003 41.35zm0 8.65c8.836 0 16 7.163 16 16 0 8.836-7.164 16-16 16-8.837 0-16-7.164-16-16 0-8.837 7.163-16 16-16z"
      />
    </svg>
  );
}

export function FacebookIcon({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 509.64" className={className}>
      <rect fill="#0866FF" width="512" height="509.64" rx="115.612" ry="115.612" />
      <path
        fill="#fff"
        d="M287.015 509.64h-92.858V332.805h-52.79v-78.229h52.79v-33.709c0-87.134 39.432-127.522 124.977-127.522 16.217 0 44.203 3.181 55.651 6.361v70.915c-6.043-.636-16.536-.953-29.576-.953-41.976 0-58.194 15.9-58.194 57.241v27.667h83.618l-14.365 78.229h-69.253V509.64z"
      />
    </svg>
  );
}

export function YoutubeIcon({ size = 22, className }: IconProps) {
  const gradId = 'yt-grad';
  return (
    // viewBox quadrado 24x24 (o path do play já é centrado nele, sem
    // `translate`) pra ter a MESMA caixa dos outros ícones; a folga de
    // 0,5 unidade em volta + overflow visível evita cortar os cantos
    // arredondados nas bordas.
    <svg
      width={size}
      height={size}
      viewBox="-0.5 -0.5 25 25"
      overflow="visible"
      className={className}
    >
      <defs>
        {/* Degradê pedido pelo Felipe (19/09; proporção 60%/40% em
            28/09): vermelho YouTube (#FF1A47) sólido até 60% do ícone,
            transicionando pro magenta vibrante (#FF1DCF) nos 40%
            finais. */}
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0" stopColor="#FF1A47" />
          <stop offset="0.6" stopColor="#FF1A47" />
          <stop offset="1" stopColor="#FF1DCF" />
        </linearGradient>
      </defs>
      {/* Miolo branco fixo atrás do triângulo (recorte transparente do path). */}
      <rect x="8" y="7" width="9" height="10" fill="#fff" />
      <path
        fillRule="evenodd"
        fill={`url(#${gradId})`}
        d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"
      />
    </svg>
  );
}

export function TikTokIcon({ size = 22, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fillRule="evenodd"
      clipRule="evenodd"
      shapeRendering="geometricPrecision"
      textRendering="geometricPrecision"
      imageRendering="optimizeQuality"
      className={className}
    >
      <rect width="512" height="512" rx="116.056" ry="116.056" />
      <path
        fill="#2DCCD3"
        fillRule="nonzero"
        d="M348.868 152.076c12.815 13.213 28.795 21.265 44.9 24.93v-9.922c-15.132-1.073-30.964-5.834-44.9-15.008zm-92.569-65.444v221.885c0 29.069-20.892 47.767-46.296 47.767-8.427 0-16.43-1.969-23.386-5.609 8.826 11.269 22.762 17.751 38.045 17.751 25.405 0 46.297-18.698 46.297-47.793V98.748h40.263a110.44 110.44 0 01-2.693-12.116h-52.23zm-33.033 128.992V204.63c-5.086-.848-10.172-1.122-14.385-1.122-57.316 0-105.309 45.998-105.309 103.04 0 37.446 18.225 69.457 45.923 88.405-19.296-19.147-31.263-45.948-31.263-76.289 0-56.943 47.843-102.915 105.034-103.04z"
      />
      <path
        fill="#F1204A"
        fillRule="nonzero"
        d="M314.438 304.852c0 70.854-54.199 108.4-105.283 108.4-22.114 0-42.657-6.681-59.66-18.299 19.097 18.947 45.375 30.415 74.319 30.415 51.084 0 105.284-37.546 105.284-108.399V201.514c-5.086-3.441-9.973-7.455-14.66-12.142v115.48zm-127.82 45.824c-6.233-7.879-9.948-18.076-9.948-30.043 0-33.582 26.252-51.332 61.255-47.643v-56.244c-5.085-.847-10.171-1.122-14.41-1.122h-.249v45.225c-35.003-3.664-61.256 14.061-61.256 47.668 0 19.645 10.048 34.554 24.608 42.159zm207.151-173.67v42.009c-23.261 0-45.275-4.438-64.671-17.501 22.587 22.587 49.986 29.642 79.33 29.642V179.2a90.834 90.834 0 01-14.659-2.194zm-44.901-24.93c-12.391-12.74-21.84-30.292-25.679-53.328h-11.967c6.831 24.906 20.892 42.283 37.646 53.328z"
      />
      <path
        fill="#fff"
        fillRule="nonzero"
        d="M209.155 413.252c51.083 0 105.283-37.547 105.283-108.4v-115.48c4.688 4.687 9.574 8.701 14.66 12.141 19.396 13.065 41.41 17.502 64.671 17.502v-42.009c-16.106-3.664-32.087-11.717-44.901-24.93-16.754-11.045-30.815-28.422-37.646-53.328h-40.263v221.886c0 29.094-20.893 47.792-46.297 47.792-15.283 0-29.219-6.482-38.045-17.751-14.559-7.603-24.606-22.513-24.606-42.158 0-33.607 26.252-51.333 61.255-47.668v-45.225c-57.192.125-105.035 46.098-105.035 103.04 0 30.341 11.967 57.141 31.265 76.288 17.002 11.618 37.545 18.3 59.659 18.3z"
      />
    </svg>
  );
}

export function TwitterXIcon({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
      <rect width="24" height="24" rx="6.5" fill="#000" />
      <path
        fill="#fff"
        transform="translate(2.3 2.3) scale(0.81)"
        d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z"
      />
    </svg>
  );
}

export function GmailIcon({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 192 192" className={className}>
      <defs>
        <linearGradient id="gmail-grad-a" x1="165" x2="165" y1="44" y2="166" gradientUnits="userSpaceOnUse">
          <stop stopColor="#60d673" />
          <stop offset=".17" stopColor="#42c868" />
          <stop offset=".39" stopColor="#0ebc5f" />
          <stop offset=".62" stopColor="#00a9bb" />
          <stop offset=".86" stopColor="#3c90ff" />
          <stop offset="1" stopColor="#3186ff" />
        </linearGradient>
        <linearGradient id="gmail-grad-b" x1="8" x2="184" y1="46.13" y2="46.13" gradientUnits="userSpaceOnUse">
          <stop offset=".08" stopColor="#ff63a0" />
          <stop offset=".3" stopColor="#fc413d" />
          <stop offset=".5" stopColor="#fc413d" />
          <stop offset=".65" stopColor="#fc413d" />
          <stop offset=".72" stopColor="#fc5c30" />
          <stop offset=".86" stopColor="#feb10c" />
          <stop offset=".91" stopColor="#fec700" />
          <stop offset=".96" stopColor="#ffdb0f" />
        </linearGradient>
      </defs>
      <path fill="url(#gmail-grad-a)" d="M146 44h38v110c0 6.627-5.373 12-12 12h-20a6 6 0 0 1-6-6z" />
      <path fill="#fc413d" d="M46 44H8v110c0 6.627 5.373 12 12 12h20a6 6 0 0 0 6-6z" />
      <path
        fill="url(#gmail-grad-b)"
        d="M39.226 30.456c-8.033-6.752-20.018-5.714-26.77 2.319-6.752 8.032-5.714 20.017 2.319 26.77l76.078 63.949a8 8 0 0 0 10.295 0l76.078-63.95c8.032-6.752 9.07-18.737 2.318-26.77-6.752-8.032-18.737-9.07-26.769-2.318L96 78.18z"
      />
    </svg>
  );
}

export function MessengerIcon({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
      {/* Miolo branco fixo: o glifo é um recorte transparente do path (evenodd) e,
          sem isso, mostraria o fundo da página (escuro no tema escuro). */}
      <circle cx="12" cy="11.64" r="11" fill="#fff" />
      <path
        fillRule="evenodd"
        fill="#0866FF"
        d="M12 0C5.24 0 0 4.952 0 11.64c0 3.499 1.434 6.521 3.769 8.61a.96.96 0 0 1 .323.683l.065 2.135a.96.96 0 0 0 1.347.85l2.381-1.053a.96.96 0 0 1 .641-.046A13 13 0 0 0 12 23.28c6.76 0 12-4.952 12-11.64S18.76 0 12 0m6.806 7.44c.522-.03.971.567.63 1.094l-4.178 6.457a.707.707 0 0 1-.977.208l-3.87-2.504a.44.44 0 0 0-.49.007l-4.363 3.01c-.637.438-1.415-.317-.995-.966l4.179-6.457a.706.706 0 0 1 .977-.21l3.87 2.505c.15.097.344.094.491-.007l4.362-3.008a.7.7 0 0 1 .364-.13"
      />
    </svg>
  );
}
