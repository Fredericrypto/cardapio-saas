// Modo Promoção ("explorar"): lógica PURA (sem React, sem API) da tela imersiva
// de uma promoção — rotas, lista/contagem de produtos elegíveis e agrupamento.
// Regra de escopo e dinheiro ficam em lib/promotionEligibility.ts (motor único);
// aqui só se compõe em cima dele, pra o banner nunca divergir do carrinho.
import type { Category, Product, Promotion } from '../types';
import { isProductCoveredByPromotion } from './promotionEligibility';

export interface PromotionModePaths {
  /** Tela imersiva da promoção. */
  explore: string;
  /** Detalhe da promoção (rota já existente). */
  detail: string;
  /** Cardápio padrão (sai do modo, a promoção continua no carrinho). */
  menu: string;
  cart: string;
  product: (productId: string) => string;
}

// Fluxo de mesa e fluxo geral compartilham a MESMA tela; o que muda é só o
// prefixo. O qrCodeToken vai no caminho (nunca em estado em memória), então
// recarregar, compartilhar a aba ou voltar pelo histórico mantém a mesa.
export function buildPromotionModePaths(slug: string, promotionId: string, qrCodeToken?: string): PromotionModePaths {
  const base = qrCodeToken ? `/${slug}/mesa/${qrCodeToken}` : `/${slug}`;
  return {
    explore: `${base}/promocao/${promotionId}/explorar`,
    detail: `${base}/promocao/${promotionId}`,
    menu: base,
    cart: `${base}/carrinho`,
    product: (productId: string) => `${base}/produto/${productId}`,
  };
}

export interface EligibleProductGroup {
  category: Category;
  products: Product[];
}

export interface PromotionModeCatalog {
  groups: EligibleProductGroup[];
  /** Total de produtos elegíveis (soma exata dos grupos). */
  count: number;
}

// Elegível = coberto pelo escopo da promoção E disponível E de categoria ativa
// (a API pública só manda as ativas; produto de categoria fora da lista não
// aparece no cardápio, então também não conta aqui). Ordem: a das abas do
// cardápio, depois displayOrder — mesma ordem do MenuPage.
export function buildPromotionModeCatalog(
  promo: Promotion,
  products: Product[],
  categories: Category[],
): PromotionModeCatalog {
  const groups: EligibleProductGroup[] = [];
  let count = 0;
  for (const category of categories) {
    const inCategory = products
      .filter(
        (p) => p.categoryId === category.id && p.isAvailable !== false && isProductCoveredByPromotion(promo, p),
      )
      .sort((a, b) => a.displayOrder - b.displayOrder);
    if (inCategory.length === 0) continue;
    groups.push({ category, products: inCategory });
    count += inCategory.length;
  }
  return { groups, count };
}
