import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1751800000000 implements MigrationInterface {
  name = 'InitialSchema1751800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`); // para gen_random_uuid()

    await queryRunner.query(`
      CREATE TABLE "tenants" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "slug" varchar(100) UNIQUE NOT NULL,
        "name" varchar(150) NOT NULL,
        "logo_url" text,
        "cover_image_url" text,
        "primary_color" varchar(7) NOT NULL DEFAULT '#E63946',
        "secondary_color" varchar(7) NOT NULL DEFAULT '#1D3557',
        "whatsapp_number" varchar(20),
        "address" text,
        "is_open" boolean NOT NULL DEFAULT true,
        "opening_hours" jsonb,
        "plan" varchar(20) NOT NULL DEFAULT 'trial',
        "is_active" boolean NOT NULL DEFAULT true,
        "delivery_fee" numeric(10,2) NOT NULL DEFAULT 0,
        "min_order_value" numeric(10,2) NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "admin_users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "email" varchar(150) UNIQUE NOT NULL,
        "password_hash" varchar(255) NOT NULL,
        "name" varchar(150),
        "role" varchar(20) NOT NULL DEFAULT 'owner',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_admin_users_tenant" ON "admin_users" ("tenant_id")`);

    await queryRunner.query(`
      CREATE TABLE "categories" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "name" varchar(100) NOT NULL,
        "display_order" int NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_categories_tenant" ON "categories" ("tenant_id")`);

    await queryRunner.query(`
      CREATE TABLE "products" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "category_id" uuid NOT NULL REFERENCES "categories"("id") ON DELETE CASCADE,
        "name" varchar(150) NOT NULL,
        "description" text,
        "price" numeric(10,2) NOT NULL,
        "promo_price" numeric(10,2),
        "image_url" text,
        "is_available" boolean NOT NULL DEFAULT true,
        "display_order" int NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_products_tenant" ON "products" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_products_category" ON "products" ("category_id")`);

    await queryRunner.query(`
      CREATE TABLE "product_options" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
        "name" varchar(100) NOT NULL,
        "is_required" boolean NOT NULL DEFAULT false,
        "allow_multiple" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_product_options_product" ON "product_options" ("product_id")`);

    await queryRunner.query(`
      CREATE TABLE "product_option_values" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "option_id" uuid NOT NULL REFERENCES "product_options"("id") ON DELETE CASCADE,
        "label" varchar(100) NOT NULL,
        "price_delta" numeric(10,2) NOT NULL DEFAULT 0
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_product_option_values_option" ON "product_option_values" ("option_id")`);

    await queryRunner.query(`
      CREATE TABLE "orders" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "customer_name" varchar(150),
        "customer_phone" varchar(20),
        "table_number" varchar(20),
        "order_type" varchar(20) NOT NULL DEFAULT 'balcao',
        "status" varchar(20) NOT NULL DEFAULT 'pendente',
        "total" numeric(10,2) NOT NULL,
        "delivery_fee" numeric(10,2) NOT NULL DEFAULT 0,
        "payment_method" varchar(20),
        "payment_status" varchar(20) NOT NULL DEFAULT 'pendente',
        "notes" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_orders_tenant" ON "orders" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_orders_tenant_status" ON "orders" ("tenant_id", "status")`);

    await queryRunner.query(`
      CREATE TABLE "order_items" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
        "product_id" uuid NOT NULL REFERENCES "products"("id"),
        "product_name" varchar(150) NOT NULL,
        "quantity" int NOT NULL DEFAULT 1,
        "unit_price" numeric(10,2) NOT NULL,
        "selected_options" jsonb,
        "subtotal" numeric(10,2) NOT NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_order_items_order" ON "order_items" ("order_id")`);

    await queryRunner.query(`CREATE INDEX "IDX_tenants_slug" ON "tenants" ("slug")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Ordem inversa por causa das foreign keys
    await queryRunner.query(`DROP TABLE "order_items"`);
    await queryRunner.query(`DROP TABLE "orders"`);
    await queryRunner.query(`DROP TABLE "product_option_values"`);
    await queryRunner.query(`DROP TABLE "product_options"`);
    await queryRunner.query(`DROP TABLE "products"`);
    await queryRunner.query(`DROP TABLE "categories"`);
    await queryRunner.query(`DROP TABLE "admin_users"`);
    await queryRunner.query(`DROP TABLE "tenants"`);
  }
}
