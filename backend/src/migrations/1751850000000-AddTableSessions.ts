import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTableSessions1751850000000 implements MigrationInterface {
  name = 'AddTableSessions1751850000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "restaurant_tables" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "number" varchar(20) NOT NULL,
        "qr_code_token" varchar(64) UNIQUE NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_restaurant_tables_tenant" ON "restaurant_tables" ("tenant_id")`);

    await queryRunner.query(`
      CREATE TABLE "table_sessions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "table_id" uuid NOT NULL REFERENCES "restaurant_tables"("id") ON DELETE CASCADE,
        "status" varchar(20) NOT NULL DEFAULT 'aberta',
        "opened_at" TIMESTAMP NOT NULL DEFAULT now(),
        "closed_at" TIMESTAMP
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_table_sessions_table" ON "table_sessions" ("table_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_table_sessions_tenant_status" ON "table_sessions" ("tenant_id", "status")`);

    await queryRunner.query(`
      CREATE TABLE "waiter_calls" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "table_session_id" uuid NOT NULL REFERENCES "table_sessions"("id") ON DELETE CASCADE,
        "status" varchar(20) NOT NULL DEFAULT 'pendente',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "attended_at" TIMESTAMP
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_waiter_calls_tenant_status" ON "waiter_calls" ("tenant_id", "status")`);

    await queryRunner.query(`
      ALTER TABLE "orders" ADD COLUMN "table_session_id" uuid REFERENCES "table_sessions"("id")
    `);
    await queryRunner.query(`CREATE INDEX "IDX_orders_table_session" ON "orders" ("table_session_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "table_session_id"`);
    await queryRunner.query(`DROP TABLE "waiter_calls"`);
    await queryRunner.query(`DROP TABLE "table_sessions"`);
    await queryRunner.query(`DROP TABLE "restaurant_tables"`);
  }
}
