export interface Admin {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  coverImageUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  instagramHandle: string | null;
  pixKeyType: string | null;
  pixKey: string | null;
  pixMerchantCity: string | null;
  pixEnabled: boolean;
  mercadoPagoConfigured: boolean;
  mercadoPagoWebhookSecretConfigured: boolean;
  tableSessionTimeoutMinutes: number | null;
}

// Uma loja física (filial) — endereço/horário/entrega são por Location
// agora, não pelo Tenant (marca). Mesma lógica do McDonald's.
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
  closingInMinutes: number | null;
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

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  selectedOptions: { groupName: string; label: string; priceDelta: number }[] | null;
}

// Promoção real, no molde iFood/McDonald's — escopo (tudo / categoria /
// produto), limite de uso por cliente, teto global de usos, banner
// próprio ou herdado do produto vinculado. O backend recalcula e aplica
// o desconto sozinho na hora do pedido (nunca confia em nada do cliente).
export interface Promotion {
  id: string;
  tenantId: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  maxDiscountAmount: number | null;
  minOrderValue: number;
  scope: 'all' | 'category' | 'product';
  categories: Category[];
  products: Product[];
  locations: Location[];
  allowReuseAcrossLocations: boolean;
  usageLimitPerCustomer: number | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  // Quantas unidades elegíveis, no máximo, entram no cálculo do
  // desconto — null = sem limite (comportamento de sempre).
  maxEligibleQuantity: number | null;
  // "Resetar pra todos" — quando foi o último reset em massa (null =
  // nunca) e quantos clientes diferentes tinham usado até esse momento.
  usageResetAt: string | null;
  usageCountBeforeReset: number | null;
  totalDiscountGiven: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
}

export interface PromotionRedemption {
  orderId: string;
  customerId: string | null;
  customerName: string | null;
  createdAt: string;
  discountAmount: number;
  orderTotal: number;
  locationName: string | null;
}

// Uso agrupado POR CLIENTE — base pro admin decidir quem "resetar" (ver
// PromotionsService.getCustomerUsage no backend).
export interface PromotionCustomerUsage {
  customerId: string;
  customerName: string;
  usedCount: number;
  lastUsedAt: string;
  usageLimitPerCustomer: number | null;
  lastUsedLocationName: string | null;
}

export interface Order {
  id: string;
  tenantId: string;
  locationId: string | null;
  flagged: boolean;
  tableSessionId: string | null;
  notes: string | null;
  customerName: string | null;
  customerPhone: string | null;
  tableNumber: string | null;
  orderType: 'balcao' | 'mesa' | 'entrega';
  status:
    | 'aguardando_pagamento'
    | 'pendente'
    | 'confirmado'
    | 'preparando'
    | 'pronto'
    | 'entregue'
    | 'cancelado';
  total: number;
  discountAmount?: number;
  cashbackUsed?: number;
  cashbackEarned?: number;
  promotionTitleSnapshot?: string | null;
  // Fonte de verdade quando o pedido usou MAIS DE UM cupom ao mesmo
  // tempo — promotionTitleSnapshot (singular, acima) só guarda o
  // primeiro, mantido por compatibilidade com telas antigas.
  promotionTitlesSnapshot?: string[] | null;
  // Código de autenticidade — só presente na resposta de GET /orders/:id
  // (ver OrdersService.attachReceiptCode), não em listas.
  receiptVerificationCode?: string;
  deliveryFee?: number;
  deliveryAddress?: string | null;
  deliveryReferencePoint?: string | null;
  deliveryDistanceKm?: number | null;
  deliveryAddressPrecise?: boolean | null;
  paymentMethod: string | null;
  paymentStatus?: string;
  tipAmount: number;
  amountReceived?: number | null;
  pixPayload?: string | null;
  pixExpiresAt?: string | null;
  // Presente só quando o pedido foi feito por um cliente logado — nunca
  // inclui dados sensíveis (senha etc.), só o necessário pra exibir no
  // painel. Ver select explícito em OrdersService.findAllForAdmin.
  customer?: { id: string; name: string; avatarUrl: string | null } | null;
  createdAt: string;
  items?: OrderItem[];
}

export interface RestaurantTable {
  id: string;
  tenantId: string;
  locationId: string;
  number: string;
  qrCodeToken: string;
  isActive: boolean;
}

export interface WaiterCall {
  id: string;
  tenantId: string;
  tableSessionId: string;
  status: 'pendente' | 'atendido';
  createdAt: string;
  tableSession?: {
    table?: {
      number: string;
    };
  };
}

export interface TableSession {
  id: string;
  tenantId: string;
  tableId: string;
  status: 'aberta' | 'fechamento_solicitado' | 'fechada';
  openedAt: string;
  closedAt: string | null;
  tipAmount: number;
  paymentMethod: string | null;
  amountReceived: number | null;
  changeGiven: number | null;
  table?: {
    number: string;
  };
}

export interface SessionSummary {
  session: TableSession;
  orders: Order[];
  total: number;
  tipAmount: number;
  grandTotal: number;
  customerName: string | null;
}

// ---------- Histórico (expiração de 7 dias) ----------
export interface HistoryOrderItem {
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  selectedOptions: { groupName: string; label: string; priceDelta: number }[] | null;
}

export interface HistoryOrderEntry {
  type: 'avulso';
  orderId: string;
  orderType: 'balcao' | 'mesa' | 'entrega';
  customerName: string | null;
  status: Order['status'];
  createdAt: string;
  total: number;
  discountAmount?: number;
  cashbackUsed?: number;
  cashbackEarned?: number;
  promotionTitleSnapshot?: string | null;
  promotionTitlesSnapshot?: string[] | null;
  flagged: boolean;
  expiresAt: string | null;
  deliveryAddress?: string | null;
  deliveryReferencePoint?: string | null;
  deliveryDistanceKm?: number | null;
  deliveryAddressPrecise?: boolean | null;
  paymentMethod: string | null;
  tipAmount: number;
  amountReceived?: number | null;
  items: HistoryOrderItem[];
}

export interface HistorySessionEntry {
  type: 'mesa';
  sessionId: string;
  tableNumber: string | null;
  customerName: string | null;
  closedAt: string | null;
  paymentMethod: string | null;
  tipAmount: number;
  total: number;
  flagged: boolean;
  expiresAt: string | null;
  orders: HistoryOrderEntry[];
}

export interface HistoryResponse {
  sessions: HistorySessionEntry[];
  standaloneOrders: HistoryOrderEntry[];
}

// ---------- Fidelidade ----------

export type RewardType = 'sobremesa' | 'brinde' | 'camiseta' | 'refeicao' | 'cashback' | 'desconto' | 'outro';

export interface LoyaltyProgram {
  id: string;
  name: string;
  description: string | null;
  stampsRequired: number;
  rewardType: RewardType;
  rewardDescription: string;
  cashbackAmount: number | null;
  discountType: 'percentage' | 'fixed' | null;
  discountValue: number | null;
  minOrderValue: number;
  isActive: boolean;
  locations: Location[];
  createdAt: string;
}

export interface LoyaltyProgramPayload {
  name?: string;
  description?: string;
  stampsRequired?: number;
  rewardType?: RewardType;
  rewardDescription?: string;
  cashbackAmount?: number;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  minOrderValue?: number;
  isActive?: boolean;
  locationIds?: string[];
}

export interface LoyaltyReward {
  id: string;
  programId: string;
  customerId: string;
  status: 'pendente' | 'resgatado';
  grantedAt: string;
  redeemedAt: string | null;
  redeemedByStaffName: string | null;
  program?: LoyaltyProgram;
  customer?: { id: string; name: string };
}

export type RedemptionPurpose = 'reembolso' | 'reclamacao' | 'retirada' | 'fidelidade' | 'outro';

export interface ReceiptRedemption {
  id: string;
  sourceType: 'avulso' | 'mesa';
  sourceId: string;
  purpose: RedemptionPurpose;
  staffName: string;
  notes: string | null;
  createdAt: string;
}

export interface RedeemResult {
  alreadyRedeemed: boolean;
  redemption: ReceiptRedemption;
  stampProgress: { stampsCount: number; stampsRequired: number; rewardJustGranted: boolean } | null;
}

// ---------- Cashback ----------

export interface CashbackSettings {
  id: string;
  name: string;
  isActive: boolean;
  percentage: number;
  minOrderValue: number;
  maxCashbackPerOrder: number | null;
  maxCashbackPerCustomerPerDay: number | null;
  expirationDays: number | null;
  promoText: string | null;
  locations: Location[];
  createdAt: string;
}

export interface CashbackSettingsPayload {
  name?: string;
  percentage?: number;
  minOrderValue?: number;
  maxCashbackPerOrder?: number | null;
  maxCashbackPerCustomerPerDay?: number | null;
  expirationDays?: number | null;
  promoText?: string;
  isActive?: boolean;
  locationIds?: string[];
}

// ---------- Reviews ----------

export interface RatingDistribution {
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
}

export interface ReviewSummary {
  average: number;
  count: number;
  distribution: RatingDistribution;
}

export interface AdminReview {
  id: string;
  rating: number;
  comment: string | null;
  customerName: string;
  isAnonymous: boolean;
  locationName: string | null;
  orderId: string;
  createdAt: string;
  response: { responseText: string; staffName: string; createdAt: string } | null;
}
