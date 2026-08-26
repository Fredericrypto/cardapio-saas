import { MigrationInterface, QueryRunner } from 'typeorm';

// Tabela de detalhamento: quanto CADA promoção descontou em CADA
// pedido — necessária porque agora um pedido pode usar mais de um
// cupom ao mesmo tempo (ver AddMultiplePromotionsToOrders). Sem isso,
// os relatórios do admin (getRedemptions, totalDiscountGiven por
// promoção) só teriam a soma total do pedido, sem saber quanto veio de
// cada cupom especificamente.
export class AddOrderPromotionDiscounts1754600000000 implements MigrationInterface {
  name = 'AddOrderPromotionDiscounts1754600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "order_promotion_discounts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "order_id" uuid NOT NULL,
        "promotion_id" uuid NOT NULL,
        "discount_amount" numeric(10,2) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_order_promotion_discounts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_order_promotion_discounts_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_order_promotion_discounts_promotion" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_order_promotion_discounts_tenant" ON "order_promotion_discounts" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_order_promotion_discounts_order" ON "order_promotion_discounts" ("order_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_order_promotion_discounts_promotion" ON "order_promotion_discounts" ("promotion_id")`,
    );

    // Backfill: pedidos antigos (uma promoção só) viram uma linha cada
    // aqui, com o discount_amount total do pedido (era só daquela
    // promoção mesmo, já que só existia uma por pedido até agora).
    await queryRunner.query(`
      INSERT INTO "order_promotion_discounts" ("tenant_id", "order_id", "promotion_id", "discount_amount")
      SELECT "tenant_id", "id", "promotion_id", "discount_amount"
      FROM "orders"
      WHERE "promotion_id" IS NOT NULL AND "discount_amount" > 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "order_promotion_discounts"`);
  }
}
