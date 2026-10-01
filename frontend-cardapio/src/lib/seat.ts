// Assento (30/09, decisão final do Felipe): credencial secreta que o
// SERVIDOR entrega ao entrar numa mesa e só ele decide se ainda vale.
// Aqui só guardamos e reenviamos o token — quem manda é o backend:
// assento que saiu da mesa morre pra sempre, não importa o que o
// navegador faça. Guardado em localStorage (sobrevive a refresh, aba
// nova e "limpar cache"); token morto continua guardado de propósito,
// porque é ele que faz o servidor responder "esse assento saiu".
const BY_TABLE = 'mesa_assento_';
const BY_SESSION = 'mesa_assento_sessao_';
const LEFT_FLAG = 'mesa_saiu_';

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

export function saveSeat(qrCodeToken: string, sessionId: string, seatToken: string) {
  write(BY_TABLE + qrCodeToken, seatToken);
  write(BY_SESSION + sessionId, seatToken);
  remove(LEFT_FLAG + qrCodeToken); // entrou de novo (novo scan): tela de "saiu" não vale mais
}
export function getSeatByTable(qrCodeToken: string): string | null {
  return read(BY_TABLE + qrCodeToken);
}
export function getSeatBySession(sessionId: string): string | null {
  return read(BY_SESSION + sessionId);
}
// "Eu saí desta mesa" (só pra escolher o TEXTO da tela final; a
// decisão de bloquear é sempre do servidor).
export function markLeftLocally(qrCodeToken: string) {
  write(LEFT_FLAG + qrCodeToken, '1');
}
export function wasLeftLocally(qrCodeToken: string): boolean {
  return read(LEFT_FLAG + qrCodeToken) === '1';
}
export function seatHeaders(seatToken: string | null): Record<string, string> {
  return seatToken ? { 'X-Seat-Token': seatToken } : {};
}
