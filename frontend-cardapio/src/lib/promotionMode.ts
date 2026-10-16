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

// Produtos de UMA categoria, já na ordem do cardápio. Serve às duas seções da
// tela (elegíveis e demais itens).
export interface EligibleProductGroup {
  category: Category;
  products: Product[];
}

export interface PromotionModeCatalog {
  /** Elegíveis (cobertos pela promoção e disponíveis), por categoria. */
  groups: EligibleProductGroup[];
  /** Total de produtos elegíveis (soma exata dos grupos). */
  count: number;
  /**
   * Demais itens do cardápio (fora do escopo da promoção OU indisponíveis),
   * por categoria, para a seção "logo abaixo" dos elegíveis. Item indisponível
   * continua visível (regra 14 do projeto); só não conta como elegível.
   */
  otherGroups: EligibleProductGroup[];
  /** Total de demais itens (soma exata dos otherGroups). */
  otherCount: number;
}

// Elegível = coberto pelo escopo da promoção E disponível E de categoria ativa
// (a API pública só manda as ativas; produto de categoria fora da lista não
// aparece no cardápio, então não aparece aqui em nenhuma seção). Ordem: a das
// abas do cardápio, depois displayOrder — mesma ordem do MenuPage. Todo produto
// de categoria listada cai em EXATAMENTE uma das duas seções.
export function buildPromotionModeCatalog(
  promo: Promotion,
  products: Product[],
  categories: Category[],
): PromotionModeCatalog {
  const groups: EligibleProductGroup[] = [];
  const otherGroups: EligibleProductGroup[] = [];
  let count = 0;
  let otherCount = 0;
  for (const category of categories) {
    const eligible: Product[] = [];
    const others: Product[] = [];
    for (const product of products) {
      if (product.categoryId !== category.id) continue;
      if (product.isAvailable !== false && isProductCoveredByPromotion(promo, product)) eligible.push(product);
      else others.push(product);
    }
    const byOrder = (a: Product, b: Product) => a.displayOrder - b.displayOrder;
    if (eligible.length > 0) {
      groups.push({ category, products: eligible.sort(byOrder) });
      count += eligible.length;
    }
    if (others.length > 0) {
      otherGroups.push({ category, products: others.sort(byOrder) });
      otherCount += others.length;
    }
  }
  return { groups, count, otherGroups, otherCount };
}

export type CatalogSection = 'eligible' | 'other';

/** Acha um produto em qualquer seção do catálogo (null se sumiu da lista). */
export function findCatalogProduct(
  catalog: Pick<PromotionModeCatalog, 'groups' | 'otherGroups'>,
  productId: string | null,
): { product: Product; section: CatalogSection } | null {
  if (!productId) return null;
  for (const [section, groups] of [
    ['eligible', catalog.groups],
    ['other', catalog.otherGroups],
  ] as const) {
    for (const group of groups) {
      const product = group.products.find((p) => p.id === productId);
      if (product) return { product, section };
    }
  }
  return null;
}

// Master-detail: clicar no item já aberto o recolhe; clicar em outro troca o
// painel. O estado vive na URL (?item=<id>), então a função é pura.
export const PROMOTION_ITEM_PARAM = 'item';

export function toggleSelectedProductId(current: string | null, clicked: string): string | null {
  return current === clicked ? null : clicked;
}

/** id do card no DOM (âncora de rolagem e devolução de foco ao fechar o painel). */
export const promotionCardDomId = (productId: string): string => `promo-item-${productId}`;

export interface BackStepInput {
  /** `window.history.state.idx` do react-router (0 = primeira entrada da sessão); null se indisponível. */
  historyIdx: number | null;
  /** `location.key` do react-router ('default' = entrada inicial, sem tela anterior no app). */
  routerKey: string;
  /** Esta tela empurrou uma entrada de histórico para o painel do item (?item=). */
  panelPushed: boolean;
}

/**
 * Passos de histórico que o botão "Voltar" da tela deve dar para SAIR dela, ou
 * null quando não há tela anterior confiável no app (link compartilhado, aba
 * nova): aí o chamador vai para o cardápio. Com o painel aberto por esta tela
 * há uma entrada extra (o `?item=`), então sair custa 2 passos, não 1 — senão o
 * "Voltar" só fecharia o painel.
 */
export function resolveBackStep({ historyIdx, routerKey, panelPushed }: BackStepInput): number | null {
  const steps = panelPushed ? 2 : 1;
  if (historyIdx !== null) return historyIdx >= steps ? -steps : null;
  return !panelPushed && routerKey !== 'default' ? -1 : null;
}
