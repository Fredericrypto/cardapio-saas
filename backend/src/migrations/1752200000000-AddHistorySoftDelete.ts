import { MigrationInterface, QueryRunner } from 'typeorm';

// Suporte pra histórico de pedidos com expiração de 7 dias (ver handoff,
// seção 8.1). Decisão: nunca hard-delete por auditoria financeira — o cron
// job em HistoryService só soft-deleta (marca deleted_at), escondendo da UI.
export class AddHistorySoftDelete1752200000000 implements MigrationInterface {
  name = 'AddHistorySoftDelete1752200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN "deleted_at" TIMESTAMPTZ NULL`);
    await queryRunner.query(`ALTER TABLE "table_sessions" ADD COLUMN "deleted_at" TIMESTAMPTZ NULL`);
    await queryRunner.query(`CREATE INDEX "IDX_orders_deleted_at" ON "orders" ("deleted_at")`);
    await queryRunner.query(`CREATE INDEX "IDX_table_sessions_deleted_at" ON "table_sessions" ("deleted_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_table_sessions_deleted_at"`);
    await queryRunner.query(`DROP INDEX "IDX_orders_deleted_at"`);
    await queryRunner.query(`ALTER TABLE "table_sessions" DROP COLUMN "deleted_at"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "deleted_at"`);
  }
}
