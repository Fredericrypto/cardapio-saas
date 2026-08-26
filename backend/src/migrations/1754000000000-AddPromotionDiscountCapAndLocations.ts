import { MigrationInterface, QueryRunner } from 'typeorm';

// Migration incremental (nunca edita as anteriores já aplicadas):
//  1. `max_discount_amount` — teto obrigatório pra desconto percentual,
//     corrige um bug real de produção (pedido com quantidade grande do
//     mesmo item gerava desconto sem limite nenhum).
//  2. Escopo por loja (`promotion_locations`) + `allow_reuse_across_locations`
//     — admin escolhe em quais lojas a promoção vale, e se o uso por
//     cliente é compartilhado entre lojas ou independente por loja.
export class AddPromotionDiscountCapAndLocations1754000000000 implements MigrationInterface {
  name = 'AddPromotionDiscountCapAndLocations1754000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "max_discount_amount" numeric(10,2) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "allow_reuse_across_locations" boolean NOT NULL DEFAULT false`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "promotion_locations" (
        "promotion_id" uuid NOT NULL,
        "location_id" uuid NOT NULL,
        CONSTRAINT "PK_promotion_locations" PRIMARY KEY ("promotion_id", "location_id"),
        CONSTRAINT "FK_promotion_locations_promotion" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_promotion_locations_location" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_promotion_locations_promotion" ON "promotion_locations" ("promotion_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_promotion_locations_location" ON "promotion_locations" ("location_id")`,
    );

    // Backfill defensivo: qualquer promoção percentual já existente sem
    // teto ganha um teto conservador (o próprio valor do pedido mínimo,
    // ou R$50 se não tiver mínimo) — só pra nunca deixar uma promoção
    // antiga rodando sem limite depois dessa migration. O admin pode (e
    // deve) ajustar esse valor depois.
    await queryRunner.query(`
      UPDATE "promotions"
      SET "max_discount_amount" = GREATEST("min_order_value", 50)
      WHERE "discount_type" = 'percentage' AND "max_discount_amount" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "promotion_locations"`);
    await queryRunner.query(`ALTER TABLE "promotions" DROP COLUMN IF EXISTS "allow_reuse_across_locations"`);
    await queryRunner.query(`ALTER TABLE "promotions" DROP COLUMN IF EXISTS "max_discount_amount"`);
  }
}
