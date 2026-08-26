import { api } from './api';

// Chamadas do sistema de login/perfil do CLIENTE FINAL — endpoints sob
// /customers/:tenantId/auth/*, completamente separados de qualquer coisa
// do admin (que nem existe nesse frontend). Cliente é POR RESTAURANTE
// (decisão de produto: cada restaurante é uma ilha isolada) — por isso
// todo endpoint aqui pede o tenantId explicitamente. O token de cliente
// nunca é setado como header padrão do `api` global — é sempre passado
// explicitamente por chamada.

export interface CustomerAddress {
  street: string;
  number: string | null;
  neighborhood: string | null;
  city: string;
  state: string;
  postcode: string | null;
  referencePoint: string | null;
  formatted: string;
  latitude: number;
  longitude: number;
  precise: boolean | null;
}

export interface CustomerProfile {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  gender: string | null;
  avatarUrl: string | null;
  pixKeyType: string | null;
  pixKey: string | null;
  address: CustomerAddress | null;
}

interface CustomerAuthResponse {
  accessToken: string;
  customer: CustomerProfile;
}

export async function registerCustomer(
  tenantId: string,
  payload: { email: string; password: string; name: string; phone?: string },
): Promise<CustomerAuthResponse> {
  const { data } = await api.post<CustomerAuthResponse>(
    `/customers/${tenantId}/auth/register`,
    payload,
  );
  return data;
}

export async function loginCustomer(
  tenantId: string,
  payload: { email: string; password: string },
): Promise<CustomerAuthResponse> {
  const { data } = await api.post<CustomerAuthResponse>(
    `/customers/${tenantId}/auth/login`,
    payload,
  );
  return data;
}

export async function fetchMyCustomerProfile(
  tenantId: string,
  token: string,
): Promise<CustomerProfile> {
  const { data } = await api.get<CustomerProfile>(`/customers/${tenantId}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}

export async function updateMyCustomerProfile(
  tenantId: string,
  token: string,
  payload: { name?: string; phone?: string; gender?: string },
): Promise<CustomerProfile> {
  const { data } = await api.patch<CustomerProfile>(
    `/customers/${tenantId}/auth/me`,
    payload,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return data;
}

export async function confirmMyCustomerAddress(
  tenantId: string,
  token: string,
  payload: {
    street: string;
    addressNumber?: string;
    neighborhood?: string;
    city: string;
    state: string;
    postcode?: string;
    referencePoint?: string;
  },
): Promise<CustomerProfile> {
  const { data } = await api.patch<CustomerProfile>(
    `/customers/${tenantId}/auth/me/address`,
    payload,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return data;
}

export async function removeMyCustomerAddress(
  tenantId: string,
  token: string,
): Promise<CustomerProfile> {
  const { data } = await api.delete<CustomerProfile>(
    `/customers/${tenantId}/auth/me/address`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return data;
}

// "Carteira Pix" — chave do próprio cliente, usada só pro estabelecimento
// devolver dinheiro (reembolso) quando precisar. Não guarda saldo nenhum.
export async function setMyCustomerPixKey(
  tenantId: string,
  token: string,
  payload: { pixKeyType: string; pixKey: string },
): Promise<CustomerProfile> {
  const { data } = await api.patch<CustomerProfile>(
    `/customers/${tenantId}/auth/me/pix-key`,
    payload,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return data;
}

export async function removeMyCustomerPixKey(
  tenantId: string,
  token: string,
): Promise<CustomerProfile> {
  const { data } = await api.delete<CustomerProfile>(
    `/customers/${tenantId}/auth/me/pix-key`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return data;
}

export async function uploadMyCustomerAvatar(
  tenantId: string,
  token: string,
  file: File,
): Promise<CustomerProfile> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post<CustomerProfile>(
    `/customers/${tenantId}/auth/me/avatar`,
    formData,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return data;
}

// `presetId` é validado contra uma whitelist fechada no backend — nunca
// manda uma URL de avatar direto daqui, só o id (ex: "female-3").
export async function setMyCustomerAvatarPreset(
  tenantId: string,
  token: string,
  presetId: string,
): Promise<CustomerProfile> {
  const { data } = await api.patch<CustomerProfile>(
    `/customers/${tenantId}/auth/me/avatar-preset`,
    { presetId },
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return data;
}

// Reflete o Order inteiro que o backend já devolve (não é um DTO
// enxuto) — por isso os campos de entrega/pagamento/mesa aqui embaixo,
// usados pra montar o cupom exatamente igual ao do painel do admin.
export interface CustomerOrderHistoryItem {
  id: string;
  orderType: 'balcao' | 'mesa' | 'entrega';
  status: string;
  total: number;
  discountAmount?: number;
  cashbackUsed?: number;
  cashbackEarned?: number;
  promotionTitleSnapshot?: string | null;
  // Fonte de verdade quando o pedido usou MAIS DE UM cupom ao mesmo
  // tempo — promotionTitleSnapshot (singular, acima) só guarda o
  // primeiro, mantido por compatibilidade com telas antigas.
  promotionTitlesSnapshot?: string[] | null;
  // Código de autenticidade pra imprimir/gravar no cupom em PNG — ver
  // OrdersService.attachReceiptCode no backend. Ausente em respostas que
  // não passam por esse helper (ex: lista de histórico) — só a tela do
  // cupom em si precisa.
  receiptVerificationCode?: string;
  tipAmount: number;
  createdAt: string;
  customerName: string | null;
  deliveryAddress: string | null;
  deliveryReferencePoint: string | null;
  deliveryDistanceKm: number | null;
  deliveryAddressPrecise: boolean | null;
  paymentMethod: string | null;
  amountReceived: number | null;
  // Só presente quando orderType === 'mesa' — é o que permite agrupar
  // pedidos numa mesma "visita" à mesa (ver ordersHistory.ts).
  tableSessionId: string | null;
  tableSession: {
    id: string;
    status: 'aberta' | 'fechamento_solicitado' | 'fechada';
    openedAt: string;
    closedAt: string | null;
    tipAmount: number;
    paymentMethod: string | null;
    table: { number: string } | null;
  } | null;
  items: {
    productName: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    selectedOptions: { groupName: string; label: string; priceDelta: number }[] | null;
  }[];
}

export async function fetchMyOrderHistory(
  tenantId: string,
  token: string,
): Promise<CustomerOrderHistoryItem[]> {
  const { data } = await api.get<CustomerOrderHistoryItem[]>(
    `/orders/public/${tenantId}/me/history`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return data;
}

// Pedido avulso individual — usado na tela de cupom quando ela é aberta
// direto (deep link/refresh), sem depender do estado da lista anterior.
export async function fetchMyOrderById(
  tenantId: string,
  orderId: string,
  token: string,
): Promise<CustomerOrderHistoryItem> {
  const { data } = await api.get<CustomerOrderHistoryItem>(
    `/orders/public/${tenantId}/me/history/${orderId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return data;
}

// ---------- Cashback ----------

export async function fetchMyCashbackBalance(tenantId: string, token: string): Promise<number> {
  const { data } = await api.get<{ balance: number }>(`/cashback/public/${tenantId}/balance`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data.balance;
}

export interface CashbackHistoryEntry {
  id: string;
  type: 'earned' | 'spent';
  amount: number;
  description: string;
  createdAt: string;
}

export async function fetchMyCashbackHistory(
  tenantId: string,
  token: string,
): Promise<CashbackHistoryEntry[]> {
  const { data } = await api.get<CashbackHistoryEntry[]>(`/cashback/public/${tenantId}/history`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}

export interface ActiveCashbackSettings {
  percentage: number;
  minOrderValue: number;
  maxCashbackPerOrder: number | null;
  promoText: string | null;
}

// Pública (não exige login) — só pra estimar "você vai ganhar ~R$X" no
// resumo do carrinho. O valor REAL creditado é sempre recalculado no
// backend na hora do pagamento (pode diferir um pouco daqui se o
// cliente já bateu o teto diário, por exemplo — por isso a estimativa
// no carrinho é sempre marcada como aproximada).
export async function fetchActiveCashbackSettings(
  tenantId: string,
  locationId?: string,
): Promise<ActiveCashbackSettings | null> {
  const { data } = await api.get<ActiveCashbackSettings | null>(
    `/cashback/public/${tenantId}/active`,
    { params: locationId ? { locationId } : undefined },
  );
  return data;
}

// ---------- Reviews ----------

export interface MyReview {
  id: string;
  orderId: string;
  rating: number;
  comment: string | null;
  isAnonymous: boolean;
  createdAt: string;
}

export interface EligibleOrderForReview {
  id: string;
  orderType: 'balcao' | 'mesa' | 'entrega';
  createdAt: string;
}

export interface PublicReview {
  id: string;
  rating: number;
  comment: string | null;
  customerDisplayName: string;
  isAnonymous: boolean;
  createdAt: string;
  response: { responseText: string; createdAt: string } | null;
}

export interface ReviewSummary {
  average: number;
  count: number;
  distribution: { 1: number; 2: number; 3: number; 4: number; 5: number };
}

// Pedidos concluídos do cliente que ainda não foram avaliados — usado
// pra decidir se mostra o prompt "Avalie seu pedido". Um pedido cuja
// review foi APAGADA nunca volta pra essa lista (ver
// ReviewsService.findEligibleOrders no backend) — só uma compra nova
// libera uma avaliação nova.
export async function fetchEligibleOrdersForReview(
  tenantId: string,
  token: string,
): Promise<EligibleOrderForReview[]> {
  const { data } = await api.get<EligibleOrderForReview[]>(
    `/reviews/public/${tenantId}/eligible-orders`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return data;
}

export async function fetchMyReviews(tenantId: string, token: string): Promise<MyReview[]> {
  const { data } = await api.get<MyReview[]>(`/reviews/public/${tenantId}/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}

// Mapa orderId -> review, pra pintar a nota (★ 1-5) ao lado de cada
// pedido no histórico (uma chamada só pra todos os pedidos da lista).
export async function fetchMyReviewsByOrderIds(
  tenantId: string,
  token: string,
  orderIds: string[],
): Promise<Record<string, MyReview>> {
  if (orderIds.length === 0) return {};
  const { data } = await api.get<Record<string, MyReview>>(`/reviews/public/${tenantId}/by-orders`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { orderIds: orderIds.join(',') },
  });
  return data;
}

// Não existe updateReview — depois de publicada, a avaliação é
// permanente. O único jeito de "desfazer" é apagar (e mesmo apagando, o
// pedido não pode ser avaliado de novo — só uma compra nova libera).
export async function createReview(
  tenantId: string,
  token: string,
  payload: { orderId: string; rating: number; comment?: string; isAnonymous?: boolean },
): Promise<MyReview> {
  const { data } = await api.post<MyReview>(`/reviews/public/${tenantId}`, payload, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}

export async function deleteReview(tenantId: string, token: string, reviewId: string): Promise<void> {
  await api.delete(`/reviews/public/${tenantId}/${reviewId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// Públicas, sem login — pro cardápio mostrar nota + reviews recentes.
// Sempre passa locationId quando disponível: cada unidade tem sua
// própria nota, independente das outras.
export async function fetchPublicReviews(
  tenantId: string,
  locationId?: string,
  page = 1,
): Promise<{ items: PublicReview[]; total: number }> {
  const { data } = await api.get<{ items: PublicReview[]; total: number }>(
    `/reviews/public/${tenantId}`,
    { params: { page, locationId } },
  );
  return data;
}

export async function fetchReviewsSummary(tenantId: string, locationId?: string): Promise<ReviewSummary> {
  const { data } = await api.get<ReviewSummary>(`/reviews/public/${tenantId}/summary`, {
    params: locationId ? { locationId } : undefined,
  });
  return data;
}

// Resumo de TODAS as lojas de uma vez — pra tela de "escolha a loja".
export async function fetchReviewsSummaryByLocation(
  tenantId: string,
): Promise<Record<string, ReviewSummary>> {
  const { data } = await api.get<Record<string, ReviewSummary>>(
    `/reviews/public/${tenantId}/summary-by-location`,
  );
  return data;
}

// ---------- Push notifications ----------

export async function fetchVapidPublicKey(): Promise<string | null> {
  const { data } = await api.get<{ publicKey: string | null }>('/push/vapid-public-key');
  return data.publicKey;
}

export async function subscribeToPush(
  tenantId: string,
  token: string,
  subscription: PushSubscriptionJSON,
): Promise<void> {
  await api.post(
    `/push/public/${tenantId}/subscribe`,
    {
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      userAgent: navigator.userAgent,
    },
    { headers: { Authorization: `Bearer ${token}` } },
  );
}

export async function unsubscribeFromPush(
  tenantId: string,
  token: string,
  endpoint: string,
): Promise<void> {
  await api.delete(`/push/public/${tenantId}/subscribe`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { endpoint },
  });
}
