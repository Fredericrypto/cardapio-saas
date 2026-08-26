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
