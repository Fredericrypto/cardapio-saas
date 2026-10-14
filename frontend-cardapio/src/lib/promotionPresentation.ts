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

// ---- Valor de destaque ("70%" / "R$ 10") ----------------------------------

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
