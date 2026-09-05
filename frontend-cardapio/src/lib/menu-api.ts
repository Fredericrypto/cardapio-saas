import { api } from './api';
import type {
  Tenant,
  Location,
  Category,
  Product,
  Promotion,
  CreateOrderPayload,
  CreatedOrder,
  TableSession,
  SessionSummary,
  DeliveryAddressInput,
  DeliveryQuote,
} from '../types';

// Cache em memória + dedupe de requisições em voo, por slug. Existem
// hoje ~16 componentes/páginas diferentes que chamam
// `fetchTenantBySlug` de forma totalmente independente, cada um com seu
// próprio `useState`/`useEffect` — sem isso, cada um dispara sua PRÓPRIA
// requisição toda vez que monta, mesmo que outro componente já tenha
// acabado de buscar o mesmo tenant um instante antes (ex: navegar de
// `/conta-cliente/entrar` pro cardápio dispara pelo menos 2-3 buscas do
// MESMO tenant quase ao mesmo tempo, uma por componente). Isso não é só
// desperdício — foi a causa raiz de estourar o rate limit do backend
// (429) em uso normal, o que por sua vez disparava um bug em cascata no
// `useCustomerAuth` (ver comentário lá). Cache de 30s é curto o
// suficiente pra nunca mostrar dado desatualizado de verdade (cor,
// nome, config do restaurante mudam raríssimo), e dedupe de promise em
// voo garante que 5 componentes montando no mesmo instante gerem
// UMA requisição de rede, não 5.
const tenantCache = new Map<string, { data: Tenant; expiresAt: number }>();
const tenantInFlight = new Map<string, Promise<Tenant>>();
const TENANT_CACHE_TTL_MS = 30000;

export async function fetchTenantBySlug(slug: string): Promise<Tenant> {
  const cached = tenantCache.get(slug);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const inFlight = tenantInFlight.get(slug);
  if (inFlight) return inFlight;

  const promise = api
    .get<Tenant>(`/tenants/public/${slug}`)
    .then(({ data }) => {
      tenantCache.set(slug, { data, expiresAt: Date.now() + TENANT_CACHE_TTL_MS });
      return data;
    })
    .finally(() => {
      tenantInFlight.delete(slug);
    });

  tenantInFlight.set(slug, promise);
  return promise;
}

// Lojas físicas (filiais) da marca — usado na tela de escolha de loja
// antes do cardápio (balcão/entrega). Mesa não precisa disso: a mesa já
// pertence a uma loja específica, resolvida sozinha pelo QR code.
export async function fetchLocations(tenantId: string): Promise<Location[]> {
  const { data } = await api.get<Location[]>(`/locations/public/${tenantId}`);
  return data;
}

export async function fetchLocationById(tenantId: string, locationId: string): Promise<Location> {
  const { data } = await api.get<Location>(`/locations/public/${tenantId}/${locationId}`);
  return data;
}

export async function fetchCategories(tenantId: string): Promise<Category[]> {
  const { data } = await api.get<Category[]>(`/categories/public/${tenantId}`);
  return data;
}

export async function fetchProducts(tenantId: string): Promise<Product[]> {
  const { data } = await api.get<Product[]>(`/products/public/${tenantId}`);
  return data;
}

// Cards de promoção do topo do cardápio — só as ativas, dentro da
// janela de validade e que ainda não bateram o teto global de usos (o
// backend já filtra isso). Passando o token do cliente logado, cada
// promoção com limite por cliente já volta com `alreadyUsedUp` certo.
// O desconto de verdade só é calculado e conferido na hora do pedido.
export async function fetchActivePromotions(
  tenantId: string,
  customerToken?: string | null,
  locationId?: string | null,
): Promise<Promotion[]> {
  const { data } = await api.get<Promotion[]>(`/promotions/public/${tenantId}`, {
    headers: customerToken ? { Authorization: `Bearer ${customerToken}` } : undefined,
    params: locationId ? { locationId } : undefined,
  });
  return data;
}

export async function createOrder(
  tenantId: string,
  payload: CreateOrderPayload,
  customerToken?: string | null,
): Promise<CreatedOrder> {
  const { data } = await api.post<CreatedOrder>(
    `/orders/public/${tenantId}`,
    payload,
    customerToken ? { headers: { Authorization: `Bearer ${customerToken}` } } : undefined,
  );
  return data;
}

// O carrinho fica chamando isso a cada poucos segundos enquanto mostra o
// QR do Pix, esperando o admin confirmar o recebimento (ou o prazo
// expirar sozinho no backend).
export async function checkPixStatus(
  tenantId: string,
  orderId: string,
): Promise<{ status: CreatedOrder['status']; paymentStatus: string; pixExpiresAt: string | null }> {
  const { data } = await api.get(`/orders/public/${tenantId}/${orderId}/pix-status`);
  return data;
}

// Prévia da taxa de entrega ANTES de confirmar o pedido — a criação do
// pedido em si recalcula tudo de novo de forma independente no backend,
// então essa cotação é só pra mostrar pro cliente, nunca é definitiva.
export async function quoteDeliveryFee(
  locationId: string,
  address: DeliveryAddressInput,
): Promise<DeliveryQuote> {
  const { data } = await api.post<DeliveryQuote>(`/delivery/quote/public/${locationId}`, address);
  return data;
}

// ---------- Fluxo de mesa (QR code) ----------

// Abre (ou entra em) a sessão da mesa. Idempotente: se já existe uma
// sessão aberta pra essa mesa, o backend devolve a mesma sessão.
// customerToken é opcional (convidado sem conta continua funcionando
// normalmente) — quando presente, o backend usa a identidade do cliente
// só pra checagem extra de "pular de mesa" (ver TablesService.openOrJoinSession).
export async function scanTableQrCode(
  qrCodeToken: string,
  customerToken?: string | null,
): Promise<TableSession> {
  const { data } = await api.post<TableSession>(
    `/table-sessions/public/scan/${qrCodeToken}`,
    undefined,
    customerToken ? { headers: { Authorization: `Bearer ${customerToken}` } } : undefined,
  );
  return data;
}

// SÓ LEITURA — nunca cria sessão nova. Usado ao carregar/recarregar uma
// página de mesa pra saber se já existe sessão ativa, sem correr o risco
// de reabrir a mesa sozinha só por causa de um reload.
export async function getCurrentTableSession(qrCodeToken: string): Promise<TableSession | null> {
  const { data } = await api.get<TableSession | null>(
    `/table-sessions/public/current/${qrCodeToken}`,
  );
  return data;
}

export async function fetchSessionSummary(
  tenantId: string,
  sessionId: string,
): Promise<SessionSummary> {
  const { data } = await api.get<SessionSummary>(
    `/table-sessions/public/${tenantId}/${sessionId}/summary`,
  );
  return data;
}

export async function requestSessionClosing(
  tenantId: string,
  sessionId: string,
  tipAmount?: number,
) {
  const { data } = await api.post(
    `/table-sessions/public/${tenantId}/${sessionId}/request-closing`,
    { tipAmount },
  );
  return data;
}

export async function callWaiter(tenantId: string, sessionId: string) {
  const { data } = await api.post(
    `/table-sessions/public/${tenantId}/${sessionId}/call-waiter`,
  );
  return data;
}

// "Cancelar chamar garçom" — pro caso do cliente ter clicado sem
// querer. Só desfaz o chamado se o garçom ainda não tiver ido atender.
export async function cancelWaiterCall(tenantId: string, sessionId: string) {
  const { data } = await api.post(
    `/table-sessions/public/${tenantId}/${sessionId}/cancel-waiter-call`,
  );
  return data;
}

// Usado pra saber quando o garçom marcou o chamado como atendido, pra
// esconder o aviso de "garçom chamado" automaticamente.
export async function getWaiterCallStatus(
  tenantId: string,
  sessionId: string,
): Promise<{ status: 'pendente' | 'atendido' | 'cancelado' | null }> {
  const { data } = await api.get(
    `/table-sessions/public/${tenantId}/${sessionId}/waiter-call-status`,
  );
  return data;
}

// "Cancelar pedido" na tela de confirmação — só funciona enquanto o
// restaurante ainda não começou a preparar (ver regra no backend).
export async function cancelOrder(tenantId: string, orderId: string) {
  const { data } = await api.post(`/orders/public/${tenantId}/${orderId}/cancel`);
  return data;
}

// "Chamar atendente" pra pedido de balcão (mesa já tem seu próprio
// "chamar garçom" via tableSessionId).
export async function flagOrderForAttention(tenantId: string, orderId: string) {
  const { data } = await api.post(`/orders/public/${tenantId}/${orderId}/flag-attention`);
  return data;
}
