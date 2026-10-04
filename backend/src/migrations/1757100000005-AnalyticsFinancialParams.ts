import { MigrationInterface, QueryRunner } from 'typeorm';

// 03/10/2026 — Parâmetros financeiros da aba Análise: taxas de pagamento
// (cartão/Pix) e imposto médio, em %. Padrão 0 (nada é deduzido até o dono configurar).
export class AnalyticsFinancialParams1757100000005 implements MigrationInterface {
  name = 'AnalyticsFinancialParams1757100000005';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "card_fee_percent" numeric(5,2) NOT NULL DEFAULT 0`);
    await q.query(`ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "pix_fee_percent" numeric(5,2) NOT NULL DEFAULT 0`);
    await q.query(`ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "tax_percent" numeric(5,2) NOT NULL DEFAULT 0`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "tenants" DROP COLUMN IF EXISTS "tax_percent"`);
    await q.query(`ALTER TABLE "tenants" DROP COLUMN IF EXISTS "pix_fee_percent"`);
    await q.query(`ALTER TABLE "tenants" DROP COLUMN IF EXISTS "card_fee_percent"`);
  }
}
