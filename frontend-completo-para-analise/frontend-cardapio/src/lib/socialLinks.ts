// Monta o link do wa.me a partir do número guardado em Configurações
// (formato livre, ex: "(48) 99999-9999" ou "48 999999999") — o wa.me
// exige o número completo com código do país. Como o público-alvo é
// Brasil, prefixa "55" quando o número já não vem com código de país
// (heurística: 10 ou 11 dígitos = DDD + número, sem código do país).
export function buildWhatsappLink(rawNumber: string): string {
  const digits = rawNumber.replace(/\D/g, '');
  const withCountryCode = digits.length <= 11 ? `55${digits}` : digits;
  return `https://wa.me/${withCountryCode}`;
}

// Aceita o handle salvo com ou sem "@"/URL completa já digitada por
// engano — sempre normaliza pro formato instagram.com/<usuario>.
export function buildInstagramLink(rawHandle: string): string {
  const handle = rawHandle
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/^@/, '')
    .replace(/\/+$/, '');
  return `https://instagram.com/${handle}`;
}

// Pedido do Felipe (18/09) — mesmo raciocínio do Instagram (aceita
// handle puro, @handle ou a URL inteira colada por engano, sempre
// normaliza pra URL final). YouTube e Facebook são URL completa salva
// direto (formato varia demais — canal, @handle, /c/, página — pra
// valer montar a partir só de um "usuário"), então só garantem o
// protocolo https:// se faltar.
export function buildYoutubeLink(rawUrl: string): string {
  const url = rawUrl.trim();
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export function buildFacebookLink(rawUrl: string): string {
  const url = rawUrl.trim();
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export function buildTiktokLink(rawHandle: string): string {
  const handle = rawHandle
    .trim()
    .replace(/^https?:\/\/(www\.)?tiktok\.com\//i, '')
    .replace(/^@/, '')
    .replace(/\/+$/, '');
  return `https://tiktok.com/@${handle}`;
}

export function buildTwitterLink(rawHandle: string): string {
  const handle = rawHandle
    .trim()
    .replace(/^https?:\/\/(www\.)?(twitter|x)\.com\//i, '')
    .replace(/^@/, '')
    .replace(/\/+$/, '');
  return `https://x.com/${handle}`;
}

export function buildTelegramLink(rawUsername: string): string {
  const username = rawUsername
    .trim()
    .replace(/^https?:\/\/(www\.)?t\.me\//i, '')
    .replace(/^@/, '')
    .replace(/\/+$/, '');
  return `https://t.me/${username}`;
}

export function buildMessengerLink(rawUsername: string): string {
  const username = rawUsername
    .trim()
    .replace(/^https?:\/\/(www\.)?m\.me\//i, '')
    .replace(/^@/, '')
    .replace(/\/+$/, '');
  return `https://m.me/${username}`;
}

// Pedido do Felipe (19/09) — Gmail: `mailto:` abre o app de e-mail
// PADRÃO do aparelho (o que estiver configurado como default), o que
// é mais universal do que tentar forçar a interface web do Gmail
// especificamente (só funciona bem já logado num navegador, quebra em
// apps nativos de e-mail). Telefone de contato: `tel:` abre o discador
// nativo, funciona em qualquer aparelho.
export function buildGmailLink(rawEmail: string): string {
  return `mailto:${rawEmail.trim()}`;
}

export function buildPhoneLink(rawPhone: string): string {
  // Só dígitos e o "+" do código de país, se tiver — `tel:` não lida
  // bem com parênteses/hífen/espaço em todos os aparelhos.
  const digits = rawPhone.trim().replace(/[^\d+]/g, '');
  return `tel:${digits}`;
}
