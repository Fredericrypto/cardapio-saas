import { MigrationInterface, QueryRunner } from 'typeorm';

// Sistema de promoção de verdade, no molde de iFood/McDonald's: banner
// próprio (ou herdado do produto vinculado), escopo (tudo / categoria /
// produto), limite de uso por cliente, teto global de usos, e os campos
// em `orders` que guardam o desconto realmente aplicado em cada pedido
// (sempre calculado no backend — ver PromotionsService.pickBestApplicable
// e OrdersService.create).
export class AddPromotions1753700000000 implements MigrationInterface {
  name = 'AddPromotions1753700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "promotions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "title" varchar(60) NOT NULL,
        "description" text NULL,
        "image_url" text NULL,
        "discount_type" varchar(20) NOT NULL,
        "discount_value" numeric(10,2) NOT NULL,
        "min_order_value" numeric(10,2) NOT NULL DEFAULT 0,
        "scope" varchar(20) NOT NULL DEFAULT 'all',
        "usage_limit_per_customer" int NULL,
        "max_redemptions" int NULL,
        "redemption_count" int NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "starts_at" timestamptz NULL,
        "ends_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz NULL,
        CONSTRAINT "PK_promotions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_promotions_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_promotions_tenant_id" ON "promotions" ("tenant_id")`);

    // Escopo "categoria específica" — ex: "30% off em pizzas".
    await queryRunner.query(`
      CREATE TABLE "promotion_categories" (
        "promotion_id" uuid NOT NULL,
        "category_id" uuid NOT NULL,
        CONSTRAINT "PK_promotion_categories" PRIMARY KEY ("promotion_id", "category_id"),
        CONSTRAINT "FK_promotion_categories_promotion" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_promotion_categories_category" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_promotion_categories_promotion" ON "promotion_categories" ("promotion_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_promotion_categories_category" ON "promotion_categories" ("category_id")`);

    // Escopo "produto específico" — ex: "R$5 off no Burger". Também é a
    // fonte da foto de fallback do card quando a promoção não tem banner
    // próprio (ver PromotionsService.attachDisplayImage).
    await queryRunner.query(`
      CREATE TABLE "promotion_products" (
        "promotion_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        CONSTRAINT "PK_promotion_products" PRIMARY KEY ("promotion_id", "product_id"),
        CONSTRAINT "FK_promotion_products_promotion" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_promotion_products_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_promotion_products_promotion" ON "promotion_products" ("promotion_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_promotion_products_product" ON "promotion_products" ("product_id")`);

    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "discount_amount" numeric(10,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN "promotion_id" uuid NULL`);
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "promotion_title_snapshot" varchar(60) NULL`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_orders_promotion_id" ON "orders" ("promotion_id")`);
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD CONSTRAINT "FK_orders_promotion" FOREIGN KEY ("promotion_id")
      REFERENCES "promotions"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "FK_orders_promotion"`);
    await queryRunner.query(`DROP INDEX "IDX_orders_promotion_id"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "promotion_title_snapshot"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "promotion_id"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "discount_amount"`);

    await queryRunner.query(`DROP TABLE "promotion_products"`);
    await queryRunner.query(`DROP TABLE "promotion_categories"`);

    await queryRunner.query(`DROP INDEX "IDX_promotions_tenant_id"`);
    await queryRunner.query(`DROP TABLE "promotions"`);
  }
}
