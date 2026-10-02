import { GUEST_IDENTITY, identityOf } from './identity';

// Assento (30/09, decisão final do Felipe): credencial secreta que o
// SERVIDOR entrega ao entrar numa mesa e só ele decide se ainda vale.
// Aqui só guardamos e reenviamos o token. Guardado em localStorage
// (sobrevive a refresh, aba nova e "limpar cache"), SEMPRE por
// identidade (01/10): o assento de uma conta nunca é lido por outra conta
// no mesmo aparelho. Token morto continua guardado de propósito, porque é
// ele que faz o servidor responder "esse assento saiu".
const BY_TABLE = 'mesa_assento_';
const BY_SESSION = 'mesa_assento_sessao_';
const LEFT_FLAG = 'mesa_saiu_';
const POINTER = 'mesa_ativa_';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // armazenamento bloqueado: sem token guardado, o servidor continua
    // sendo quem decide (e uma carga sem prova nunca entra numa mesa).
  }
}
function remove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignora
  }
}

const tableKey = (identity: string, qr: string) => `${BY_TABLE}${identity}_${qr}`;
const sessionKey = (identity: string, sessionId: string) => `${BY_SESSION}${identity}_${sessionId}`;
const leftKey = (identity: string, qr: string) => `${LEFT_FLAG}${identity}_${qr}`;
const pointerKey = (identity: string, slug: string) => `${POINTER}${identity}_${slug}`;

export function saveSeat(
  customerToken: string | null | undefined,
  qrCodeToken: string,
  sessionId: string,
  seatToken: string,
) {
  const id = identityOf(customerToken);
  write(tableKey(id, qrCodeToken), JSON.stringify({ s: sessionId, t: seatToken }));
  write(sessionKey(id, sessionId), seatToken);
  remove(leftKey(id, qrCodeToken)); // entrou de novo (novo scan): tela de "saiu" não vale mais
}
export function getSeatByTable(customerToken: string | null | undefined, qrCodeToken: string): string | null {
  const raw = read(tableKey(identityOf(customerToken), qrCodeToken));
  if (!raw) return null;
  try {
    return JSON.parse(raw)?.t ?? null;
  } catch {
    return null;
  }
}
export function getSeatBySession(customerToken: string | null | undefined, sessionId: string): string | null {
  return read(sessionKey(identityOf(customerToken), sessionId));
}
// "Eu saí desta mesa" (só pra escolher o TEXTO da tela final; a
// decisão de bloquear é sempre do servidor).
export function markLeftLocally(customerToken: string | null | undefined, qrCodeToken: string) {
  write(leftKey(identityOf(customerToken), qrCodeToken), '1');
}
export function wasLeftLocally(customerToken: string | null | undefined, qrCodeToken: string): boolean {
  return read(leftKey(identityOf(customerToken), qrCodeToken)) === '1';
}
export function seatHeaders(seatToken: string | null): Record<string, string> {
  return seatToken ? { 'X-Seat-Token': seatToken } : {};
}

// ---- ponteiro "qual mesa estou usando" (por identidade e loja) ----
export function getActiveMesaToken(customerToken: string | null | undefined, slug: string): string | null {
  return read(pointerKey(identityOf(customerToken), slug));
}
export function setActiveMesaToken(customerToken: string | null | undefined, slug: string, qrCodeToken: string) {
  write(pointerKey(identityOf(customerToken), slug), qrCodeToken);
}
export function clearActiveMesaToken(customerToken: string | null | undefined, slug: string) {
  remove(pointerKey(identityOf(customerToken), slug));
}

// Visitante que faz LOGIN no meio da visita leva a seção dele pra conta
// (mesmo princípio de carrinho de convidado que vira da conta). Só migra
// o que era do VISITANTE ('guest') pra identidade que acabou de entrar,
// e só se a conta ainda não tem seção própria nessa mesa. O que pertence
// a OUTRA conta nunca é tocado — trocar de conta não herda nada.
export function adoptGuestSession(
  customerToken: string | null | undefined,
  slug: string | undefined,
  qrCodeToken: string,
) {
  const id = identityOf(customerToken);
  if (id === GUEST_IDENTITY) return;
  if (read(tableKey(id, qrCodeToken))) return;
  const raw = read(tableKey(GUEST_IDENTITY, qrCodeToken));
  if (!raw) return;
  try {
    const { s, t } = JSON.parse(raw) as { s: string; t: string };
    write(tableKey(id, qrCodeToken), raw);
    write(sessionKey(id, s), t);
    remove(tableKey(GUEST_IDENTITY, qrCodeToken));
    remove(sessionKey(GUEST_IDENTITY, s));
    if (slug && read(pointerKey(GUEST_IDENTITY, slug)) === qrCodeToken) {
      write(pointerKey(id, slug), qrCodeToken);
      remove(pointerKey(GUEST_IDENTITY, slug));
    }
  } catch {
    // dado corrompido: ignora (o servidor decide)
  }
}

// ---- intenção de escaneamento (QR do próprio app) ----
// O leitor de QR do app navega por dentro da página (sem abrir um
// documento novo), então o navegador não consegue dizer que foi um scan.
// O leitor registra aqui, EM MEMÓRIA (some num refresh), que acabou de
// ler este QR; o gate consome uma única vez e só se for recente.
let scanIntent: { qrCodeToken: string; at: number } | null = null;
export function markQrScanIntent(qrCodeToken: string) {
  scanIntent = { qrCodeToken, at: Date.now() };
}
export function consumeQrScanIntent(qrCodeToken: string): boolean {
  const intent = scanIntent;
  scanIntent = null;
  return Boolean(intent && intent.qrCodeToken === qrCodeToken && Date.now() - intent.at < 15_000);
}
