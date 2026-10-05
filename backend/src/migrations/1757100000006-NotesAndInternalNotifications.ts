import { MigrationInterface, QueryRunner } from 'typeorm';

// 04/10/2026 — Aba "Anotações" (mural da equipe) + notificações INTERNAS.
//  - notes: post-its persistidos (só saem por exclusão manual);
//  - internal_notifications / internal_notification_reads: alertas da equipe,
//    com "lido" por usuário;
//  - user_push_subscriptions: aparelhos da equipe para Web Push (separada da
//    push_subscriptions dos clientes);
//  - tenants.internal_notification_target: quem recebe (owner | owner_manager | all).
export class NotesAndInternalNotifications1757100000006 implements MigrationInterface {
  name = 'NotesAndInternalNotifications1757100000006';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "notes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "content" text NOT NULL DEFAULT '',
        "color" varchar(9) NOT NULL DEFAULT '#FEF08A',
        "text_color" varchar(9) NOT NULL DEFAULT '#422006',
        "width" int NOT NULL DEFAULT 260,
        "height" int NOT NULL DEFAULT 220,
        "pos_x" int NOT NULL DEFAULT 24,
        "pos_y" int NOT NULL DEFAULT 24,
        "is_pinned" boolean NOT NULL DEFAULT false,
        "is_minimized" boolean NOT NULL DEFAULT false,
        "author_user_id" uuid NULL,
        "author_name" varchar(150) NOT NULL,
        "last_edited_by_name" varchar(150) NULL,
        "tag" varchar(20) NOT NULL DEFAULT 'Geral',
        "content_updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_notes_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_notes_tenant_created" ON "notes" ("tenant_id", "created_at")`);

    await q.query(`
      CREATE TABLE IF NOT EXISTS "internal_notifications" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "note_id" uuid NULL,
        "type" varchar(30) NOT NULL,
        "title" varchar(120) NOT NULL,
        "message" varchar(300) NOT NULL,
        "tag" varchar(20) NULL,
        "author_user_id" uuid NULL,
        "author_name" varchar(150) NOT NULL,
        "author_role" varchar(20) NOT NULL,
        "target_role" varchar(20) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_internal_notifications_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_internal_notifications_target" CHECK ("target_role" IN ('owner','owner_manager','all'))
      )
    `);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_internal_notifications_tenant_created" ON "internal_notifications" ("tenant_id", "created_at")`);

    await q.query(`
      CREATE TABLE IF NOT EXISTS "internal_notification_reads" (
        "notification_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "read_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_internal_notification_reads" PRIMARY KEY ("notification_id", "user_id"),
        CONSTRAINT "FK_internal_notification_reads_notification" FOREIGN KEY ("notification_id") REFERENCES "internal_notifications"("id") ON DELETE CASCADE
      )
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS "user_push_subscriptions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "role" varchar(20) NOT NULL,
        "endpoint" text NOT NULL UNIQUE,
        "p256dh" text NOT NULL,
        "auth" text NOT NULL,
        "user_agent" varchar(300) NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_user_push_subscriptions_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_user_push_subscriptions_tenant_user" ON "user_push_subscriptions" ("tenant_id", "user_id")`);

    await q.query(
      `ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "internal_notification_target" varchar(20) NOT NULL DEFAULT 'all'`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "tenants" DROP COLUMN IF EXISTS "internal_notification_target"`);
    await q.query(`DROP TABLE IF EXISTS "user_push_subscriptions"`);
    await q.query(`DROP TABLE IF EXISTS "internal_notification_reads"`);
    await q.query(`DROP TABLE IF EXISTS "internal_notifications"`);
    await q.query(`DROP TABLE IF EXISTS "notes"`);
  }
}
