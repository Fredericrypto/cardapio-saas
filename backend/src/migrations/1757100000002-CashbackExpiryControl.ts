import { MigrationInterface, QueryRunner } from 'typeorm';

// 03/10/2026 — Validade do cashback sob controle do admin + avisos de vencimento.
//  - settings_id: qual configuração gerou o crédito (edição da config alcança
//    os créditos já na carteira, sem alterar saldo);
//  - notified_week_at / notified_two_days_at: cada aviso sai uma vez por crédito.
// Backfill: créditos de pedido ainda abertos ganham a configuração aplicável
// (a específica da loja, senão a global) para a edição futura alcançá-los.
export class CashbackExpiryControl1757100000002 implements MigrationInterface {
  name = 'CashbackExpiryControl1757100000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "cashback_ledger_entries" ADD COLUMN IF NOT EXISTS "settings_id" uuid NULL`);
    await queryRunner.query(`ALTER TABLE "cashback_ledger_entries" ADD COLUMN IF NOT EXISTS "notified_week_at" timestamptz NULL`);
    await queryRunner.query(`ALTER TABLE "cashback_ledger_entries" ADD COLUMN IF NOT EXISTS "notified_two_days_at" timestamptz NULL`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_cashback_ledger_expiry" ON "cashback_ledger_entries" ("expires_at") WHERE "remaining_amount" > 0 AND "expires_at" IS NOT NULL`,
    );
    // Backfill: config específica da loja do crédito; senão a global do tenant.
    await queryRunner.query(`
      UPDATE "cashback_ledger_entries" e
      SET "settings_id" = COALESCE(
        (SELECT s.id FROM "cashback_settings" s
           JOIN "cashback_settings_locations" sl ON sl.cashback_settings_id = s.id
          WHERE s.tenant_id = e.tenant_id AND sl.location_id = e.location_id
          ORDER BY s.percentage DESC LIMIT 1),
        (SELECT s.id FROM "cashback_settings" s
          WHERE s.tenant_id = e.tenant_id
            AND NOT EXISTS (SELECT 1 FROM "cashback_settings_locations" x WHERE x.cashback_settings_id = s.id)
          ORDER BY s.percentage DESC LIMIT 1)
      )
      WHERE e.source_type = 'order' AND e.settings_id IS NULL AND e.remaining_amount > 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cashback_ledger_expiry"`);
    await queryRunner.query(`ALTER TABLE "cashback_ledger_entries" DROP COLUMN IF EXISTS "notified_two_days_at"`);
    await queryRunner.query(`ALTER TABLE "cashback_ledger_entries" DROP COLUMN IF EXISTS "notified_week_at"`);
    await queryRunner.query(`ALTER TABLE "cashback_ledger_entries" DROP COLUMN IF EXISTS "settings_id"`);
  }
}
