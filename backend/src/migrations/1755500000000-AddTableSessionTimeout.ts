import { MigrationInterface, QueryRunner } from 'typeorm';

// Tempo (minutos) que o cliente tem pra fazer o primeiro pedido depois de
// escanear o QR da mesa antes da sessão expirar sozinha. NULL = desativado.
export class AddTableSessionTimeout1755500000000 implements MigrationInterface {
  name = 'AddTableSessionTimeout1755500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenants"
      ADD COLUMN IF NOT EXISTS "table_session_timeout_minutes" integer NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenants"
      DROP COLUMN IF EXISTS "table_session_timeout_minutes"
    `);
  }
}
