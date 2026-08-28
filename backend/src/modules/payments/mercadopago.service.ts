import { Injectable, Logger, BadGatewayException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

const MERCADOPAGO_API_BASE = 'https://api.mercadopago.com';

export interface CreatePixPaymentParams {
  accessToken: string;
  amount: number;
  description: string;
  payerEmail: string;
  externalReference: string; // orderId — usado pra casar o webhook com o pedido
  expiresAt: Date;
  // Ausente quando não há URL pública configurada (ex: dev local) — a
  // confirmação nesse caso acontece só via polling (ver OrdersService).
  notificationUrl?: string;
}

export interface MercadoPagoPixPayment {
  id: string; // id do pagamento no Mercado Pago
  status: string; // pending, approved, rejected, cancelled, etc.
  qrCode: string; // "Pix copia e cola"
}

// Cliente HTTP direto pra API do Mercado Pago — sem depender do SDK
// oficial (evita ficar refém de uma versão específica do pacote; a API
// REST em si é o contrato estável). Toda chamada usa o access token do
// TENANT (nunca um token nosso), então o dinheiro sempre cai direto na
// conta do restaurante que configurou a credencial.
@Injectable()
export class MercadoPagoService {
  private readonly logger = new Logger(MercadoPagoService.name);

  async createPixPayment(params: CreatePixPaymentParams): Promise<MercadoPagoPixPayment> {
    const response = await fetch(`${MERCADOPAGO_API_BASE}/v1/payments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
        // Evita cobrança duplicada se a requisição for reenviada (ex:
        // timeout seguido de retry) — o Mercado Pago usa essa chave pra
        // identificar "essa é a mesma tentativa de pagamento".
        'X-Idempotency-Key': params.externalReference,
      },
      body: JSON.stringify({
        transaction_amount: Number(params.amount.toFixed(2)),
        payment_method_id: 'pix',
        description: params.description,
        external_reference: params.externalReference,
        date_of_expiration: params.expiresAt.toISOString(),
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
  ): Promise<{ status: string; externalReference: string | null }> {
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

    return { status: data.status, externalReference: data.external_reference ?? null };
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
