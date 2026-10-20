// Persistência do token de sessão do cliente (uma por restaurante) com a semântica "Lembrar de mim".
//
// Modelo
//   remember = true   -> localStorage    (sobrevive ao fechamento do navegador)
//   remember = false  -> sessionStorage  (some ao fechar a aba/janela; sobrevive a reload na MESMA aba)
//
// Invariantes (este módulo é o ÚNICO que toca a chave; ninguém mais lê/escreve o token no storage):
//   I1  Depois de persistToken() o token está em NO MÁXIMO um dos dois storages
//       (em nenhum quando o resultado é 'memory'). Nunca duplicado.
//   I2  remember = false NUNCA grava em localStorage, nem como fallback: sem rebaixamento de segurança.
//       Se remember = true e o localStorage falhar, degrada para MENOS persistência (sessionStorage).
//   I3  readStoredToken() é total: nunca lança. Storage bloqueado/indisponível/corrompido == "sem sessão".
//   I4  Leitura: sessionStorage tem precedência sobre localStorage (a sessão desta aba vence a lembrada).
//   I5  clearStoredTokenIfMatches() só remove valor IGUAL ao token invalidado: nunca apaga um token mais
//       novo escrito por outra aba entre o fetch e a resposta 401.
//   I6  Um novo login SEMPRE substitui qualquer token anterior do restaurante neste navegador
//       (um restaurante = uma identidade por navegador; protege o dono do carrinho).
//
// Sem relógio do cliente: validade/expiração é decisão EXCLUSIVA do servidor (401 -> limpa). Isso evita que
// um relógio errado do aparelho deslogue (ou mantenha logado) alguém indevidamente.
//
// Compatibilidade: mesma chave de antes. Quem já estava logado tinha o token em localStorage, então continua
// "lembrado" sem precisar logar de novo.
//
// Limites honestos (não dá pra resolver só no front):
//   - O TEMPO DE VIDA do token é do backend (expiresIn do JWT). "Lembrar" decide ONDE ele fica guardado.
//   - Alguns navegadores restauram o sessionStorage ao reabrir abas fechadas ("continuar de onde parou").
//   - Entre abas, a janela entre duas operações de storage é de microssegundos; a falha possível é
//     fail-closed (o cliente precisa logar de novo), nunca fail-open.

export interface SessionOptions {
  /** true (padrão) = guarda em localStorage; false = só nesta aba (sessionStorage). */
  remember?: boolean;
}

export type PersistTarget = 'local' | 'session' | 'memory';

type StoreKind = 'local' | 'session';

const KEY_PREFIX = 'cardapio_customer_token_';

export function customerTokenKey(tenantId: string): string {
  return `${KEY_PREFIX}${tenantId}`;
}

function getStore(kind: StoreKind): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    // SecurityError (cookies/dados de site bloqueados) ao apenas ACESSAR window.localStorage.
    return null;
  }
}

function readFrom(kind: StoreKind, key: string): string | null {
  const store = getStore(kind);
  if (!store) return null;
  try {
    const value = store.getItem(key);
    return value ? value : null;
  } catch {
    return null;
  }
}

// Escreve E confere por leitura: só devolve true se o valor realmente ficou lá.
function writeTo(kind: StoreKind, key: string, value: string): boolean {
  const store = getStore(kind);
  if (!store) return false;
  try {
    store.setItem(key, value);
    return store.getItem(key) === value;
  } catch {
    // QuotaExceededError / modo privado antigo.
    return false;
  }
}

function removeFrom(kind: StoreKind, key: string): void {
  const store = getStore(kind);
  if (!store) return;
  try {
    store.removeItem(key);
  } catch {
    // Melhor esforço: nada a fazer se o navegador recusar a remoção.
  }
}

const ALL_KINDS: readonly StoreKind[] = ['session', 'local'];

/** Token da sessão atual deste restaurante, ou null. Nunca lança (I3, I4). */
export function readStoredToken(tenantId: string): string | null {
  const key = customerTokenKey(tenantId);
  return readFrom('session', key) ?? readFrom('local', key);
}

/**
 * Guarda o token conforme `remember` e devolve ONDE ficou. Garante I1, I2 e I6.
 * 'memory' = nenhum storage aceitou: a sessão vale só até recarregar a página (o chamador mantém em estado).
 */
export function persistToken(tenantId: string, token: string, remember: boolean): PersistTarget {
  const key = customerTokenKey(tenantId);

  if (!token) {
    clearStoredTokens(tenantId);
    return 'memory';
  }

  // remember: tenta local e, se falhar, degrada para session. !remember: SÓ session (I2).
  const attempts: readonly StoreKind[] = remember ? ['local', 'session'] : ['session'];
  let target: PersistTarget = 'memory';
  for (const kind of attempts) {
    if (writeTo(kind, key, token)) {
      target = kind;
      break;
    }
  }

  // I1/I6: tudo que não é o destino é limpo (inclui token ANTIGO de outro login).
  for (const kind of ALL_KINDS) {
    if (kind !== target) removeFrom(kind, key);
  }
  return target;
}

/** Logout explícito: remove o token dos dois storages. */
export function clearStoredTokens(tenantId: string): void {
  const key = customerTokenKey(tenantId);
  for (const kind of ALL_KINDS) removeFrom(kind, key);
}

/**
 * Token rejeitado pelo servidor (401): remove SÓ onde o valor guardado é exatamente esse token (I5).
 * Se outra aba já gravou um token mais novo, ele é preservado.
 */
export function clearStoredTokenIfMatches(tenantId: string, token: string): void {
  const key = customerTokenKey(tenantId);
  for (const kind of ALL_KINDS) {
    if (readFrom(kind, key) === token) removeFrom(kind, key);
  }
}
