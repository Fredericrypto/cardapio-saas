import { MigrationInterface, QueryRunner } from 'typeorm';

// Migration INCREMENTAL — não mexe na AddPromotions1753700000000 (essa
// já foi aplicada em produção com a versão antiga/simples da tabela
// `promotions`, e o TypeORM rastreia migrations pelo NOME, não pelo
// conteúdo do arquivo — editar uma migration já rodada não refaz nada
// no banco). Isso aqui adiciona por cima o que faltou: foto do banner,
// escopo (tudo/categoria/produto), limite de uso por cliente, teto
// global de usos, e as duas tabelas de vínculo com categoria/produto.
// Tudo com IF NOT EXISTS pra ser seguro rodar mesmo se parte já existir.
export class AddPromotionScopeAndUsageLimits1753900000000 implements MigrationInterface {
  name = 'AddPromotionScopeAndUsageLimits1753900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "image_url" text NULL`);
    await queryRunner.query(
      `ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "scope" varchar(20) NOT NULL DEFAULT 'all'`,
    );
    await queryRunner.query(
      `ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "usage_limit_per_customer" int NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "max_redemptions" int NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "redemption_count" int NOT NULL DEFAULT 0`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "promotion_categories" (
        "promotion_id" uuid NOT NULL,
        "category_id" uuid NOT NULL,
        CONSTRAINT "PK_promotion_categories" PRIMARY KEY ("promotion_id", "category_id"),
        CONSTRAINT "FK_promotion_categories_promotion" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_promotion_categories_category" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_promotion_categories_promotion" ON "promotion_categories" ("promotion_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_promotion_categories_category" ON "promotion_categories" ("category_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "promotion_products" (
        "promotion_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        CONSTRAINT "PK_promotion_products" PRIMARY KEY ("promotion_id", "product_id"),
        CONSTRAINT "FK_promotion_products_promotion" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_promotion_products_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_promotion_products_promotion" ON "promotion_products" ("promotion_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_promotion_products_product" ON "promotion_products" ("product_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "promotion_products"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "promotion_categories"`);
    await queryRunner.query(`ALTER TABLE "promotions" DROP COLUMN IF EXISTS "redemption_count"`);
    await queryRunner.query(`ALTER TABLE "promotions" DROP COLUMN IF EXISTS "max_redemptions"`);
    await queryRunner.query(`ALTER TABLE "promotions" DROP COLUMN IF EXISTS "usage_limit_per_customer"`);
    await queryRunner.query(`ALTER TABLE "promotions" DROP COLUMN IF EXISTS "scope"`);
    await queryRunner.query(`ALTER TABLE "promotions" DROP COLUMN IF EXISTS "image_url"`);
  }
}
