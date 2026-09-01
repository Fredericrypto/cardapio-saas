export interface Tenant {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  coverImageUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  instagramHandle: string | null;
  pixEnabled: boolean;
}

// Uma loja física (filial) — endereço, horário, entrega. O cliente
// escolhe uma antes de ver o cardápio (igual McDonald's), exceto no
// fluxo de mesa, que já resolve sozinho pela mesa escaneada.
export interface Location {
  id: string;
  tenantId: string;
  name: string;
  whatsappNumber: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  isOpen: boolean;
  isOpenNow: boolean;
  openingHours: Record<string, string> | null;
  deliveryFee: number;
  deliveryFeePerKm: number;
  deliveryMaxRadiusKm: number | null;
  minOrderValue: number;
  // Só vem preenchido quando falta menos de 1h pra fechar — usado no
  // aviso "Fecha em Xh".
  closingInMinutes: number | null;
  // Calculado no cliente (não vem do backend) — distância até o GPS do
  // usuário, só usada pra ordenar/mostrar na tela de escolha de loja.
  distanceKm?: number;
}

// Promoção real (não cosmética) — vira os cards no topo do cardápio,
// no molde iFood/McDonald's: banner com foto (própria ou herdada do
// produto vinculado), escopo (tudo / categoria / produto), validade com
// contagem regressiva, e reconhecimento de "você já usou" quando
// logado. O desconto de verdade é sempre calculado e aplicado no
// BACKEND na hora do pedido — o que vem aqui é só o texto/exibição.
export interface Promotion {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  maxDiscountAmount: number | null;
  minOrderValue: number;
  scope: 'all' | 'category' | 'product';
  categoryIds: string[];
  productIds: string[];
  usageLimitPerCustomer: number | null;
  // Quantas UNIDADES elegíveis, no máximo, entram no cálculo do
  // desconto — null = sem limite (desconto escala com a quantidade,
  // igual sempre foi). Com um número aqui, o desconto fica travado
  // nessas unidades mesmo que o cliente adicione mais do mesmo item —
  // usado pra isolar visualmente essas unidades no carrinho (ver
  // lib/promotionEligibility.ts).
  maxEligibleQuantity: number | null;
  endsAt: string | null;
  alreadyUsedUp: boolean;
}

export interface Category {
  id: string;
  tenantId: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
}

export interface ProductOptionValue {
  id: string;
  label: string;
  priceDelta: number;
  isAvailable: boolean;
}

export interface ProductOptionGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  values: ProductOptionValue[];
}

export interface Product {
  id: string;
  tenantId: string;
  categoryId: string;
  name: string;
  description: string | null;
  price: number;
  promoPrice: number | null;
  imageUrl: string | null;
  isAvailable: boolean;
  displayOrder: number;
  options?: ProductOptionGroup[];
}

export interface SelectedCartOption {
  valueId: string;
  groupName: string;
  label: string;
  priceDelta: number;
}

// Item dentro do carrinho local (antes de virar pedido). lineKey
// distingue customizações diferentes do MESMO produto (ex: "Burger sem
// cebola" e "Burger com bacon" são duas linhas separadas, não uma só) —
// ver contexts/CartContext.tsx.
export interface CartItem {
  lineKey: string;
  product: Product;
  quantity: number;
  selectedOptions: SelectedCartOption[];
}

export interface CreateOrderPayload {
  customerName?: string;
  customerPhone?: string;
  tableNumber?: string;
  tableSessionId?: string;
  // Obrigatório pra balcão/entrega (o cliente escolhe a loja antes do
  // cardápio); ignorado pra mesa, que resolve sozinha pela mesa escaneada.
  locationId?: string;
  orderType: 'balcao' | 'mesa' | 'entrega';
  notes?: string;
  // Endereço estruturado — obrigatório só quando orderType === 'entrega'.
  // Estruturado (não texto único) pra maior
  // precisão de geocodificação.
  deliveryStreet?: string;
  deliveryAddressNumber?: string;
  deliveryNeighborhood?: string;
  deliveryCity?: string;
  deliveryState?: string;
  deliveryPostcode?: string;
  deliveryReferencePoint?: string;
  // Escolhida na etapa de pagamento do carrinho (só balcão/entrega —
  // mesa paga depois, com o admin, ao fechar a conta).
  paymentMethod?: 'dinheiro' | 'cartao' | 'pix';
  tipAmount?: number;
  // Cupom que o cliente escolheu usar (tela de detalhe da promoção, ou
  // selecionado no carrinho) — nunca aplicado sozinho. Revalidado do
  // zero no backend, nunca confiado daqui.
  // Pode escolher mais de um cupom, contanto que não disputem os mesmos
  // itens do carrinho — ver PromotionsService.validateSelectedPromotions.
  promotionIds?: string[];
  // Checkbox "usar meu saldo de cashback" no carrinho — só tem efeito
  // se o cliente estiver logado e tiver saldo (ver CartPage). O valor
  // usado é sempre recalculado no backend, nunca confiado daqui.
  useCashback?: boolean;
  items: {
    productId: string;
    quantity: number;
    selectedValueIds?: string[];
  }[];
}

// O que o backend devolve ao criar o pedido — status vira
// 'aguardando_pagamento' (com pixPayload/pixExpiresAt preenchidos) só
// quando o restaurante tem Pix real habilitado; caso contrário segue o
// comportamento de sempre (status 'pendente', sem QR).
export interface CreatedOrder {
  id: string;
  status:
    | 'aguardando_pagamento'
    | 'pendente'
    | 'confirmado'
    | 'preparando'
    | 'pronto'
    | 'entregue'
    | 'cancelado';
  total?: number;
  discountAmount?: number;
  cashbackUsed?: number;
  cashbackEarned?: number;
  promotionTitleSnapshot?: string | null;
  promotionTitlesSnapshot?: string[] | null;
  pixPayload: string | null;
  pixExpiresAt: string | null;
}

export interface DeliveryAddressInput {
  street: string;
  addressNumber?: string;
  neighborhood?: string;
  city: string;
  state: string;
  postcode?: string;
}

export interface DeliveryQuote {
  distanceKm: number;
  fee: number;
  formattedAddress: string;
  precise: boolean;
}

export interface TableSession {
  id: string;
  tenantId: string;
  tableId: string;
  status: 'aberta' | 'fechamento_solicitado' | 'fechada' | 'expirada';
  openedAt: string;
  closedAt: string | null;
  tipAmount: number;
  paymentMethod: string | null;
  amountReceived: number | null;
  changeGiven: number | null;
  table?: { number: string; locationId: string } | null;
  // Calculados na hora (nunca gravados no banco) — só presentes na
  // resposta do scan/consulta de sessão de mesa, pra o timer visual no
  // frontend não precisar de uma chamada extra só pra saber isso.
  hasOrder?: boolean;
  // Presente só quando: sessão ainda sem pedido nenhum + restaurante tem
  // prazo configurado. `null`/ausente = sem prazo correndo (ou porque já
  // tem pedido, ou porque o restaurante desativou o prazo).
  expiresAt?: string | null;
}

export interface SessionSummary {
  session: TableSession;
  orders: Array<{
    id: string;
    status: string;
    total: number;
    discountAmount?: number;
    cashbackUsed?: number;
    cashbackEarned?: number;
    promotionTitleSnapshot?: string | null;
    promotionTitlesSnapshot?: string[] | null;
    createdAt: string;
    items: Array<{
      productName: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
      selectedOptions: { groupName: string; label: string; priceDelta: number }[] | null;
    }>;
  }>;
  total: number;
  tipAmount: number;
  grandTotal: number;
  customerName: string | null;
  // Código de autenticidade — null enquanto a mesa ainda está aberta
  // (o total pode mudar); só existe depois que a sessão fecha de
  // verdade. Ver TablesService.getSessionSummary.
  receiptVerificationCode: string | null;
}
