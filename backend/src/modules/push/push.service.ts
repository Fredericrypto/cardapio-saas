import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as webpush from 'web-push';
import { PushSubscription } from './push-subscription.entity';
import { SubscribePushDto } from './dto/subscribe-push.dto';

export interface PushPayload {
  title: string;
  body: string;
  // Pra onde o navegador leva o cliente ao clicar na notificação — path
  // relativo (o service worker no frontend resolve contra a origem).
  url?: string;
  // Categoriza o tipo de notificação — o cliente pode desligar tipos
  // específicos (ver lib/notificationPrefs.ts no frontend, que o
  // Service Worker consulta antes de exibir). Tipos hoje: review_prompt,
  // order_delivered, payment_completed, cashback, promotion, loyalty,
  // complaint.
  tag?: string;
  // Agrupamento na TELA (o `tag` nativo do Notification API do
  // navegador) — SEPARADO de `tag` acima de propósito. Duas
  // notificações com o mesmo `groupTag` se SUBSTITUEM uma pela outra na
  // central de notificações do sistema em vez de empilhar; sem
  // `groupTag`, cada uma aparece separada.
  //
  // Uso principal: progressão de status de UM pedido específico
  // (preparando → pronto → entregue) usa `groupTag: 'order-status-' +
  // order.id` — assim a notificação "pronto" substitui a "preparando"
  // NAQUELE pedido, sem empilhar 3 notificações pro mesmo pedido. Se
  // esse campo reaproveitasse o `tag` de categoria (ex:
  // 'order_delivered'), o status de um pedido A substituiria o de um
  // pedido B só porque são da mesma CATEGORIA — bug real que isso evita
  // antes de existir.
  groupTag?: string;
  // Logo do restaurante — aparece na notificação (ícone), pra sempre
  // ficar claro de qual restaurante veio mesmo com várias notificações
  // de apps diferentes na central do sistema operacional.
  icon?: string;
}

// Motor de Web Push — RFC 8291/8292, funciona em qualquer navegador
// moderno (Chrome, Firefox, Edge, Safari 16.4+) sem precisar de app
// nativo nem loja de aplicativo, incluindo quando o cardápio está
// instalado como PWA. As chaves VAPID (par de chaves assimétrico que
// identifica ESTE backend como remetente legítimo pros serviços de push
// dos navegadores) vêm de variável de ambiente — nunca geradas em
// runtime (se mudassem a cada deploy, toda inscrição existente
// quebraria).
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly isConfigured: boolean;

  constructor(
    @InjectRepository(PushSubscription)
    private readonly subscriptionRepo: Repository<PushSubscription>,
  ) {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    this.isConfigured = Boolean(publicKey && privateKey);
    if (this.isConfigured) {
      webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:contato@cardapiosaas.com',
        publicKey!,
        privateKey!,
      );
    } else {
      // Não derruba o backend por causa disso — só loga um aviso e
      // todo envio vira no-op. Deixa o resto do sistema funcionando
      // normalmente em ambientes (dev, preview) sem as chaves setadas.
      this.logger.warn(
        'VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY não configuradas — push notifications desativadas.',
      );
    }
  }

  async subscribe(tenantId: string, customerId: string, dto: SubscribePushDto): Promise<void> {
    const existing = await this.subscriptionRepo.findOne({ where: { endpoint: dto.endpoint } });
    if (existing) {
      // Mesmo endpoint pode reaparecer (cliente deslogou e logou nessa
      // mesma aba/navegador) — atualiza o dono em vez de duplicar.
      existing.tenantId = tenantId;
      existing.customerId = customerId;
      existing.p256dh = dto.keys.p256dh;
      existing.auth = dto.keys.auth;
      existing.userAgent = dto.userAgent ?? null;
      await this.subscriptionRepo.save(existing);
      return;
    }
    await this.subscriptionRepo.save(
      this.subscriptionRepo.create({
        tenantId,
        customerId,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        userAgent: dto.userAgent ?? null,
      }),
    );
  }

  async unsubscribe(customerId: string, endpoint: string): Promise<void> {
    await this.subscriptionRepo.delete({ customerId, endpoint });
  }

  // Manda pra TODAS as inscrições ativas do TENANT — usado pra
  // promoção nova (broadcast, não é notificação de um cliente
  // específico). Mesma lógica de "melhor esforço" e autolimpeza de
  // `sendToCustomer` abaixo.
  async broadcastToTenant(tenantId: string, payload: PushPayload): Promise<void> {
    if (!this.isConfigured) return;

    const subscriptions = await this.subscriptionRepo.find({ where: { tenantId } });
    if (subscriptions.length === 0) return;

    await Promise.all(subscriptions.map((sub) => this.sendToSubscription(sub, payload)));
  }

  // Manda pra TODAS as inscrições ativas desse cliente (pode ter mais
  // de um dispositivo). Nunca lança erro pra quem chamou — notificação
  // é sempre "melhor esforço", nunca pode derrubar o fluxo principal
  // (confirmar pagamento, fechar mesa) por causa de uma falha de envio.
  // Inscrição que responde 404/410 (expirada/revogada pelo navegador)
  // é removida automaticamente — autolimpeza, sem precisar de job
  // separado.
  async sendToCustomer(tenantId: string, customerId: string, payload: PushPayload): Promise<void> {
    if (!this.isConfigured) return;

    const subscriptions = await this.subscriptionRepo.find({ where: { tenantId, customerId } });
    if (subscriptions.length === 0) return;

    await Promise.all(subscriptions.map((sub) => this.sendToSubscription(sub, payload)));
  }

  private async sendToSubscription(sub: PushSubscription, payload: PushPayload): Promise<void> {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload),
      );
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await this.subscriptionRepo.delete({ id: sub.id });
      } else {
        this.logger.warn(`Falha ao enviar push pra ${sub.id}: ${(err as Error).message}`);
      }
    }
  }
}
