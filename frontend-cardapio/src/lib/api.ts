import axios from 'axios';

// Em produção, isso aponta pro backend no Render.
// Em dev, aponta pro localhost:3000 (o backend NestJS rodando local).
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// `timeout` de propósito: sem isso, uma requisição que trava no
// backend (conexão de banco morta, pool esgotado, etc.) nunca resolve
// NEM rejeita — fica pendurada pra sempre. Como várias telas fazem
// `fetchTenantBySlug(slug).then(setTenant)` sem `.catch`, um travamento
// silencioso vira uma tela de loading infinito, sem nenhum erro visível
// no console pra investigar. 20s é generoso o bastante pra não
// atrapalhar upload de imagem (via `multipart/form-data`, mesmo
// cliente), mas baixo o bastante pra nunca deixar a pessoa achando que
// travou de vez.
export const api = axios.create({
  baseURL: API_URL,
  timeout: 20000,
});

// Cold start do Render: enquanto o servidor acorda, GET que falha por timeout,
// rede/CORS do proxy (sem resposta) ou 502/503/504 é refeito sozinho, com espera
// progressiva, por até 90s. Depois disso cada tela refaz a busca sozinha (BrandLoader).
// Só GET/HEAD (idempotentes): POST/PUT/DELETE nunca são repetidos (evita pedido
// ou pagamento duplicado). Sem ping, sem keep-alive: só reage a uma requisição real.
const COLD_START_BUDGET_MS = 90_000;
const RETRY_DELAYS_MS = [1500, 3000, 5000, 8000];
const RETRYABLE_STATUS = new Set([502, 503, 504]);

function isColdStartError(error: { response?: { status: number } }): boolean {
  if (!error.response) return true;
  return RETRYABLE_STATUS.has(error.response.status);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

api.interceptors.response.use(undefined, async (error: unknown) => {
  if (!axios.isAxiosError(error) || axios.isCancel(error) || !error.config) throw error;
  const config = error.config;
  const method = (config.method ?? 'get').toLowerCase();
  if ((method !== 'get' && method !== 'head') || !isColdStartError(error)) throw error;

  const startedAt = Date.now();
  let lastError = error;
  for (let attempt = 0; Date.now() - startedAt < COLD_START_BUDGET_MS; attempt++) {
    await sleep(RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]);
    if (config.signal?.aborted) throw lastError;
    try {
      return await axios.request(config);
    } catch (e) {
      if (!axios.isAxiosError(e) || axios.isCancel(e) || !isColdStartError(e)) throw e;
      lastError = e;
    }
  }
  throw lastError;
});

// Falha passageira (servidor dormindo/instável): sem resposta (timeout, rede), 5xx, 408 ou 429.
// As telas tratam isso como "ainda carregando" e tentam de novo sozinhas; qualquer outra coisa
// (404, 400, 403...) é erro de verdade e segue o fluxo próprio de cada tela.
export function isTransientError(error: unknown): boolean {
  if (!axios.isAxiosError(error) || axios.isCancel(error)) return false;
  if (!error.response) return true;
  const status = error.response.status;
  return status === 408 || status === 429 || status >= 500;
}

