import type { AutoBadgeDto } from '../types';
import type { TranslationKey } from '../i18n/dictionaries/pt-BR';

// Selos (badges) do produto na tela do cliente.
//
// O app só EXIBE: quem decide os selos AUTOMÁTICOS é o backend (`autoBadges`) e os
// DECLARATIVOS vêm do cadastro do restaurante (`badges`). Códigos que este app ainda
// não conhece (ex.: selos futuros do SIOD) são ignorados — nunca quebram a tela.
//
// Os códigos são os mesmos do backend (modules/products/badges/product-badges.types.ts).

export const DECLARED_BADGE_CODES = [
  'illustrative_image',
  'selected_ingredients',
  'artisanal',
  'always_fresh',
  'house_recipe',
  'chef_recommended',
  'limited_edition',
  'vegan',
  'gluten_free',
  'lactose_free',
  'spicy',
  'healthy_option',
] as const;
export type DeclaredBadgeCode = (typeof DECLARED_BADGE_CODES)[number];

// Ordem = prioridade de exibição.
export const AUTO_BADGE_CODES = ['top_ordered', 'customer_favorite', 'trending'] as const;
export type AutoBadgeCode = (typeof AUTO_BADGE_CODES)[number];

// "Imagem ilustrativa" vira um selo discreto SOBRE a foto, não um item da linha.
export const IMAGE_NOTICE_BADGE: DeclaredBadgeCode = 'illustrative_image';

// Mesmo com vários selos automáticos, a tela mostra no máximo estes (sem poluir).
export const MAX_AUTO_BADGES_SHOWN = 2;

export const BADGE_LABEL_KEY: Record<DeclaredBadgeCode | AutoBadgeCode, TranslationKey> = {
  illustrative_image: 'productBadges.illustrative_image',
  selected_ingredients: 'productBadges.selected_ingredients',
  artisanal: 'productBadges.artisanal',
  always_fresh: 'productBadges.always_fresh',
  house_recipe: 'productBadges.house_recipe',
  chef_recommended: 'productBadges.chef_recommended',
  limited_edition: 'productBadges.limited_edition',
  vegan: 'productBadges.vegan',
  gluten_free: 'productBadges.gluten_free',
  lactose_free: 'productBadges.lactose_free',
  spicy: 'productBadges.spicy',
  healthy_option: 'productBadges.healthy_option',
  top_ordered: 'productBadges.top_ordered',
  customer_favorite: 'productBadges.customer_favorite',
  trending: 'productBadges.trending',
};

const DECLARED_SET: ReadonlySet<string> = new Set(DECLARED_BADGE_CODES);
const AUTO_SET: ReadonlySet<string> = new Set(AUTO_BADGE_CODES);

export interface ProductBadgeView {
  /** Automáticos (credibilidade): vêm primeiro e têm mais destaque. */
  auto: AutoBadgeCode[];
  /** Declarativos do restaurante, sem a imagem ilustrativa. */
  declared: DeclaredBadgeCode[];
  /** Mostrar o selo "Imagem ilustrativa" sobre a foto. */
  imageNotice: boolean;
}

interface BadgeSource {
  badges?: readonly string[] | null;
  autoBadges?: readonly AutoBadgeDto[] | null;
}

export function resolveProductBadges(source: BadgeSource): ProductBadgeView {
  const auto: AutoBadgeCode[] = [];
  for (const badge of source.autoBadges ?? []) {
    // Só comportamentais sem escopo: os analíticos (SIOD) entram quando o app souber desenhá-los.
    if (badge.kind !== 'behavioral' || badge.scope) continue;
    if (!AUTO_SET.has(badge.code)) continue;
    const code = badge.code as AutoBadgeCode;
    if (!auto.includes(code)) auto.push(code);
  }

  // Prioridade fixa (credibilidade primeiro), não importa a ordem em que o servidor mandou.
  auto.sort((a, b) => AUTO_BADGE_CODES.indexOf(a) - AUTO_BADGE_CODES.indexOf(b));

  const present = new Set((source.badges ?? []).filter((c) => DECLARED_SET.has(c)));
  const declared = DECLARED_BADGE_CODES.filter((code) => code !== IMAGE_NOTICE_BADGE && present.has(code));

  return {
    auto: auto.slice(0, MAX_AUTO_BADGES_SHOWN),
    declared,
    imageNotice: present.has(IMAGE_NOTICE_BADGE),
  };
}

export function hasBadgeRow(view: ProductBadgeView): boolean {
  return view.auto.length + view.declared.length > 0;
}
