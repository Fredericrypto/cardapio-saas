// Selos (badges) de produto — contrato com o backend
// (backend/src/modules/products/badges/product-badges.types.ts).
//  - DECLARATIVOS: o restaurante liga/desliga aqui (`Product.badges`).
//  - AUTOMÁTICOS: calculados pelo servidor (`Product.autoBadges`), SOMENTE leitura.

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

// Código como chega do servidor: pode ser um selo futuro que este painel ainda não conhece.
export interface AutoBadge {
  kind: 'behavioral' | 'analytical';
  code: string;
}
