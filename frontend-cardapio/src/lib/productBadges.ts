// Selo "Novo" do card do cardápio: item adicionado há menos de uma semana.
// (Quem decide mostrar o selo também confere que o item ainda não tem avaliações.)
export const NEW_PRODUCT_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isNewProduct(createdAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!createdAt) return false;
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return false;
  // Sem limite inferior de propósito: relógio do aparelho alguns minutos atrás
  // do servidor deixaria a idade levemente negativa, e o item continua "novo".
  return now - created < NEW_PRODUCT_DAYS * DAY_MS;
}
