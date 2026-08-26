import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTipAndPaymentToSessions1751870000000
  implements MigrationInterface
{
  name = 'AddTipAndPaymentToSessions1751870000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "table_sessions"
        ADD COLUMN "tip_amount" numeric(10,2) NOT NULL DEFAULT 0,
        ADD COLUMN "payment_method" varchar(20),
        ADD COLUMN "amount_received" numeric(10,2),
        ADD COLUMN "change_given" numeric(10,2)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "table_sessions"
        DROP COLUMN "tip_amount",
        DROP COLUMN "payment_method",
        DROP COLUMN "amount_received",
        DROP COLUMN "change_given"
    `);
  }
}
