// O que uma falha ao CRIAR PEDIDO significa. Função pura (sem axios, sem React), coberta por teste.
//
// Regra central: SÓ um 401 manda a pessoa para o login. Timeout, queda de rede e 5xx nunca
// viram "faça login" (o servidor falhou, a conta está bem) e NUNCA disparam novo envio: o POST
// do pedido não é repetido por nenhuma camada (lib/api.ts só refaz GET/HEAD) e o botão só envia
// por ação explícita. O pedido PODE ter sido criado mesmo sem resposta (P-16: o envio ainda não
// tem Idempotency-Key), por isso `unconfirmed` orienta conferir os pedidos antes de tentar de novo
// — sem prometer proteção contra duplicação.
export type OrderFailure =
  | { kind: 'login_required' } // 401: sem conta, token inválido/vencido ou de outro restaurante
  | { kind: 'rate_limited' } // 429
  | { kind: 'unconfirmed' } // sem resposta (timeout/rede/CORS), 408 ou 5xx: não dá para saber se criou
  | { kind: 'rejected'; message: string | null } // demais 4xx: o servidor recusou de propósito
  | { kind: 'unknown' }; // não é erro de HTTP (bug local, cancelamento)

interface HttpErrorLike {
  isAxiosError: true;
  code?: unknown;
  response?: { status?: unknown; data?: unknown };
}

function isHttpErrorLike(err: unknown): err is HttpErrorLike {
  return typeof err === 'object' && err !== null && (err as { isAxiosError?: unknown }).isAxiosError === true;
}

function backendMessage(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const message = (data as { message?: unknown }).message;
  if (typeof message === 'string') return message.trim() === '' ? null : message;
  if (Array.isArray(message)) {
    const parts = message.filter((m): m is string => typeof m === 'string' && m.trim() !== '');
    return parts.length > 0 ? parts.join(' ') : null;
  }
  return null;
}

export function classifyOrderError(err: unknown): OrderFailure {
  if (!isHttpErrorLike(err)) return { kind: 'unknown' };
  if (err.code === 'ERR_CANCELED') return { kind: 'unknown' };
  const response = err.response;
  if (!response) return { kind: 'unconfirmed' };
  const status = response.status;
  if (typeof status !== 'number' || !Number.isInteger(status)) return { kind: 'unknown' };
  if (status === 401) return { kind: 'login_required' };
  if (status === 429) return { kind: 'rate_limited' };
  if (status === 408 || (status >= 500 && status <= 599)) return { kind: 'unconfirmed' };
  if (status >= 400 && status <= 499) return { kind: 'rejected', message: backendMessage(response.data) };
  return { kind: 'unknown' };
}
