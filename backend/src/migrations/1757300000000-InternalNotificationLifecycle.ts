import { MigrationInterface, QueryRunner } from 'typeorm';

// 08/10/2026 — Ciclo de vida e identidade das notificações INTERNAS da equipe.
//  - admin_users.avatar_url: foto do usuário (opcional) exibida no card do alerta;
//  - internal_notification_reads.deleted_at: exclusão MANUAL individual — some só
//    para quem excluiu (o alerta é compartilhado pela equipe, então "excluir"
//    é por usuário, no mesmo registro de "lido", sem tabela nova);
//  - índice único parcial (note_id, type) para criada/excluída: um evento desses
//    por anotação, no máximo — a trava no BANCO contra alerta duplicado, mesmo
//    com requisições concorrentes. Duplicatas antigas são removidas antes
//    (fica a mais antiga; as marcações de "lido" dela são preservadas).
//  - índice por (created_at) para a limpeza automática de 7 dias.
export class InternalNotificationLifecycle1757300000000 implements MigrationInterface {
  name = 'InternalNotificationLifecycle1757300000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "admin_users" ADD COLUMN IF NOT EXISTS "avatar_url" varchar(500) NULL`);
    await q.query(
      `ALTER TABLE "internal_notification_reads" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz NULL`,
    );

    // Remove duplicatas de "criada"/"excluída" (mesma anotação, mesmo tipo).
    await q.query(`
      WITH ranked AS (
        SELECT id,
               FIRST_VALUE(id) OVER (PARTITION BY note_id, type ORDER BY created_at ASC, id ASC) AS keep_id,
               ROW_NUMBER()    OVER (PARTITION BY note_id, type ORDER BY created_at ASC, id ASC) AS rn
          FROM internal_notifications
         WHERE note_id IS NOT NULL AND type IN ('note_created', 'note_deleted')
      ),
      dups AS (SELECT id, keep_id FROM ranked WHERE rn > 1)
      -- quem já tinha lido uma cópia continua com o alerta mantido como lido
      INSERT INTO internal_notification_reads (notification_id, user_id, read_at)
      SELECT d.keep_id, r.user_id, r.read_at
        FROM dups d
        JOIN internal_notification_reads r ON r.notification_id = d.id
      ON CONFLICT DO NOTHING
    `);
    await q.query(`
      DELETE FROM internal_notifications n
       USING (
         SELECT id,
                ROW_NUMBER() OVER (PARTITION BY note_id, type ORDER BY created_at ASC, id ASC) AS rn
           FROM internal_notifications
          WHERE note_id IS NOT NULL AND type IN ('note_created', 'note_deleted')
       ) x
       WHERE n.id = x.id AND x.rn > 1
    `);

    await q.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_internal_notifications_note_event"
        ON "internal_notifications" ("note_id", "type")
        WHERE "note_id" IS NOT NULL AND "type" IN ('note_created', 'note_deleted')
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_internal_notifications_created" ON "internal_notifications" ("created_at")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "IDX_internal_notifications_created"`);
    await q.query(`DROP INDEX IF EXISTS "UQ_internal_notifications_note_event"`);
    await q.query(`ALTER TABLE "internal_notification_reads" DROP COLUMN IF EXISTS "deleted_at"`);
    await q.query(`ALTER TABLE "admin_users" DROP COLUMN IF EXISTS "avatar_url"`);
  }
}
