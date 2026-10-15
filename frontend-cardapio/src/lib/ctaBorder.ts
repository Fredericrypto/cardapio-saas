// Cores da borda animada dos botões de ação principal (components/AnimatedGradientButton.tsx).
//
// A borda usa a cor primária e a secundária do restaurante. No tema escuro o
// fundo da página é quase preto, então as duas passam por `accentOnDark` (clareia
// só o que for escuro demais, mantendo o matiz); no claro passam por
// `accentOnLight` (escurece só o que for claro demais, ex.: um amarelo, que some
// no branco). Cores com bom contraste passam intactas nos dois temas. O
// preenchimento do botão NÃO usa isto: continua sendo `--brand` no claro e o
// sólido claro (#E3E2E6) no escuro, como no resto do cardápio.
import { accentOnDark, accentOnLight } from './accentColor';

export const CTA_FALLBACK_PRIMARY = '#2563EB';

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Aceita só #RGB / #RRGGBB (o que o admin grava); qualquer outra coisa vira o fallback. */
export function safeHex(value: string | null | undefined, fallback: string): string {
  const v = (value ?? '').trim();
  return HEX.test(v) ? v : fallback;
}

export interface CtaBorderColors {
  brand: string;
  a: string;
  b: string;
}

export function ctaBorderColors(
  primary: string | null | undefined,
  secondary: string | null | undefined,
  isDark: boolean,
): CtaBorderColors {
  const brand = safeHex(primary, CTA_FALLBACK_PRIMARY);
  const second = safeHex(secondary, brand);
  return {
    brand,
    a: isDark ? accentOnDark(brand) : accentOnLight(brand),
    b: isDark ? accentOnDark(second) : accentOnLight(second),
  };
}
