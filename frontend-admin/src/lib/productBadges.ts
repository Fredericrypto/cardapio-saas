import { DECLARED_BADGE_CODES } from '../types/productBadges';
import type { DeclaredBadgeCode } from '../types/productBadges';

// Textos e agrupamento dos selos no painel (o painel é só em português).

// "Imagem ilustrativa" aparece sobre a foto no app do cliente e não conta no limite.
export const IMAGE_NOTICE_BADGE: DeclaredBadgeCode = 'illustrative_image';
// Mesmo limite do servidor (MAX_DECLARED_CHIP_BADGES) — o servidor é quem manda.
export const MAX_DECLARED_CHIP_BADGES = 4;

export const DECLARED_BADGE_LABEL: Record<DeclaredBadgeCode, string> = {
  illustrative_image: 'Imagem ilustrativa',
  selected_ingredients: 'Ingredientes selecionados',
  artisanal: 'Produção artesanal',
  always_fresh: 'Sempre fresco',
  house_recipe: 'Receita da casa',
  chef_recommended: 'Recomendado pelo chef',
  limited_edition: 'Edição limitada',
  vegan: 'Vegano',
  gluten_free: 'Sem glúten',
  lactose_free: 'Sem lactose',
  spicy: 'Picante',
  healthy_option: 'Opção saudável',
};

export const DECLARED_BADGE_GROUPS: ReadonlyArray<{ title: string; codes: readonly DeclaredBadgeCode[] }> = [
  {
    title: 'Qualidade e origem',
    codes: ['selected_ingredients', 'artisanal', 'always_fresh', 'house_recipe', 'chef_recommended', 'limited_edition'],
  },
  { title: 'Dieta e sabor', codes: ['vegan', 'gluten_free', 'lactose_free', 'spicy', 'healthy_option'] },
  { title: 'Transparência', codes: ['illustrative_image'] },
];

export const AUTO_BADGE_LABEL: Record<string, string> = {
  top_ordered: 'Mais pedido',
  customer_favorite: 'Favorito dos clientes',
  trending: 'Tendência',
};

const DECLARED_SET: ReadonlySet<string> = new Set(DECLARED_BADGE_CODES);

// Leitura tolerante: ignora códigos desconhecidos e repetidos, na ordem do catálogo.
export function resolveDeclaredBadges(raw: readonly string[] | null | undefined): DeclaredBadgeCode[] {
  const present = new Set((raw ?? []).filter((c) => DECLARED_SET.has(c)));
  return DECLARED_BADGE_CODES.filter((code) => present.has(code));
}

export function countChipBadges(codes: readonly DeclaredBadgeCode[]): number {
  return codes.filter((c) => c !== IMAGE_NOTICE_BADGE).length;
}
