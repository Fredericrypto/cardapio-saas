import { Injectable, Logger, BadGatewayException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { centsToMpAmount } from './mp-money';

const MERCADOPAGO_API_BASE = 'https://api.mercadopago.com';

export interface CreatePixPaymentParams {
  accessToken: string;
  // CENTAVOS inteiros. A conversão para o decimal que a API do MP exige é
  // feita aqui dentro, por `centsToMpAmount` (única função que faz isso).
  amountCents: number;
  description: string;
  payerEmail: string;
  externalReference: string; // id do pedido, OU "mesa:<sessionId>" pro fechamento de mesa (ver TablesService.requestClosing) — usado pra casar o webhook com o destino certo
  expiresAt: Date;
  // Chave de idempotência do Mercado Pago — por padrão usa o próprio
  // externalReference (comportamento de sempre, seguro pra PEDIDO: cada
  // um tem um id novo). BUG CORRIGIDO (28/09): fechamento de MESA
  // reusa o MESMO externalReference (`mesa:<sessionId>`) em cada
  // tentativa (o cliente pode gerar um Pix novo depois que o anterior
  // expira ou falha) — se a idempotency key repetisse junto, o Mercado
  // Pago devolvia o pagamento ANTIGO (já expirado/falho) em vez de
  // criar um novo, e o cliente via um QR novo na tela apontando pra uma
  // cobrança morta. TablesService sempre passa um valor único por
  // tentativa aqui (ex: com timestamp).
  idempotencyKey?: string;
  // Ausente quando não há URL pública configurada (ex: dev local) — a
  // confirmação nesse caso acontece só via polling (ver OrdersService).
  notificationUrl?: string;
}

export interface MercadoPagoPixPayment {
  id: string; // id do pagamento no Mercado Pago
  status: string; // pending, approved, rejected, cancelled, etc.
  qrCode: string; // "Pix copia e cola"
}

export interface CreateCardPaymentParams {
  accessToken: string;
  amountCents: number; // CENTAVOS inteiros, sempre recalculado pelo backend a partir do pedido
  cardToken: string; // gerado no navegador pelo SDK do MP — o número do cartão NUNCA chega aqui
  paymentMethodId: string; // visa, master, elo...
  issuerId: string | null;
  installments: number;
  description: string;
  payerEmail: string;
  payerIdentification: { type: string; number: string } | null;
  externalReference: string; // id do pedido
  idempotencyKey: string; // ver mp-idempotency.ts
  notificationUrl?: string;
  // Device id gerado pelo script de segurança do MP no navegador (antifraude).
  deviceId?: string;
}

export interface MercadoPagoCardPayment {
  id: string;
  status: string;
  statusDetail: string | null;
  // Desafio 3DS pendente (status "pending" / "pending_challenge"): o frontend
  // abre `externalResourceUrl` num iframe enviando `creq` por POST.
  threeDs: { externalResourceUrl: string; creq: string } | null;
}

// Erro de REQUISIÇÃO (4xx do MP): token de cartão inválido/expirado, dado
// faltando etc. Diferente de "pagamento recusado" (que é HTTP 201 com
// status "rejected"). Nunca carrega dados de cartão: só códigos do MP.
export class MercadoPagoRequestError extends Error {
  constructor(
    public readonly httpStatus: number,
    public readonly causeCodes: string[],
    message: string,
  ) {
    super(message);
    this.name = 'MercadoPagoRequestError';
  }
}

// Cliente HTTP direto pra API do Mercado Pago — sem depender do SDK
// oficial (evita ficar refém de uma versão específica do pacote; a API
// REST em si é o contrato estável). Toda chamada usa o access token do
// TENANT (nunca um token nosso), então o dinheiro sempre cai direto na
// conta do restaurante que configurou a credencial.
// O Mercado Pago só aceita `date_of_expiration` de Pix entre 30 minutos e
// 30 dias depois da criação — qualquer prazo menor é recusado (400) e
// vira "não foi possível gerar a cobrança" pro cliente. O prazo que o app
// mostra ao cliente (6 min em pedido, 15 min em mesa) é mais curto que
// isso, então o vencimento enviado ao gateway é sempre ao menos 31 min;
// quando o prazo do app estoura, quem chama cancela a cobrança no gateway
// (ver cancelPayment) pra ela não ficar paga "por fora" do app.
const MP_PIX_MIN_EXPIRATION_MS = 31 * 60 * 1000;
const BRAZIL_UTC_OFFSET_MS = 3 * 60 * 60 * 1000; // sem horário de verão desde 2019

// Formato da doc do MP: 2022-11-17T09:37:52.000-03:00
function toMercadoPagoDate(date: Date): string {
  return new Date(date.getTime() - BRAZIL_UTC_OFFSET_MS).toISOString().replace('Z', '-03:00');
}

@Injectable()
export class MercadoPagoService {
  private readonly logger = new Logger(MercadoPagoService.name);

  async createPixPayment(params: CreatePixPaymentParams): Promise<MercadoPagoPixPayment> {
    const gatewayExpiresAt = new Date(
      Math.max(params.expiresAt.getTime(), Date.now() + MP_PIX_MIN_EXPIRATION_MS),
    );
    const response = await fetch(`${MERCADOPAGO_API_BASE}/v1/payments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
        // Evita cobrança duplicada se a requisição for reenviada (ex:
        // timeout seguido de retry) — o Mercado Pago usa essa chave pra
        // identificar "essa é a mesma tentativa de pagamento".
        'X-Idempotency-Key': params.idempotencyKey ?? params.externalReference,
      },
      body: JSON.stringify({
        transaction_amount: centsToMpAmount(params.amountCents),
        payment_method_id: 'pix',
        description: params.description,
        external_reference: params.externalReference,
        date_of_expiration: toMercadoPagoDate(gatewayExpiresAt),
        ...(params.notificationUrl ? { notification_url: params.notificationUrl } : {}),
        payer: { email: params.payerEmail },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      this.logger.error(
        `Mercado Pago recusou a criação do pagamento Pix: ${JSON.stringify(data)}`,
      );
      throw new BadGatewayException(
        'Não foi possível gerar a cobrança Pix agora. Tente novamente em instantes.',
      );
    }

    const qrCode: string | undefined = data?.point_of_interaction?.transaction_data?.qr_code;
    if (!qrCode) {
      this.logger.error(
        `Mercado Pago aprovou a criação mas não devolveu QR code: ${JSON.stringify(data)}`,
      );
      throw new BadGatewayException('Pagamento criado, mas sem QR code. Tente novamente.');
    }

    return { id: String(data.id), status: data.status, qrCode };
  }

  // SEMPRE usado antes de considerar um pagamento confirmado — nunca
  // confiamos no corpo do webhook em si (poderia ser forjado); a única
  // fonte de verdade é perguntar pro Mercado Pago diretamente, com o
  // NOSSO access token, "qual o status real desse pagamento?".
  async getPaymentStatus(
    accessToken: string,
    paymentId: string,
  ): Promise<{ status: string; statusDetail: string | null; externalReference: string | null }> {
    const response = await fetch(`${MERCADOPAGO_API_BASE}/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await response.json();

    if (!response.ok) {
      this.logger.error(
        `Falha ao consultar status do pagamento ${paymentId}: ${JSON.stringify(data)}`,
      );
      throw new BadGatewayException('Não foi possível confirmar o status do pagamento agora.');
    }

    return {
      status: data.status,
      statusDetail: data.status_detail ?? null,
      externalReference: data.external_reference ?? null,
    };
  }

  // Cobrança por CARTÃO com card token (Checkout Transparente). Segurança:
  //  - o valor vem em centavos, calculado pelo backend a partir do pedido;
  //  - o token é de uso único e nunca é logado;
  //  - `three_d_secure_mode: optional` pede o desafio 3DS quando o emissor exige.
  async createCardPayment(params: CreateCardPaymentParams): Promise<MercadoPagoCardPayment> {
    const issuer = params.issuerId ? Number(params.issuerId) : NaN;
    const response = await fetch(`${MERCADOPAGO_API_BASE}/v1/payments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': params.idempotencyKey,
        ...(params.deviceId ? { 'X-meli-session-id': params.deviceId } : {}),
      },
      body: JSON.stringify({
        transaction_amount: centsToMpAmount(params.amountCents),
        token: params.cardToken,
        description: params.description,
        installments: params.installments,
        payment_method_id: params.paymentMethodId,
        ...(Number.isFinite(issuer) ? { issuer_id: issuer } : {}),
        external_reference: params.externalReference,
        three_d_secure_mode: 'optional',
        ...(params.notificationUrl ? { notification_url: params.notificationUrl } : {}),
        payer: {
          email: params.payerEmail,
          ...(params.payerIdentification ? { identification: params.payerIdentification } : {}),
        },
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      // Log SEM o corpo enviado (tem o token) — só a resposta do MP.
      this.logger.error(
        `Mercado Pago recusou a requisição de pagamento por cartão (HTTP ${response.status}): ${JSON.stringify(data)}`,
      );
      if (response.status >= 400 && response.status < 500) {
        const codes: string[] = Array.isArray(data?.cause)
          ? data.cause.map((c: { code?: string | number }) => String(c?.code ?? ''))
          : [];
        throw new MercadoPagoRequestError(response.status, codes, String(data?.message ?? 'bad_request'));
      }
      throw new BadGatewayException('Não foi possível processar o cartão agora. Tente novamente em instantes.');
    }

    const threeDsInfo = data?.three_ds_info;
    const threeDs =
      threeDsInfo?.external_resource_url && threeDsInfo?.creq
        ? { externalResourceUrl: String(threeDsInfo.external_resource_url), creq: String(threeDsInfo.creq) }
        : null;

    return {
      id: String(data.id),
      status: String(data.status),
      statusDetail: data.status_detail ?? null,
      threeDs,
    };
  }

  // Estorno TOTAL de um pagamento aprovado (Fase C). Idempotente via
  // X-Idempotency-Key (ver refundIdempotencyKey). Lança em qualquer falha —
  // quem chama decide (marca `estorno_pendente` e avisa o admin).
  async refundPayment(accessToken: string, paymentId: string, idempotencyKey: string): Promise<void> {
    const response = await fetch(`${MERCADOPAGO_API_BASE}/v1/payments/${paymentId}/refunds`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({}),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      this.logger.error(`Falha ao estornar pagamento ${paymentId} (HTTP ${response.status}): ${JSON.stringify(data)}`);
      throw new BadGatewayException('Não foi possível estornar o pagamento agora.');
    }
  }

  // Cancela uma cobrança Pix ainda pendente (28/09) — chamado quando o
  // cliente muda de ideia sobre a forma de pagamento (ou gera outra
  // cobrança) ANTES de pagar a antiga. Sem isso, a cobrança velha
  // continuava válida no Mercado Pago: se o cliente pagasse ela por
  // engano mesmo depois de mudar de forma de pagamento no app, o
  // dinheiro caía na conta do restaurante mas o sistema não sabia mais
  // o que fazer com aquele pagamento (a sessão já tinha esquecido esse
  // mpPaymentId). Best-effort de propósito: nunca lança erro — se o
  // Mercado Pago já processou o pagamento nesse meio-tempo (não dá mais
  // pra cancelar), o webhook/poll vai tratar como aprovado normalmente,
  // que é o comportamento correto.
  async cancelPayment(accessToken: string, paymentId: string): Promise<void> {
    try {
      await fetch(`${MERCADOPAGO_API_BASE}/v1/payments/${paymentId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'cancelled' }),
      });
    } catch (err) {
      this.logger.warn(`Falha ao cancelar pagamento ${paymentId} no Mercado Pago: ${err}`);
    }
  }

  // Verifica a assinatura HMAC do webhook (header x-signature), usando o
  // segredo de webhook configurado pra essa aplicação no painel do
  // Mercado Pago. Documentado publicamente pela própria Mercado Pago:
  // manifest = "id:{data.id};request-id:{x-request-id};ts:{ts};"
  // Se o segredo ainda não foi configurado (tenant só tem o access
  // token), pula a verificação — a segurança real nesse caso vem do
  // getPaymentStatus acima, que sempre re-confere com a própria API.
  verifyWebhookSignature(params: {
    webhookSecret: string | null;
    xSignatureHeader: string | undefined;
    xRequestIdHeader: string | undefined;
    dataId: string;
  }): boolean {
    // CRÍTICO: sem segredo configurado, o webhook é REJEITADO — nunca
    // aceito como "válido por padrão". Bug de segurança real que isso
    // corrige: antes, tenant sem `mercadoPagoWebhookSecretEncrypted`
    // configurado tinha a verificação de assinatura pulada por inteiro
    // (`return true` incondicional), aceitando QUALQUER POST nessa URL
    // como se fosse o Mercado Pago de verdade. A única coisa que ainda
    // protegia era reconfirmar o status direto na API deles depois — mas
    // segurança em camadas não pode depender só disso; a assinatura
    // existe justamente pra ser a primeira barreira, não uma opcional.
    if (!params.webhookSecret) return false;
    if (!params.xSignatureHeader || !params.xRequestIdHeader) return false;

    const parts = Object.fromEntries(
      params.xSignatureHeader.split(',').map((p) => {
        const [key, value] = p.split('=');
        return [key.trim(), value?.trim()];
      }),
    );
    const ts = parts.ts;
    const receivedHash = parts.v1;
    if (!ts || !receivedHash) return false;

    const manifest = `id:${params.dataId};request-id:${params.xRequestIdHeader};ts:${ts};`;
    const computedHash = createHmac('sha256', params.webhookSecret).update(manifest).digest('hex');

    try {
      return timingSafeEqual(Buffer.from(computedHash), Buffer.from(receivedHash));
    } catch {
      return false; // tamanhos diferentes = timingSafeEqual lança erro, tratamos como inválido
    }
  }
}
