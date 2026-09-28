import { MigrationInterface, QueryRunner } from 'typeorm';

// Reforma do fechamento de conta de mesa (pedido do Felipe, 28/09): o
// CLIENTE agora escolhe forma de pagamento e se quer usar cashback ao
// solicitar o fechamento, em vez do admin decidir tudo sozinho sem
// nenhum sinal. Cashback também passa a poder ser gasto direto no
// fechamento de uma MESA (antes só em pedido avulso de balcão/entrega),
// então `cashback_consumptions.order_id` vira opcional e ganha uma
// origem alternativa (`table_session_id`) — exatamente um dos dois
// sempre preenchido, nunca os dois.
export class TableSessionPaymentFlow1756600000000 implements MigrationInterface {
  name = 'TableSessionPaymentFlow1756600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "table_sessions"
        ADD COLUMN "requested_payment_method" varchar(20) NULL,
        ADD COLUMN "cash_delivery_preference" varchar(20) NULL,
        ADD COLUMN "cashback_requested_by_customer_id" uuid NULL,
        ADD COLUMN "cashback_used" numeric(10,2) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "table_sessions"
        ADD CONSTRAINT "FK_table_sessions_cashback_customer"
        FOREIGN KEY ("cashback_requested_by_customer_id") REFERENCES "customers"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "cashback_consumptions"
        ALTER COLUMN "order_id" DROP NOT NULL,
        ADD COLUMN "table_session_id" uuid NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "cashback_consumptions"
        ADD CONSTRAINT "FK_cashback_consumptions_table_session"
        FOREIGN KEY ("table_session_id") REFERENCES "table_sessions"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`CREATE INDEX "IDX_cashback_consumptions_table_session_id" ON "cashback_consumptions" ("table_session_id")`);
    // Exatamente uma origem por linha — nunca as duas, nunca nenhuma.
    await queryRunner.query(`
      ALTER TABLE "cashback_consumptions"
        ADD CONSTRAINT "CHK_cashback_consumptions_one_source"
        CHECK (
          ("order_id" IS NOT NULL AND "table_session_id" IS NULL) OR
          ("order_id" IS NULL AND "table_session_id" IS NOT NULL)
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "cashback_consumptions" DROP CONSTRAINT "CHK_cashback_consumptions_one_source"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cashback_consumptions_table_session_id"`);
    await queryRunner.query(`ALTER TABLE "cashback_consumptions" DROP CONSTRAINT "FK_cashback_consumptions_table_session"`);
    await queryRunner.query(`
      ALTER TABLE "cashback_consumptions"
        DROP COLUMN "table_session_id",
        ALTER COLUMN "order_id" SET NOT NULL
    `);

    await queryRunner.query(`ALTER TABLE "table_sessions" DROP CONSTRAINT "FK_table_sessions_cashback_customer"`);
    await queryRunner.query(`
      ALTER TABLE "table_sessions"
        DROP COLUMN "requested_payment_method",
        DROP COLUMN "cash_delivery_preference",
        DROP COLUMN "cashback_requested_by_customer_id",
        DROP COLUMN "cashback_used"
    `);
  }
}
