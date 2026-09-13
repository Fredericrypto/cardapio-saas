import { createHmac, timingSafeEqual } from 'crypto';

// Prova criptográfica de que uma verificação de identidade foi
// concedida PELO PRÓPRIO SISTEMA (via CustomerVerificationService.approve,
// nunca por outro caminho) — mesmo princípio do cupom fiscal
// (receipt-signature.ts): HMAC-SHA256 sobre os dados IMUTÁVEIS da
// decisão, usando uma chave que só o SERVIDOR conhece.
//
// Por que isso importa de verdade (não é só decoração): o campo
// `isVerified` sozinho é só um boolean no banco — tecnicamente qualquer
// um com acesso direto ao banco (um funcionário mal-intencionado, uma
// falha de segurança em outra camada, um erro de config) poderia virar
// esse campo pra `true` sem passar pela aprovação de verdade. Sem essa
// assinatura, o sistema não teria como DISTINGUIR um `isVerified=true`
// legítimo (que passou pela aprovação humana do admin) de um forjado.
// Com ela: toda vez que `isVerified` for exibido pra alguém (perfil do
// cliente, "Aí na Mesa", avaliações), o backend recalcula a assinatura
// esperada a partir dos campos de auditoria já gravados
// (customerId+tenantId+quando+qual admin decidiu) e compara com a que
// foi gravada no momento da aprovação — ver
// CustomerVerificationService.isGenuinelyVerified. Se não bater (ou não
// existir), o selo NUNCA aparece, mesmo que `isVerified` esteja `true`
// no banco — e fica marcado como violação pro admin investigar.
//
// A chave vem de VERIFICATION_SIGNING_SECRET (env var própria, nunca
// reaproveitada de outro propósito) — se não existir, cai num valor de
// desenvolvimento (só serve local). Em produção isso É OBRIGATÓRIO,
// senão a própria garantia de integridade vira só teatro.
const SIGNING_KEY_SOURCE =
  process.env.VERIFICATION_SIGNING_SECRET ??
  (() => {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'VERIFICATION_SIGNING_SECRET precisa estar configurada em produção — sem ela, o selo de Cliente Verificado não tem como provar que foi concedido de verdade pelo sistema (qualquer adulteração direta no banco passaria despercebida).',
      );
    }
    console.warn(
      '[verification-signature] VERIFICATION_SIGNING_SECRET não configurada — usando chave de desenvolvimento. NUNCA use isso em produção.',
    );
    return 'dev-only-insecure-verification-signing-key';
  })();

function canonicalPayload(
  customerId: string,
  tenantId: string,
  decidedAtIso: string,
  adminUserId: string,
): string {
  // Qualquer mudança em qualquer um desses campos — inclusive TROCAR
  // qual admin aparece como responsável, ou a data da decisão — gera
  // uma assinatura totalmente diferente. Não dá pra "reaproveitar" a
  // assinatura de uma aprovação legítima pra outro cliente, nem alterar
  // o registro de quem aprovou sem invalidar a prova.
  return `${customerId}|${tenantId}|${decidedAtIso}|${adminUserId}`;
}

const SIGNATURE_LENGTH = 32;

export function signVerification(
  customerId: string,
  tenantId: string,
  decidedAtIso: string,
  adminUserId: string,
): string {
  return createHmac('sha256', SIGNING_KEY_SOURCE)
    .update(canonicalPayload(customerId, tenantId, decidedAtIso, adminUserId))
    .digest('hex')
    .slice(0, SIGNATURE_LENGTH);
}

// Comparação em tempo constante — mesmo raciocínio do cupom: evita um
// ataque de timing pra descobrir a assinatura certa aos poucos.
export function verifyVerificationSignature(
  customerId: string,
  tenantId: string,
  decidedAtIso: string,
  adminUserId: string,
  candidateSignature: string | null,
): boolean {
  if (!candidateSignature) return false;
  const expected = signVerification(customerId, tenantId, decidedAtIso, adminUserId);
  const candidate = candidateSignature.trim().toLowerCase();
  if (candidate.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(candidate));
  } catch {
    return false;
  }
}
