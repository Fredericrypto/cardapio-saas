// Normaliza o texto lido de um QR code de cupom para o código de autenticidade
// que o backend espera (POST /orders/verify-receipt).
//
// O QR do cupom carrega o próprio código; leitores/aplicativos diferentes podem
// entregá-lo com espaços/quebras de linha nas pontas ou embrulhado numa URL
// (`...?code=XXXX` ou `.../XXXX`). Aqui só se extrai o código — a decisão de
// "é autêntico?" é SEMPRE do servidor (assinatura recalculada dos dados reais).
const MAX_CODE_LENGTH = 200;

export function extractCouponCode(raw: string): string | null {
  let text = raw.replace(/[\r\n\t]+/g, '').trim();
  if (!text) return null;

  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      const fromQuery = url.searchParams.get('code') ?? url.searchParams.get('codigo');
      const lastSegment = url.pathname.split('/').filter(Boolean).pop();
      text = (fromQuery ?? lastSegment ?? '').trim();
    } catch {
      return null;
    }
  }

  if (!text || text.length > MAX_CODE_LENGTH) return null;
  // Código = letras, números e separadores comuns. Qualquer outra coisa (HTML,
  // espaços no meio, etc.) não é um código de cupom.
  if (!/^[A-Za-z0-9._:-]+$/.test(text)) return null;
  return text;
}
