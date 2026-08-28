import { api } from './api';
import type {
  Tenant,
  Location,
  Category,
  Product,
  Order,
  RestaurantTable,
  WaiterCall,
  TableSession,
  SessionSummary,
  HistoryResponse,
  Promotion,
  PromotionRedemption,
  PromotionCustomerUsage,
  LoyaltyProgram,
  LoyaltyProgramPayload,
  LoyaltyReward,
  RedeemResult,
  CashbackSettings,
  CashbackSettingsPayload,
  AdminReview,
  ReviewSummary,
} from '../types';

// ---------- Tenant ----------
export async function fetchMyTenant(): Promise<Tenant> {
  const { data } = await api.get<Tenant>('/tenants/me');
  return data;
}

// mercadoPagoAccessToken/mercadoPagoWebhookSecret são write-only — nunca
// voltam numa leitura de Tenant (só o booleano mercadoPagoConfigured),
// por isso não fazem parte do tipo Tenant e precisam ser adicionados
// manualmente aqui no payload de escrita.
export async function updateMyTenant(
  payload: Partial<Tenant> & {
    mercadoPagoAccessToken?: string;
    mercadoPagoWebhookSecret?: string;
  },
): Promise<Tenant> {
  const { data } = await api.patch<Tenant>('/tenants/me', payload);
  return data;
}

export async function uploadTenantLogo(file: File): Promise<Tenant> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post<Tenant>('/tenants/me/logo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function uploadTenantCoverImage(file: File): Promise<Tenant> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post<Tenant>('/tenants/me/cover', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

// ---------- Locations (filiais) ----------
export async function fetchLocations(): Promise<Location[]> {
  const { data } = await api.get<Location[]>('/locations/me');
  return data;
}

export async function createLocation(payload: { name: string; whatsappNumber?: string }): Promise<Location> {
  const { data } = await api.post<Location>('/locations/me', payload);
  return data;
}

export async function updateLocation(id: string, payload: Partial<Location>): Promise<Location> {
  const { data } = await api.patch<Location>(`/locations/me/${id}`, payload);
  return data;
}

// Geocodifica o endereço via LocationIQ e grava endereço + coordenadas
// juntos — é o ÚNICO jeito de mudar `address`/`latitude`/`longitude`,
// pra nunca ficarem dessincronizados entre si.
export async function confirmLocationAddress(id: string, address: string): Promise<Location> {
  const { data } = await api.patch<Location>(`/locations/me/${id}/location`, { address });
  return data;
}

export async function deleteLocation(id: string): Promise<void> {
  await api.delete(`/locations/me/${id}`);
}

// ---------- Categories ----------
export async function fetchCategories(): Promise<Category[]> {
  const { data } = await api.get<Category[]>('/categories');
  return data;
}

export async function createCategory(payload: {
  name: string;
  displayOrder?: number;
}): Promise<Category> {
  const { data } = await api.post<Category>('/categories', payload);
  return data;
}

export async function updateCategory(
  id: string,
  payload: Partial<Category>,
): Promise<Category> {
  const { data } = await api.patch<Category>(`/categories/${id}`, payload);
  return data;
}

export async function deleteCategory(id: string): Promise<void> {
  await api.delete(`/categories/${id}`);
}

// ---------- Products ----------
export async function fetchProducts(): Promise<Product[]> {
  const { data } = await api.get<Product[]>('/products');
  return data;
}

export async function createProduct(payload: {
  categoryId: string;
  name: string;
  description?: string;
  price: number;
  promoPrice?: number;
}): Promise<Product> {
  const { data } = await api.post<Product>('/products', payload);
  return data;
}

export async function updateProduct(
  id: string,
  payload: Partial<Product>,
): Promise<Product> {
  const { data } = await api.patch<Product>(`/products/${id}`, payload);
  return data;
}

// Substitui todos os grupos de opções/adicionais desse produto de uma vez.
export async function setProductOptions(
  id: string,
  groups: {
    name: string;
    minSelect: number;
    maxSelect: number;
    values: { label: string; priceDelta: number; isAvailable: boolean }[];
  }[],
): Promise<Product> {
  const { data } = await api.patch<Product>(`/products/${id}/options`, { groups });
  return data;
}

export async function deleteProduct(id: string): Promise<void> {
  await api.delete(`/products/${id}`);
}

export async function uploadProductImage(id: string, file: File): Promise<Product> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post<Product>(`/products/${id}/image`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

// ---------- Orders ----------
export async function fetchOrders(): Promise<Order[]> {
  const { data } = await api.get<Order[]>('/orders');
  return data;
}

export async function updateOrderStatus(
  id: string,
  status: Order['status'],
): Promise<Order> {
  const { data } = await api.patch<Order>(`/orders/${id}/status`, { status });
  return data;
}

// Só pra pedidos avulsos (Balcão/Entrega) — registra a forma de
// pagamento (e o valor recebido em dinheiro, pro troco) junto de marcar
// como entregue. Ver ConcludeOrderModal.
export async function concludeOrderWithPayment(
  id: string,
  paymentMethod: string,
  amountReceived?: number,
): Promise<Order> {
  const { data } = await api.patch<Order>(`/orders/${id}/conclude`, {
    paymentMethod,
    amountReceived,
  });
  return data;
}

// Botão "Confirmar pagamento" pro Pix de balcão/entrega — só depois
// disso o pedido sai de 'aguardando_pagamento' e entra na cozinha.
export async function confirmPixPayment(id: string): Promise<Order> {
  const { data } = await api.patch<Order>(`/orders/${id}/confirm-pix-payment`);
  return data;
}

// ---------- Tables ----------
export async function fetchTables(): Promise<RestaurantTable[]> {
  const { data } = await api.get<RestaurantTable[]>('/tables');
  return data;
}

export async function createTable(number: string, locationId: string): Promise<RestaurantTable> {
  const { data } = await api.post<RestaurantTable>('/tables', { number, locationId });
  return data;
}

export async function deleteTable(id: string): Promise<void> {
  await api.delete(`/tables/${id}`);
}

// ---------- Waiter calls ----------
export async function fetchPendingWaiterCalls(): Promise<WaiterCall[]> {
  const { data } = await api.get<WaiterCall[]>('/waiter-calls');
  return data;
}

export async function attendWaiterCall(id: string): Promise<WaiterCall> {
  const { data } = await api.post<WaiterCall>(`/waiter-calls/${id}/attend`);
  return data;
}

export async function fetchActiveOverview(): Promise<
  Array<{
    table: RestaurantTable;
    session: TableSession;
    total: number;
    openedAt: string;
  }>
> {
  const { data } = await api.get('/table-sessions/active-overview');
  return data;
}

export async function fetchSessionsAwaitingClosing(): Promise<TableSession[]> {
  const { data } = await api.get<TableSession[]>('/table-sessions/awaiting-closing');
  return data;
}

export async function fetchSessionSummary(sessionId: string): Promise<SessionSummary> {
  const { data } = await api.get<SessionSummary>(`/table-sessions/${sessionId}/summary`);
  return data;
}

export async function forceResetSession(sessionId: string, reason: string) {
  const { data } = await api.post(`/table-sessions/${sessionId}/force-reset`, { reason });
  return data;
}

export async function closeTableSession(
  sessionId: string,
  payload: { paymentMethod: string; amountReceived?: number },
) {
  const { data } = await api.post(`/table-sessions/${sessionId}/close`, payload);
  return data;
}

// ---------- Histórico (expiração automática em 30 dias) ----------
export async function fetchHistory(): Promise<HistoryResponse> {
  const { data } = await api.get<HistoryResponse>('/history');
  return data;
}

// Busca no ARQUIVO — inclui cupons já escondidos da tela normal (mais de
// 30 dias). Exige nome do cliente OU intervalo de datas (o backend
// rejeita busca sem nenhum filtro).
export async function searchHistoryArchive(filters: {
  query?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<HistoryResponse> {
  const { data } = await api.get<HistoryResponse>('/history/search', { params: filters });
  return data;
}

// Não existe (de propósito) nenhuma função de exclusão manual de
// histórico aqui — só a marcação de "importante", pra evitar que um
// funcionário apague um cupom incômodo.
export async function setHistorySessionFlagged(sessionId: string, flagged: boolean): Promise<void> {
  await api.patch(`/history/session/${sessionId}/flag`, { flagged });
}

export async function setHistoryOrderFlagged(orderId: string, flagged: boolean): Promise<void> {
  await api.patch(`/history/order/${orderId}/flag`, { flagged });
}

// ---------- Promoções ----------
export async function fetchPromotions(): Promise<Promotion[]> {
  const { data } = await api.get<Promotion[]>('/promotions');
  return data;
}

export interface PromotionPayload {
  title: string;
  description?: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  maxDiscountAmount?: number;
  minOrderValue?: number;
  scope?: 'all' | 'category' | 'product';
  categoryIds?: string[];
  productIds?: string[];
  locationIds?: string[];
  allowReuseAcrossLocations?: boolean;
  usageLimitPerCustomer?: number;
  maxRedemptions?: number;
  maxEligibleQuantity?: number;
  isActive?: boolean;
  // null = "sem data" (create) ou "limpar data existente" (update).
  // undefined nunca é enviado de propósito pro PATCH — o backend trata
  // startsAt/endsAt ausentes do payload como "não mexer no campo", então
  // se o formulário sempre re-envia os dois campos, null é o valor certo
  // pra representar "vazio" sem correr o risco de deixar uma data antiga
  // presa depois que o usuário limpou o campo na edição.
  startsAt?: string | null;
  endsAt?: string | null;
}

export async function createPromotion(payload: PromotionPayload): Promise<Promotion> {
  const { data } = await api.post<Promotion>('/promotions', payload);
  return data;
}

export async function updatePromotion(
  id: string,
  payload: Partial<PromotionPayload>,
): Promise<Promotion> {
  const { data } = await api.patch<Promotion>(`/promotions/${id}`, payload);
  return data;
}

export async function uploadPromotionImage(id: string, file: File): Promise<Promotion> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post<Promotion>(`/promotions/${id}/image`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function fetchPromotionRedemptions(id: string): Promise<PromotionRedemption[]> {
  const { data } = await api.get<PromotionRedemption[]>(`/promotions/${id}/redemptions`);
  return data;
}

export async function fetchPromotionCustomerUsage(id: string): Promise<PromotionCustomerUsage[]> {
  const { data } = await api.get<PromotionCustomerUsage[]>(`/promotions/${id}/customer-usage`);
  return data;
}

// Devolve o uso da promoção pra esse cliente — não apaga nem altera
// nenhum pedido antigo, só faz a próxima checagem de limite ignorar o
// que já foi usado até agora (ver PromotionsService.resetCustomerUsage).
export async function resetPromotionCustomerUsage(
  promotionId: string,
  customerId: string,
): Promise<void> {
  await api.post(`/promotions/${promotionId}/customers/${customerId}/reset-usage`);
}

// "Resetar pra todos" — devolve o uso pra QUALQUER cliente de uma vez.
export async function resetPromotionAllUsage(promotionId: string): Promise<void> {
  await api.post(`/promotions/${promotionId}/reset-usage`);
}

export async function deletePromotion(id: string): Promise<void> {
  await api.delete(`/promotions/${id}`);
}

// Confere um código de autenticidade de cupom — pode ser de um pedido
// avulso (balcão/entrega) ou de uma sessão de mesa fechada. Ver
// OrdersController.verifyReceipt no backend.
export interface VerifyReceiptResult {
  valid: boolean;
  kind: 'avulso' | 'mesa' | null;
  order: Order | null;
  session: TableSession | null;
  sessionGrandTotal: number | null;
}

export async function verifyReceiptCode(code: string): Promise<VerifyReceiptResult> {
  const { data } = await api.post<VerifyReceiptResult>('/orders/verify-receipt', { code });
  return data;
}

// ---------- Fidelidade ----------

export async function fetchLoyaltyPrograms(): Promise<LoyaltyProgram[]> {
  const { data } = await api.get<LoyaltyProgram[]>('/loyalty/programs');
  return data;
}

export async function createLoyaltyProgram(payload: LoyaltyProgramPayload): Promise<LoyaltyProgram> {
  const { data } = await api.post<LoyaltyProgram>('/loyalty/programs', payload);
  return data;
}

export async function updateLoyaltyProgram(
  id: string,
  payload: LoyaltyProgramPayload,
): Promise<LoyaltyProgram> {
  const { data } = await api.patch<LoyaltyProgram>(`/loyalty/programs/${id}`, payload);
  return data;
}

export async function deleteLoyaltyProgram(id: string): Promise<void> {
  await api.delete(`/loyalty/programs/${id}`);
}

export async function fetchPendingLoyaltyRewards(programId?: string): Promise<LoyaltyReward[]> {
  const { data } = await api.get<LoyaltyReward[]>('/loyalty/rewards', {
    params: programId ? { programId } : undefined,
  });
  return data;
}

export async function fulfillLoyaltyReward(id: string): Promise<LoyaltyReward> {
  const { data } = await api.post<LoyaltyReward>(`/loyalty/rewards/${id}/fulfill`);
  return data;
}

// Ponto único de resgate — usado pela tela "Verificar cupom" pra
// reembolso, reclamação, retirada, carimbo de fidelidade, etc. Ver
// LoyaltyService.redeemForPurpose no backend.
export async function redeemReceipt(payload: {
  code: string;
  purpose: string;
  notes?: string;
  loyaltyProgramId?: string;
}): Promise<RedeemResult> {
  const { data } = await api.post<RedeemResult>('/loyalty/redeem', payload);
  return data;
}

// ---------- Cashback ----------

export async function fetchCashbackSettings(): Promise<CashbackSettings[]> {
  const { data } = await api.get<CashbackSettings[]>('/cashback/settings');
  return data;
}

export async function createCashbackSettings(
  payload: CashbackSettingsPayload,
): Promise<CashbackSettings> {
  const { data } = await api.post<CashbackSettings>('/cashback/settings', payload);
  return data;
}

export async function updateCashbackSettings(
  id: string,
  payload: CashbackSettingsPayload,
): Promise<CashbackSettings> {
  const { data } = await api.patch<CashbackSettings>(`/cashback/settings/${id}`, payload);
  return data;
}

export async function deleteCashbackSettings(id: string): Promise<void> {
  await api.delete(`/cashback/settings/${id}`);
}

export interface CashbackCreditHistoryEntry {
  id: string;
  customerId: string;
  customerName: string | null;
  locationName: string | null;
  sourceType: 'order' | 'loyalty_reward' | 'admin_adjustment';
  sourceId: string | null;
  originalAmount: number;
  remainingAmount: number;
  expiresAt: string | null;
  createdAt: string;
}

export interface CashbackConsumptionHistoryEntry {
  id: string;
  customerId: string;
  customerName: string | null;
  orderId: string;
  locationName: string | null;
  amount: number;
  reversed: boolean;
  createdAt: string;
}

export interface CashbackTotals {
  totalCredited: number;
  totalConsumed: number;
}

export async function fetchCashbackCreditHistory(): Promise<CashbackCreditHistoryEntry[]> {
  const { data } = await api.get<CashbackCreditHistoryEntry[]>('/cashback/history/credits');
  return data;
}

export async function fetchCashbackConsumptionHistory(): Promise<CashbackConsumptionHistoryEntry[]> {
  const { data } = await api.get<CashbackConsumptionHistoryEntry[]>('/cashback/history/consumptions');
  return data;
}

export async function fetchCashbackTotals(): Promise<CashbackTotals> {
  const { data } = await api.get<CashbackTotals>('/cashback/totals');
  return data;
}

export interface FidelityHistoryEntry {
  id: string;
  programId: string;
  programName: string;
  customerId: string;
  customerName: string | null;
  locationName: string | null;
  createdAt: string;
  rewardGranted: boolean;
  rewardStatus: 'pendente' | 'resgatado' | null;
  rewardFulfilledAt: string | null;
  rewardFulfilledByStaffName: string | null;
}

export async function fetchFidelityHistory(): Promise<FidelityHistoryEntry[]> {
  const { data } = await api.get<FidelityHistoryEntry[]>('/loyalty/history');
  return data;
}

// ---------- Reviews ----------

export async function fetchAdminReviews(filters?: { locationId?: string }): Promise<AdminReview[]> {
  const { data } = await api.get<AdminReview[]>('/reviews/admin', { params: filters });
  return data;
}

export async function fetchReviewsSummary(): Promise<ReviewSummary> {
  const { data } = await api.get<ReviewSummary>('/reviews/admin/summary');
  return data;
}

// Responder continua permitido — ocultar/apagar review de cliente NÃO
// existe mais nesse sistema, de propósito (decisão de produto: nota
// permanece sempre, boa ou ruim).
export async function respondToReview(id: string, responseText: string): Promise<void> {
  await api.post(`/reviews/admin/${id}/respond`, { responseText });
}
