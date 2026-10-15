// Badges de produto — catálogo e contratos (módulo PURO: sem Nest/TypeORM, testado
// sem banco em test/product-badges-pure-audit.ts).
//
// TRÊS categorias, sempre separadas:
//  1. DECLARATIVOS  — afirmações que só o restaurante pode fazer. Ficam em
//     `products.badges` (text[] de CÓDIGOS estáveis) e o admin liga/desliga.
//  2. COMPORTAMENTAIS — calculados pelo sistema com regras determinísticas
//     (behavioral-badge-rules.ts). O admin NÃO controla: se pudesse marcar
//     "mais pedido" em tudo, o selo perderia a credibilidade.
//  3. ANALÍTICOS (SIOD) — RESERVADO. Só o contrato existe (kind 'analytical',
//     escopo por período/canal); nenhum código está ativo ainda.
//
// Códigos são identificadores estáveis (snake_case, nunca texto de tela): o texto
// vive no i18n de cada app. Adicionar um código novo NÃO exige migration.

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

// "Imagem ilustrativa" não é um selo de texto: o app o desenha sobre a foto.
// Por isso não conta no limite de selos da linha de destaques.
export const IMAGE_NOTICE_BADGE: DeclaredBadgeCode = 'illustrative_image';

// Limite de selos declarativos "de texto" por produto (design: sem poluir a tela).
export const MAX_DECLARED_CHIP_BADGES = 6;

export const BEHAVIORAL_BADGE_CODES = ['top_ordered', 'customer_favorite', 'trending'] as const;
export type BehavioralBadgeCode = (typeof BEHAVIORAL_BADGE_CODES)[number];

// SIOD (futuro). Ex. planejados: popular_lunch, popular_dinner, popular_delivery,
// popular_pickup, fast_growth, regional_trend, top_conversion, top_retention.
// Vazio de propósito: o tipo `AutoBadge` abaixo já aceita a variante analítica.
export const ANALYTICAL_BADGE_CODES = [] as const;
export type AnalyticalBadgeCode = (typeof ANALYTICAL_BADGE_CODES)[number];

export type BadgeDaypart = 'lunch' | 'dinner';
export type BadgeChannel = 'delivery' | 'pickup' | 'dine_in';
export interface BadgeScope {
  daypart?: BadgeDaypart;
  channel?: BadgeChannel;
}

// Selo automático (decidido pelo backend; o app só exibe).
export type AutoBadge =
  | { kind: 'behavioral'; code: BehavioralBadgeCode }
  | { kind: 'analytical'; code: AnalyticalBadgeCode; scope?: BadgeScope };

// Contrato de uma fonte de selos automáticos. Hoje existe uma (comportamental);
// o SIOD entra como OUTRA implementação, sem mexer em produto, entidade ou API.
export interface AutoBadgeInput {
  tenantId: string;
  now: Date;
}
export interface AutoBadgeProvider {
  readonly id: string;
  compute(input: AutoBadgeInput): Promise<ReadonlyMap<string, readonly AutoBadge[]>>;
}

const DECLARED_SET: ReadonlySet<string> = new Set(DECLARED_BADGE_CODES);

export function isDeclaredBadgeCode(value: unknown): value is DeclaredBadgeCode {
  return typeof value === 'string' && DECLARED_SET.has(value);
}

// Leitura tolerante: descarta códigos desconhecidos (catálogo que encolheu, dado
// antigo, backup) e repetidos, mantendo a ordem do catálogo.
export function resolveDeclaredBadges(raw: readonly unknown[] | null | undefined): DeclaredBadgeCode[] {
  const present = new Set((raw ?? []).filter(isDeclaredBadgeCode));
  return DECLARED_BADGE_CODES.filter((code) => present.has(code));
}

export function countChipBadges(codes: readonly DeclaredBadgeCode[]): number {
  return codes.filter((c) => c !== IMAGE_NOTICE_BADGE).length;
}

// Escrita estrita: código desconhecido ou excesso de selos = erro (a mensagem vai
// para o admin). Devolve a lista normalizada (sem repetidos, ordem do catálogo).
export function validateDeclaredBadges(raw: readonly string[]): { ok: true; badges: DeclaredBadgeCode[] } | { ok: false; message: string } {
  const unknown = raw.filter((c) => !isDeclaredBadgeCode(c));
  if (unknown.length > 0) {
    return { ok: false, message: `Selo desconhecido: ${unknown.join(', ')}.` };
  }
  const badges = resolveDeclaredBadges(raw);
  if (countChipBadges(badges) > MAX_DECLARED_CHIP_BADGES) {
    return { ok: false, message: `Escolha no máximo ${MAX_DECLARED_CHIP_BADGES} selos por produto (a imagem ilustrativa não conta).` };
  }
  return { ok: true, badges };
}
