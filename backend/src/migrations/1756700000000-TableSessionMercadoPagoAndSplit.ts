import { MigrationInterface, QueryRunner } from 'typeorm';

// Pedido do Felipe (28/09, sessão W): 1) Pix de verdade (Mercado Pago) no
// fechamento de mesa, igual ao que já existe pra balcão/entrega; 2)
// quem está fechando a conta pode escolher se o cashback GANHO nessa
// sessão vai todo pra ele ou é dividido por quem pediu cada item
// (comportamento de sempre).
export class TableSessionMercadoPagoAndSplit1756700000000 implements MigrationInterface {
  name = 'TableSessionMercadoPagoAndSplit1756700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "table_sessions"
        ADD COLUMN "mp_payment_id" varchar NULL,
        ADD COLUMN "pix_payload" text NULL,
        ADD COLUMN "pix_expires_at" timestamptz NULL,
        ADD COLUMN "payment_status" varchar(20) NULL,
        ADD COLUMN "cashback_split_mode" varchar(20) NULL,
        ADD COLUMN "closing_requested_by_customer_id" uuid NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "table_sessions"
        ADD CONSTRAINT "FK_table_sessions_closing_customer"
        FOREIGN KEY ("closing_requested_by_customer_id") REFERENCES "customers"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "table_sessions" DROP CONSTRAINT "FK_table_sessions_closing_customer"`);
    await queryRunner.query(`
      ALTER TABLE "table_sessions"
        DROP COLUMN "mp_payment_id",
        DROP COLUMN "pix_payload",
        DROP COLUMN "pix_expires_at",
        DROP COLUMN "payment_status",
        DROP COLUMN "cashback_split_mode",
        DROP COLUMN "closing_requested_by_customer_id"
    `);
  }
}
