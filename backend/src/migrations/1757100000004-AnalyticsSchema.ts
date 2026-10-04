import { MigrationInterface, QueryRunner } from 'typeorm';

// 03/10/2026 — Base de dados da aba "Análise" (CMV, perdas, caixa).
//  - products.cost_price: custo direto (opcional) → CMV real;
//  - order_items.unit_cost: snapshot do custo no momento do pedido;
//  - tenants.default_cmv_percent: % de CMV estimado (padrão 30) quando falta custo;
//  - orders.cancel_reason / canceled_at / canceled_by_user_id: análise de cancelamento
//    (backfill: pedidos já cancelados ganham canceled_at = updated_at);
//  - cash_transactions: sangria, suprimento, abertura e fechamento de caixa;
//  - índices para as agregações por período.
export class AnalyticsSchema1757100000004 implements MigrationInterface {
  name = 'AnalyticsSchema1757100000004';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "cost_price" numeric(10,2) NULL`);
    await q.query(`ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "unit_cost" numeric(10,2) NULL`);
    await q.query(`ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "default_cmv_percent" numeric(5,2) NOT NULL DEFAULT 30`);
    await q.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "cancel_reason" varchar(300) NULL`);
    await q.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "canceled_at" timestamptz NULL`);
    await q.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "canceled_by_user_id" uuid NULL`);
    await q.query(`UPDATE "orders" SET "canceled_at" = "updated_at" WHERE "status" = 'cancelado' AND "canceled_at" IS NULL`);

    await q.query(`
      CREATE TABLE IF NOT EXISTS "cash_transactions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "location_id" uuid NULL,
        "user_id" uuid NOT NULL,
        "type" varchar(20) NOT NULL,
        "amount" numeric(10,2) NOT NULL,
        "reason" varchar(300) NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_cash_transactions_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cash_transactions_location" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_cash_transactions_type" CHECK ("type" IN ('sangria','suprimento','abertura','fechamento'))
      )
    `);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_cash_transactions_tenant_created" ON "cash_transactions" ("tenant_id", "created_at")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_cash_transactions_type" ON "cash_transactions" ("type")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_orders_tenant_created" ON "orders" ("tenant_id", "created_at")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "IDX_orders_tenant_created"`);
    await q.query(`DROP TABLE IF EXISTS "cash_transactions"`);
    await q.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "canceled_by_user_id"`);
    await q.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "canceled_at"`);
    await q.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "cancel_reason"`);
    await q.query(`ALTER TABLE "tenants" DROP COLUMN IF EXISTS "default_cmv_percent"`);
    await q.query(`ALTER TABLE "order_items" DROP COLUMN IF EXISTS "unit_cost"`);
    await q.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "cost_price"`);
  }
}
