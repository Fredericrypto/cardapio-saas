import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource, EntityManager, Repository } from 'typeorm';
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
  // Identidade de quem disparou a ação (card da notificação).
  authorAvatarUrl: string | null;
  authorVerified: boolean;
  authorRoleLabel: string; // "CEO", "Gerente", nome do cargo ou "Sistema"
  isSystem: boolean;
  targetRole: InternalNotificationTarget;
  noteId: string | null;
  isRead: boolean;
  createdAt: Date;
}

const EDIT_COALESCE_MINUTES = 5;
// Ciclo de vida: o alerta vale 7 dias a partir da criação. A lista e o contador
// já ignoram o que passou disso (mesmo se a limpeza ainda não rodou) e a
// limpeza agendada apaga de verdade do banco.
export const RETENTION_DAYS = 7;
const PG_UNIQUE_VIOLATION = '23505';

// Rótulo do cargo de quem disparou a ação, como aparece no card.
//  - sem autor (evento do sistema)  => "Sistema"
//  - Administrador do restaurante    => "CEO"
//  - cargo personalizado/de sistema  => nome do cargo no restaurante
//  - usuário/cargo removido          => perfil legado (Gerente / Funcionário)
export function authorRoleLabel(input: {
  hasAuthor: boolean;
  legacyRole: string;
  roleName: string | null;
  roleSlug: string | null;
}): string {
  if (!input.hasAuthor) return 'Sistema';
  if (input.roleSlug === 'admin' || input.legacyRole === 'owner') return 'CEO';
  if (input.roleName?.trim()) return input.roleName.trim();
  return ROLE_LABELS[input.legacyRole] ?? ROLE_LABELS.staff;
}

// Selo de verificado do autor. Hoje só o Administrador do restaurante (CEO) tem
// identidade confirmada — a conta que criou o estabelecimento. Ponto único para
// mudar a regra se um dia existir verificação por usuário.
export function isAuthorVerified(input: { hasAuthor: boolean; legacyRole: string; roleSlug: string | null }): boolean {
  return input.hasAuthor && (input.roleSlug === 'admin' || input.legacyRole === 'owner');
}

// Só URL absoluta serve de avatar no painel (caminho relativo quebraria: o admin
// é outro domínio — ver comentário em TablesService).
function absoluteUrlOrNull(url: unknown): string | null {
  return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null;
}

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

      // Gravação IDEMPOTENTE (anti-duplicidade). Tudo numa transação:
      //  - "criada" e "excluída" têm no máximo UM alerta por anotação (índice
      //    único parcial no banco); se a requisição chegar duas vezes — duplo
      //    clique, retry, duas abas — a segunda bate na trava e não notifica;
      //  - "editada": edições seguidas da MESMA pessoa na MESMA anotação (<= 5
      //    min) viram um alerta só. A checagem + gravação roda sob um lock
      //    consultivo por (anotação, pessoa), então dois PATCH simultâneos não
      //    passam juntos pela checagem e não geram dois alertas.
      const saved = await this.ds.transaction((manager) => this.recordEvent(manager, event, copy.title, target));
      if (!saved) return; // repetido/agrupado: sem novo alerta e sem novo push

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

  // Devolve o alerta NOVO (para o push) ou null quando o evento foi repetido ou
  // agrupado a um alerta que já existia.
  private async recordEvent(
    manager: EntityManager,
    event: NoteEvent,
    title: string,
    target: InternalNotificationTarget,
  ): Promise<InternalNotification | null> {
    const { actor } = event;
    const repo = manager.getRepository(InternalNotification);

    if (event.type === 'note_updated') {
      await manager.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
        `internal-notification:${event.tenantId}:${event.noteId}:${actor.userId}:updated`,
      ]);
      const recent = await repo
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
        await repo.update({ id: recent.id }, { tag: event.tag, createdAt: new Date() });
        return null;
      }
    }

    // SAVEPOINT: a violação do índice único não pode abortar a transação inteira.
    await manager.query('SAVEPOINT internal_notification_insert');
    try {
      const saved = await repo.save(
        repo.create({
          tenantId: event.tenantId,
          noteId: event.noteId,
          type: event.type,
          title,
          message: `Por: ${actor.name} (${actor.label})`,
          tag: event.tag,
          authorUserId: actor.userId,
          authorName: actor.name,
          authorRole: actor.role,
          targetRole: target,
        }),
      );
      await manager.query('RELEASE SAVEPOINT internal_notification_insert');
      return saved;
    } catch (err) {
      await manager.query('ROLLBACK TO SAVEPOINT internal_notification_insert');
      const code = (err as { code?: string; driverError?: { code?: string } }).code
        ?? (err as { driverError?: { code?: string } }).driverError?.code;
      if (code === PG_UNIQUE_VIOLATION) return null; // alerta desse evento já existe
      throw err;
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
      `SELECT n.*,
              (n.author_user_id IS NOT DISTINCT FROM $2 OR r.user_id IS NOT NULL) AS is_read,
              u.avatar_url AS user_avatar_url,
              u.role       AS user_legacy_role,
              ro.name      AS role_name,
              ro.slug      AS role_slug,
              t.logo_url   AS tenant_logo_url
         FROM internal_notifications n
         LEFT JOIN internal_notification_reads r ON r.notification_id = n.id AND r.user_id = $2
         LEFT JOIN admin_users u  ON u.id = n.author_user_id AND u.tenant_id = n.tenant_id AND u.deleted_at IS NULL
         LEFT JOIN roles ro       ON ro.id = u.role_id AND ro.tenant_id = n.tenant_id
         LEFT JOIN tenants t      ON t.id = n.tenant_id
        WHERE n.tenant_id = $1
          AND n.target_role = ANY($3::text[])
          AND n.created_at > now() - ($4 || ' days')::interval
          AND r.deleted_at IS NULL
          AND ($5::boolean = FALSE OR (n.author_user_id IS DISTINCT FROM $2 AND r.user_id IS NULL))
        ORDER BY n.created_at DESC, n.id DESC
        LIMIT ${limit}`,
      [tenantId, userId, targets, String(RETENTION_DAYS), Boolean(opts.unreadOnly)],
    );
    const items: InternalNotificationView[] = rows.map((n) => {
      const hasAuthor = Boolean(n.author_user_id);
      const legacyRole = (n.user_legacy_role as string | null) ?? (n.author_role as string);
      const roleSlug = (n.role_slug as string | null) ?? null;
      const isCeo = roleSlug === 'admin' || legacyRole === 'owner';
      return {
        id: n.id as string,
        type: n.type as InternalNotificationType,
        title: n.title as string,
        message: n.message as string,
        tag: (n.tag as string) ?? null,
        authorName: hasAuthor ? (n.author_name as string) : 'Sistema',
        authorRole: n.author_role as string,
        // Foto do usuário; CEO e "Sistema" caem na logo do restaurante.
        authorAvatarUrl:
          absoluteUrlOrNull(n.user_avatar_url) ?? (!hasAuthor || isCeo ? absoluteUrlOrNull(n.tenant_logo_url) : null),
        authorVerified: isAuthorVerified({ hasAuthor, legacyRole, roleSlug }),
        authorRoleLabel: authorRoleLabel({
          hasAuthor,
          legacyRole,
          roleName: (n.role_name as string | null) ?? null,
          roleSlug,
        }),
        isSystem: !hasAuthor,
        targetRole: n.target_role as InternalNotificationTarget,
        noteId: (n.note_id as string) ?? null,
        isRead: Boolean(n.is_read),
        createdAt: n.created_at as Date,
      };
    });
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

  // Exclusão manual INDIVIDUAL: some só para quem excluiu (o alerta é da equipe
  // toda). Grava na linha de "lido" do usuário — excluir também conta como lido,
  // então o contador cai junto. Idempotente.
  async deleteForUser(tenantId: string, user: RequestAdminUser, id: string): Promise<void> {
    const notification = await this.repo.findOne({ where: { id, tenantId } });
    if (!notification || !roleCanSee(notification.targetRole, user.role)) {
      throw new NotFoundException('Notificação não encontrada.');
    }
    await this.ds.query(
      `INSERT INTO internal_notification_reads (notification_id, user_id, deleted_at) VALUES ($1, $2, now())
       ON CONFLICT (notification_id, user_id) DO UPDATE SET deleted_at = COALESCE(internal_notification_reads.deleted_at, now())`,
      [id, user.userId],
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
    // Um aparelho (endpoint) recebe UMA vez, mesmo que a inscrição apareça repetida.
    const seenEndpoints = new Set<string>();
    const recipients = subs.filter((s) => {
      if (s.userId === notification.authorUserId || !roleCanSee(notification.targetRole, s.role)) return false;
      if (seenEndpoints.has(s.endpoint)) return false;
      seenEndpoints.add(s.endpoint);
      return true;
    });
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

  // Limpeza automática: alerta com mais de 7 dias sai do banco (as marcações de
  // lido/excluído caem junto, por ON DELETE CASCADE). De hora em hora, para o
  // atraso máximo ser pequeno; a lista já esconde o vencido mesmo se o processo
  // dormiu (Render grátis) e a limpeza não rodou.
  @Cron(CronExpression.EVERY_HOUR)
  async purgeOld(): Promise<void> {
    try {
      await this.ds.query(`DELETE FROM internal_notifications WHERE created_at < now() - ($1 || ' days')::interval`, [
        String(RETENTION_DAYS),
      ]);
    } catch (err) {
      this.logger.warn(`Falha na limpeza de notificações internas: ${(err as Error).message}`);
    }
  }
}
