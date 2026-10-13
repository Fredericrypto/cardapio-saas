import { CreditCard } from 'lucide-react';
import type { CardBrand } from '../../lib/cardBrand';

// Marcas desenhadas em SVG próprio e simples (sem imagens externas, sem
// arquivos remotos). Nomes de bandeira são nomes próprios e não são
// traduzidos; a bandeira desconhecida usa o ícone genérico de cartão.
export const CARD_BRAND_NAMES: Record<Exclude<CardBrand, 'unknown'>, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  elo: 'Elo',
  amex: 'American Express',
  hipercard: 'Hipercard',
  diners: 'Diners Club',
};

interface CardBrandLogoProps {
  brand: CardBrand;
  /** Nome acessível da bandeira desconhecida (ex.: "Cartão"). */
  unknownLabel: string;
  className?: string;
}

const WORDMARK_FONT = "Poppins, Inter, Arial, sans-serif";

export function CardBrandLogo({ brand, unknownLabel, className = 'h-8 w-auto' }: CardBrandLogoProps) {
  if (brand === 'unknown') {
    return <CreditCard role="img" aria-label={unknownLabel} size={30} strokeWidth={1.5} className="text-white/70" />;
  }
  const label = CARD_BRAND_NAMES[brand];
  const common = { viewBox: '0 0 64 40', role: 'img', 'aria-label': label, className } as const;

  switch (brand) {
    case 'visa':
      return (
        <svg {...common}>
          <text
            x="32"
            y="29"
            textAnchor="middle"
            fontFamily={WORDMARK_FONT}
            fontSize="26"
            fontWeight="800"
            fontStyle="italic"
            fill="#F3F4F6"
            letterSpacing="-1"
          >
            VISA
          </text>
        </svg>
      );
    case 'mastercard':
      return (
        <svg {...common}>
          <circle cx="24" cy="20" r="14" fill="#EB001B" />
          <circle cx="40" cy="20" r="14" fill="#F79E1B" />
          <path d="M32 8.4a14 14 0 0 1 0 23.2 14 14 0 0 1 0-23.2Z" fill="#FF5F00" />
        </svg>
      );
    case 'elo':
      return (
        <svg {...common}>
          <text
            x="26"
            y="28"
            textAnchor="middle"
            fontFamily={WORDMARK_FONT}
            fontSize="24"
            fontWeight="700"
            fill="#F3F4F6"
          >
            elo
          </text>
          <circle cx="47" cy="14" r="3" fill="#FFCB05" />
          <circle cx="53" cy="22" r="3" fill="#00A4E0" />
          <circle cx="47" cy="30" r="3" fill="#EF4123" />
        </svg>
      );
    case 'amex':
      return (
        <svg {...common}>
          <rect x="6" y="6" width="52" height="28" rx="6" fill="#2E77BC" />
          <text
            x="32"
            y="25"
            textAnchor="middle"
            fontFamily={WORDMARK_FONT}
            fontSize="14"
            fontWeight="800"
            fill="#FFFFFF"
            letterSpacing="0.5"
          >
            AMEX
          </text>
        </svg>
      );
    case 'hipercard':
      return (
        <svg {...common}>
          <text
            x="32"
            y="23"
            textAnchor="middle"
            fontFamily={WORDMARK_FONT}
            fontSize="11.5"
            fontWeight="800"
            fill="#F3F4F6"
          >
            Hipercard
          </text>
          <rect x="8" y="28" width="48" height="3" rx="1.5" fill="#E4002B" />
        </svg>
      );
    case 'diners':
      return (
        <svg {...common}>
          <circle cx="32" cy="14" r="9" fill="none" stroke="#F3F4F6" strokeWidth="2" />
          <path d="M32 5v18" stroke="#F3F4F6" strokeWidth="2" />
          <text
            x="32"
            y="36"
            textAnchor="middle"
            fontFamily={WORDMARK_FONT}
            fontSize="9"
            fontWeight="700"
            fill="#F3F4F6"
          >
            DINERS
          </text>
        </svg>
      );
  }
}
