import { MigrationInterface, QueryRunner } from 'typeorm';

// Infraestrutura de Web Push (RFC 8291/8292) — primeira notificação
// implementada é "avalie seu pedido", mas a tabela já é genérica pra
// qualquer tipo futuro (pedido pronto, promoção, etc), já que o "tipo"
// vive só no PAYLOAD enviado (PushService.sendToCustomer), nunca no
// schema.
export class AddPushSubscriptions1755300000000 implements MigrationInterface {
  name = 'AddPushSubscriptions1755300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "push_subscriptions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "customer_id" uuid NOT NULL,
        "endpoint" varchar(500) NOT NULL,
        "p256dh" varchar(200) NOT NULL,
        "auth" varchar(200) NOT NULL,
        "user_agent" varchar(300) NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_push_subscriptions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_push_subscriptions_endpoint" UNIQUE ("endpoint"),
        CONSTRAINT "FK_push_subscriptions_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_push_subscriptions_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_push_subscriptions_tenant" ON "push_subscriptions" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_push_subscriptions_customer" ON "push_subscriptions" ("customer_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "push_subscriptions"`);
  }
}
