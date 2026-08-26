import { createHmac, timingSafeEqual } from 'crypto';

// Assinatura de autenticidade pro cupom em PNG — HMAC-SHA256 sobre os
// dados IMUTÁVEIS do pedido (id, tenant, valor total, data de criação),
// usando uma chave que só o SERVIDOR conhece. Ninguém consegue forjar
// uma assinatura válida sem essa chave — é matematicamente inviável
// (SHA-256 é resistente a colisão/pré-imagem), então se o estabelecimento
// verificar um cupom e a assinatura bater, o cupom é genuíno E os dados
// nele (valor, data) não foram alterados desde a emissão.
//
// A chave vem de RECEIPT_SIGNING_SECRET (env var) — se não existir, cai
// num valor de desenvolvimento (só serve local). Em produção isso É
// OBRIGATÓRIO estar configurado, senão qualquer um com acesso ao código
// poderia forjar cupons "válidos".
const SIGNING_KEY_SOURCE =
  process.env.RECEIPT_SIGNING_SECRET ??
  (() => {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'RECEIPT_SIGNING_SECRET precisa estar configurada em produção — sem ela, a verificação de autenticidade dos cupons fica insegura (qualquer um poderia forjar um cupom "válido").',
      );
    }
    console.warn(
      '[receipt-signature] RECEIPT_SIGNING_SECRET não configurada — usando chave de desenvolvimento. NUNCA use isso em produção.',
    );
    return 'dev-only-insecure-receipt-signing-key';
  })();

function canonicalPayload(orderId: string, tenantId: string, totalCents: number, createdAtIso: string): string {
  // Formato fixo e sem ambiguidade — qualquer mudança de um desses
  // campos (mesmo 1 centavo no total) gera uma assinatura completamente
  // diferente, então uma imagem adulterada nunca bate com a assinatura
  // original.
  return `${orderId}|${tenantId}|${totalCents}|${createdAtIso}`;
}

// 16 hex chars = 64 bits de segurança — inviável de forçar por
// tentativa e erro (bilhões de tentativas por segundo levariam bilhões
// de anos), e ainda curto o suficiente pra digitar/ler numa tela.
const SIGNATURE_LENGTH = 16;

export function signReceipt(
  orderId: string,
  tenantId: string,
  totalCents: number,
  createdAtIso: string,
): string {
  return createHmac('sha256', SIGNING_KEY_SOURCE)
    .update(canonicalPayload(orderId, tenantId, totalCents, createdAtIso))
    .digest('hex')
    .slice(0, SIGNATURE_LENGTH)
    .toUpperCase();
}

// Comparação em tempo constante — evita um ataque de timing onde
// alguém descobre a assinatura certa aos poucos medindo quanto tempo
// cada tentativa errada leva pra ser rejeitada.
export function verifyReceiptSignature(
  orderId: string,
  tenantId: string,
  totalCents: number,
  createdAtIso: string,
  candidateSignature: string,
): boolean {
  const expected = signReceipt(orderId, tenantId, totalCents, createdAtIso);
  const candidate = candidateSignature.trim().toUpperCase();
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(candidate));
}

// Código completo mostrado no cupom / codificado no QR — combina o id
// do pedido com a assinatura, pra dar pro admin verificar sem precisar
// procurar o pedido primeiro.
export function formatVerificationCode(orderId: string, signature: string): string {
  return `${orderId}.${signature}`;
}

export function parseVerificationCode(code: string): { orderId: string; signature: string } | null {
  const trimmed = code.trim();
  const separatorIndex = trimmed.lastIndexOf('.');
  if (separatorIndex <= 0 || separatorIndex === trimmed.length - 1) return null;
  return {
    orderId: trimmed.slice(0, separatorIndex),
    signature: trimmed.slice(separatorIndex + 1),
  };
}
