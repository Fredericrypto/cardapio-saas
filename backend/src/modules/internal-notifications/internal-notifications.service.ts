import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource, Repository } from 'typeorm';
import * as webpush from 'web-push';
import { AdminUser } from '../auth/admin-user.entity';
import { Tenant } from '../tenants/tenant.entity';
import { InternalNotification } from './internal-notification.entity';
import type { InternalNotificationTarget, InternalNotificationType } from './internal-notification.entity';
import { UserPushSubscription } from './user-push-subscription.entity';
import type { RequestAdminUser } from '../../common/decorators/current-admin-user.decorator';
import { SubscribeInternalPushDto } from './dto/internal-notification.dto';

export const ROLE_LABELS: Record<string, string> = { owner: 'Admin', manager: 'Gerente', staff: 'Funcionário' };
const TARGETS: InternalNotificationTarget[] = ['owner', 'owner_manager', 'all'];

// Alvos que cada perfil enxerga. owner vê tudo; gerente vê "dono+gerentes" e
// "todos"; funcionário (ou qualquer perfil desconhecido) só vê "todos".
export function visibleTargetsFor(role: string): InternalNotificationTarget[] {
  if (role === 'owner') return ['owner', 'owner_manager', 'all'];
  if (role === 'manager') return ['owner_manager', 'all'];
  return ['all'];
}
export function roleCanSee(target: InternalNotificationTarget, role: string): boolean {
  return visibleTargetsFor(role).includes(target);
}

export interface Actor {
  userId: string;
  name: string;
  role: string;
  label: string; // "Admin", "Gerente", "Funcionário"
}

export interface NoteEvent {
  tenantId: string;
  type: InternalNotificationType;
  noteId: string;
  tag: string;
  actor: Actor;
}

export interface InternalNotificationView {
  id: string;
  type: InternalNotificationType;
  title: string;
  message: string;
  tag: string | null;
  authorName: string;
  authorRole: string;
  targetRole: InternalNotificationTarget;
  noteId: string | null;
  isRead: boolean;
  createdAt: Date;
}

const EDIT_COALESCE_MINUTES = 5;
const RETENTION_DAYS = 30; // lista e contador olham os últimos 30 dias
const PURGE_AFTER_DAYS = 90;

@Injectable()
export class InternalNotificationsService {
  private readonly logger = new Logger(InternalNotificationsService.name);
  private readonly vapid = {
    subject: process.env.VAPID_SUBJECT || 'mailto:contato@cardapiosaas.com',
    publicKey: process.env.VAPID_PUBLIC_KEY ?? '',
    privateKey: process.env.VAPID_PRIVATE_KEY ?? '',
  };

  constructor(
    @InjectRepository(InternalNotification) private readonly repo: Repository<InternalNotification>,
    @InjectRepository(UserPushSubscription) private readonly subRepo: Repository<UserPushSubscription>,
    @InjectRepository(AdminUser) private readonly userRepo: Repository<AdminUser>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @InjectDataSource() private readonly ds: DataSource,
  ) {
    if (!this.vapid.publicKey || !this.vapid.privateKey) {
      this.logger.warn('VAPID não configurada — push interno desativado (o sino e o histórico funcionam normalmente).');
    }
  }

  // ---------------------------------------------------------------- ator
  async resolveActor(user: RequestAdminUser): Promise<Actor> {
    const found = await this.userRepo.findOne({ where: { id: user.userId } });
    const name = found?.name?.trim() || (found?.email ?? user.email).split('@')[0];
    const role = found?.role ?? user.role;
    return { userId: user.userId, name, role, label: ROLE_LABELS[role] ?? ROLE_LABELS.staff };
  }

  // ---------------------------------------------------------------- gatilhos
  // Chamado pelo NotesService DEPOIS de gravar a anotação. Nunca lança: uma
  // falha de notificação não pode desfazer nem travar a anotação.
  async notifyNoteEvent(event: NoteEvent): Promise<void> {
    try {
      const tenant = await this.tenantRepo.findOne({ where: { id: event.tenantId } });
      const target = TARGETS.includes(tenant?.internalNotificationTarget as InternalNotificationTarget)
        ? (tenant!.internalNotificationTarget as InternalNotificationTarget)
        : 'all';
      const { actor } = event;
      const copy = {
        note_created: { title: 'Nova Anotação Criada', verb: 'adicionou um novo recado', pushTitle: 'Nova Anotação' },
        note_updated: { title: 'Anotação Editada', verb: 'editou um recado', pushTitle: 'Anotação Editada' },
        note_deleted: { title: 'Anotação Excluída', verb: 'excluiu um recado', pushTitle: 'Anotação Excluída' },
      }[event.type];

      // Edições seguidas da MESMA pessoa na MESMA anotação viram um alerta só.
      if (event.type === 'note_updated') {
        const recent = await this.repo
          .createQueryBuilder('n')
          .where('n.tenantId = :t AND n.noteId = :note AND n.type = :type AND n.authorUserId = :u', {
            t: event.tenantId,
            note: event.noteId,
            type: 'note_updated',
            u: actor.userId,
          })
          .andWhere(`n.createdAt > now() - (:mins || ' minutes')::interval`, { mins: String(EDIT_COALESCE_MINUTES) })
          .orderBy('n.createdAt', 'DESC')
          .getOne();
        if (recent) {
          await this.repo.update({ id: recent.id }, { tag: event.tag, createdAt: new Date() });
          return;
        }
      }

      const saved = await this.repo.save(
        this.repo.create({
          tenantId: event.tenantId,
          noteId: event.noteId,
          type: event.type,
          title: copy.title,
          message: `Por: ${actor.name} (${actor.label})`,
          tag: event.tag,
          authorUserId: actor.userId,
          authorName: actor.name,
          authorRole: actor.role,
          targetRole: target,
        }),
      );

      // Push em segundo plano — não segura a resposta da API.
      void this.sendPush(saved, {
        title: `${copy.pushTitle} (#${event.tag})`,
        body: `${actor.name} (${actor.label}) ${copy.verb}`,
        urgent: event.tag === 'Urgente',
        tenantId: event.tenantId,
      }).catch((err) => this.logger.warn(`Falha no push interno: ${(err as Error).message}`));
    } catch (err) {
      this.logger.error('Falha ao registrar notificação interna', err as Error);
    }
  }

  // ---------------------------------------------------------------- leitura
  private baseVisibility(tenantId: string, user: RequestAdminUser) {
    return { tenantId, userId: user.userId, targets: visibleTargetsFor(user.role) };
  }

  async list(
    tenantId: string,
    user: RequestAdminUser,
    opts: { limit?: number; unreadOnly?: boolean } = {},
  ): Promise<{ items: InternalNotificationView[]; unreadCount: number }> {
    const { userId, targets } = this.baseVisibility(tenantId, user);
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
    const rows: Array<Record<string, unknown>> = await this.ds.query(
      `SELECT n.*, (n.author_user_id IS NOT DISTINCT FROM $2 OR r.user_id IS NOT NULL) AS is_read
         FROM internal_notifications n
         LEFT JOIN internal_notification_reads r ON r.notification_id = n.id AND r.user_id = $2
        WHERE n.tenant_id = $1
          AND n.target_role = ANY($3::text[])
          AND n.created_at > now() - ($4 || ' days')::interval
          AND ($5::boolean = FALSE OR (n.author_user_id IS DISTINCT FROM $2 AND r.user_id IS NULL))
        ORDER BY n.created_at DESC
        LIMIT ${limit}`,
      [tenantId, userId, targets, String(RETENTION_DAYS), Boolean(opts.unreadOnly)],
    );
    const items: InternalNotificationView[] = rows.map((n) => ({
      id: n.id as string,
      type: n.type as InternalNotificationType,
      title: n.title as string,
      message: n.message as string,
      tag: (n.tag as string) ?? null,
      authorName: n.author_name as string,
      authorRole: n.author_role as string,
      targetRole: n.target_role as InternalNotificationTarget,
      noteId: (n.note_id as string) ?? null,
      isRead: Boolean(n.is_read),
      createdAt: n.created_at as Date,
    }));
    return { items, unreadCount: await this.unreadCount(tenantId, user) };
  }

  // Alertas gerados pela própria pessoa nunca contam como "não lido" para ela.
  async unreadCount(tenantId: string, user: RequestAdminUser): Promise<number> {
    const { userId, targets } = this.baseVisibility(tenantId, user);
    const [row] = await this.ds.query(
      `SELECT COUNT(*)::int AS c
         FROM internal_notifications n
        WHERE n.tenant_id = $1
          AND n.target_role = ANY($3::text[])
          AND n.author_user_id IS DISTINCT FROM $2
          AND n.created_at > now() - ($4 || ' days')::interval
          AND NOT EXISTS (SELECT 1 FROM internal_notification_reads r WHERE r.notification_id = n.id AND r.user_id = $2)`,
      [tenantId, userId, targets, String(RETENTION_DAYS)],
    );
    return row?.c ?? 0;
  }

  async markRead(tenantId: string, user: RequestAdminUser, id: string): Promise<void> {
    const notification = await this.repo.findOne({ where: { id, tenantId } });
    if (!notification || !roleCanSee(notification.targetRole, user.role)) {
      throw new NotFoundException('Notificação não encontrada.');
    }
    await this.ds.query(
      `INSERT INTO internal_notification_reads (notification_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [id, user.userId],
    );
  }

  async markAllRead(tenantId: string, user: RequestAdminUser): Promise<void> {
    const { userId, targets } = this.baseVisibility(tenantId, user);
    await this.ds.query(
      `INSERT INTO internal_notification_reads (notification_id, user_id)
       SELECT n.id, $2 FROM internal_notifications n
        WHERE n.tenant_id = $1 AND n.target_role = ANY($3::text[])
          AND n.created_at > now() - ($4 || ' days')::interval
       ON CONFLICT DO NOTHING`,
      [tenantId, userId, targets, String(RETENTION_DAYS)],
    );
  }

  // ---------------------------------------------------------------- preferências
  async getPreferences(tenantId: string): Promise<{ target: InternalNotificationTarget }> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    const target = tenant?.internalNotificationTarget as InternalNotificationTarget;
    return { target: TARGETS.includes(target) ? target : 'all' };
  }

  async setPreferences(
    tenantId: string,
    user: RequestAdminUser,
    target: InternalNotificationTarget,
  ): Promise<{ target: InternalNotificationTarget }> {
    if (user.role !== 'owner') {
      throw new ForbiddenException('Só o administrador do restaurante escolhe quem recebe os alertas.');
    }
    await this.tenantRepo.update({ id: tenantId }, { internalNotificationTarget: target });
    return { target };
  }

  // ---------------------------------------------------------------- push
  async subscribe(tenantId: string, user: RequestAdminUser, dto: SubscribeInternalPushDto): Promise<void> {
    const actor = await this.resolveActor(user);
    const existing = await this.subRepo.findOne({ where: { endpoint: dto.endpoint } });
    if (existing) {
      // Mesmo aparelho, outra conta (ou conta atualizada): o aparelho passa a ser desta.
      Object.assign(existing, {
        tenantId,
        userId: user.userId,
        role: actor.role,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        userAgent: dto.userAgent?.slice(0, 300) ?? null,
      });
      await this.subRepo.save(existing);
      return;
    }
    await this.subRepo.save(
      this.subRepo.create({
        tenantId,
        userId: user.userId,
        role: actor.role,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        userAgent: dto.userAgent?.slice(0, 300) ?? null,
      }),
    );
  }

  async unsubscribe(tenantId: string, user: RequestAdminUser, endpoint: string): Promise<void> {
    await this.subRepo.delete({ tenantId, userId: user.userId, endpoint });
  }

  async isSubscribed(tenantId: string, user: RequestAdminUser, endpoint: string): Promise<boolean> {
    return (await this.subRepo.count({ where: { tenantId, userId: user.userId, endpoint } })) > 0;
  }

  // Teste de configuração: manda um push só para os aparelhos de QUEM pediu.
  async sendTest(tenantId: string, user: RequestAdminUser): Promise<{ sent: number }> {
    if (!this.vapid.publicKey || !this.vapid.privateKey) return { sent: 0 };
    const subs = await this.subRepo.find({ where: { tenantId, userId: user.userId } });
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    const payload = JSON.stringify({
      title: 'Notificações ativadas',
      body: 'Este aparelho vai receber os avisos da equipe.',
      icon: tenant?.logoUrl ?? '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      url: '/notificacoes',
      tag: 'teste-notificacoes',
      urgent: false,
      kind: 'internal-test',
    });
    let sent = 0;
    for (const sub of subs) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, {
          vapidDetails: this.vapid,
          TTL: 300,
        });
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await this.subRepo.delete({ id: sub.id });
      }
    }
    return { sent };
  }

  private async sendPush(
    notification: InternalNotification,
    content: { title: string; body: string; urgent: boolean; tenantId: string },
  ): Promise<void> {
    if (!this.vapid.publicKey || !this.vapid.privateKey) return;
    const subs = await this.subRepo.find({ where: { tenantId: content.tenantId } });
    // Quem fez a ação não recebe o próprio alerta; o resto passa pela regra do alvo.
    const recipients = subs.filter(
      (s) => s.userId !== notification.authorUserId && roleCanSee(notification.targetRole, s.role),
    );
    if (recipients.length === 0) return;

    const tenant = await this.tenantRepo.findOne({ where: { id: content.tenantId } });
    const payload = JSON.stringify({
      title: content.title,
      body: content.body,
      icon: tenant?.logoUrl ?? '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      url: notification.noteId ? `/anotacoes?nota=${notification.noteId}` : '/anotacoes',
      tag: `anotacao-${notification.noteId ?? notification.id}`,
      urgent: content.urgent,
      kind: 'internal-note',
    });

    await Promise.all(
      recipients.map(async (sub) => {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, {
            vapidDetails: this.vapid,
            TTL: 60 * 60 * 24,
            urgency: content.urgent ? 'high' : 'normal',
          });
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) await this.subRepo.delete({ id: sub.id });
          else this.logger.warn(`Push interno falhou para ${sub.id}: ${(err as Error).message}`);
        }
      }),
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeOld(): Promise<void> {
    await this.ds.query(`DELETE FROM internal_notifications WHERE created_at < now() - ($1 || ' days')::interval`, [
      String(PURGE_AFTER_DAYS),
    ]);
  }
}
