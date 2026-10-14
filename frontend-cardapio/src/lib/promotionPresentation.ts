// Apresentação da página de detalhe da promoção (SÓ visual).
//
// Nada aqui toca em regra de negócio: não calcula desconto, não decide
// elegibilidade e não chama API. As funções só leem campos que a promoção JÁ
// tem (tipo/valor do desconto, data de término) e devolvem como mostrá-los.
// Funções puras e sem React para poderem ser testadas isoladamente.
import type { Promotion } from '../types';

// ---- Selo de destaque ------------------------------------------------------
//
// Ponto único para evoluir os selos. Hoje o selo é DERIVADO de dados que já
// existem (nunca inventa um fato: não há "Mais popular" porque não há métrica
// de popularidade). Quando existir um campo próprio no cadastro da promoção
// (ex.: `badge`), basta ler ele em `getPromotionBadgeKind` antes das regras.

export type PromotionBadgeKind = 'endingSoon' | 'hotDeal' | 'featured';

export const PROMOTION_BADGE_RULES = {
  /** Faltando até este tempo para terminar, o selo vira "Termina em breve". */
  endingSoonWindowMs: 48 * 60 * 60 * 1000,
  /** Desconto percentual a partir deste valor ganha o selo "Hot deal". */
  hotDealMinPercentage: 50,
} as const;

type BadgeSource = Pick<Promotion, 'discountType' | 'discountValue' | 'endsAt'>;

export function getPromotionBadgeKind(promo: BadgeSource, now: number = Date.now()): PromotionBadgeKind {
  if (promo.endsAt) {
    const remainingMs = new Date(promo.endsAt).getTime() - now;
    if (Number.isFinite(remainingMs) && remainingMs > 0 && remainingMs <= PROMOTION_BADGE_RULES.endingSoonWindowMs) {
      return 'endingSoon';
    }
  }
  if (promo.discountType === 'percentage' && Number(promo.discountValue) >= PROMOTION_BADGE_RULES.hotDealMinPercentage) {
    return 'hotDeal';
  }
  return 'featured';
}

// ---- Valor de destaque (ex.: percentual ou valor em reais) -----------------

export interface PromotionHeroValue {
  kind: 'percentage' | 'amount';
  /** Texto pronto para o número grande, sem o "OFF". */
  text: string;
}

function trimDecimals(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '').replace('.', ',');
}

export function getPromotionHeroValue(promo: Pick<Promotion, 'discountType' | 'discountValue'>): PromotionHeroValue {
  const value = Number(promo.discountValue);
  if (promo.discountType === 'percentage') {
    return { kind: 'percentage', text: `${trimDecimals(value)}%` };
  }
  const amount = Number.isInteger(value) ? String(value) : value.toFixed(2).replace('.', ',');
  return { kind: 'amount', text: `R$ ${amount}` };
}

/**
 * Escala do número grande conforme o TAMANHO do texto, para qualquer valor que
 * o admin cadastre ("5%", "100%", "12,75%", "R$ 10", "R$ 1000,50") caber sem
 * estourar a largura. Só apresentação.
 */
export type HeroNumberScale = 'short' | 'medium' | 'long' | 'xlong';

export function getHeroNumberScale(text: string): HeroNumberScale {
  const length = text.length;
  if (length <= 4) return 'short';
  if (length <= 6) return 'medium';
  if (length <= 8) return 'long';
  return 'xlong';
}

// ---- Cor com transparência -------------------------------------------------

/** `#rgb`/`#rrggbb` + alfa -> `rgba(...)`. Outros formatos CSS caem em color-mix. */
export function withAlpha(color: string, alpha: number): string {
  const a = Math.min(1, Math.max(0, alpha));
  const hex = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const raw = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1];
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  return `color-mix(in srgb, ${color} ${Math.round(a * 100)}%, transparent)`;
}

export function formatBRL(value: number): string {
  return Number(value).toFixed(2).replace('.', ',');
}

// ---- Contraste (cor da marca nunca pode deixar texto ilegível) ---------------

function parseHex(color: string): [number, number, number] | null {
  const hex = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!hex) return null;
  const raw = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1];
  return [parseInt(raw.slice(0, 2), 16), parseInt(raw.slice(2, 4), 16), parseInt(raw.slice(4, 6), 16)];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: string, b: string): number {
  const pa = parseHex(a);
  const pb = parseHex(b);
  if (!pa || !pb) return 1;
  const la = relativeLuminance(pa);
  const lb = relativeLuminance(pb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Texto escuro ou branco, o que tiver mais contraste sobre `background`. */
export function readableTextOn(background: string): string {
  return contrastRatio(background, '#FFFFFF') >= contrastRatio(background, '#111827') ? '#FFFFFF' : '#111827';
}

/**
 * Cor de destaque para usar SOBRE superfície escura (ex.: a placa de vidro do
 * desconto): a cor da marca se ela tiver contraste suficiente (>= 3:1) com o
 * fundo; senão branco. Assim a identidade aparece quando funciona e nunca some.
 */
export function pickAccentOnDark(brand: string, darkBackground: string = '#1A1A1A'): string {
  return contrastRatio(brand, darkBackground) >= 3 ? brand : '#FFFFFF';
}
