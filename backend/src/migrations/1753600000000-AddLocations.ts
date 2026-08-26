import { MigrationInterface, QueryRunner } from 'typeorm';

// Suporte a múltiplas filiais (mesma lógica do McDonald's: uma marca,
// várias lojas físicas). Tenant vira "marca" (nome, logo, cores,
// pagamento); tudo que é físico (endereço, horário, entrega) migra pra
// Location. Pra nunca perder dado de quem já usa o sistema: cria UMA
// Location padrão por tenant existente, copiando os valores que já
// estavam lá, e só depois remove as colunas antigas do Tenant.
export class AddLocations1753600000000 implements MigrationInterface {
  name = 'AddLocations1753600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "locations" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "name" varchar(150) NOT NULL,
        "whatsapp_number" varchar(20),
        "address" text,
        "latitude" numeric(10,7),
        "longitude" numeric(10,7),
        "is_open" boolean NOT NULL DEFAULT true,
        "opening_hours" jsonb,
        "delivery_fee" numeric(10,2) NOT NULL DEFAULT 0,
        "delivery_fee_per_km" numeric(10,2) NOT NULL DEFAULT 0,
        "delivery_max_radius_km" numeric(10,2),
        "min_order_value" numeric(10,2) NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_locations_tenant_id" ON "locations" ("tenant_id")`);

    // Uma Location padrão por tenant existente, com os dados físicos que
    // já estavam no Tenant — assim ninguém perde endereço/horário/entrega
    // já configurados.
    await queryRunner.query(`
      INSERT INTO "locations"
        ("tenant_id", "name", "whatsapp_number", "address", "latitude", "longitude",
         "is_open", "opening_hours", "delivery_fee", "delivery_fee_per_km",
         "delivery_max_radius_km", "min_order_value")
      SELECT "id", 'Unidade Principal', "whatsapp_number", "address", "latitude", "longitude",
             "is_open", "opening_hours", "delivery_fee", "delivery_fee_per_km",
             "delivery_max_radius_km", "min_order_value"
      FROM "tenants"
    `);

    // tables e orders passam a apontar pra uma Location (a mesa/pedido é
    // sempre de UMA loja física específica).
    await queryRunner.query(`ALTER TABLE "restaurant_tables" ADD COLUMN "location_id" uuid`);
    await queryRunner.query(`
      UPDATE "restaurant_tables" rt
      SET "location_id" = l."id"
      FROM "locations" l
      WHERE l."tenant_id" = rt."tenant_id"
    `);
    await queryRunner.query(
      `ALTER TABLE "restaurant_tables" ALTER COLUMN "location_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "restaurant_tables" ADD CONSTRAINT "FK_tables_location" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_restaurant_tables_location_id" ON "restaurant_tables" ("location_id")`,
    );

    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN "location_id" uuid`);
    await queryRunner.query(`
      UPDATE "orders" o
      SET "location_id" = l."id"
      FROM "locations" l
      WHERE l."tenant_id" = o."tenant_id"
    `);
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_orders_location" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_orders_location_id" ON "orders" ("location_id")`);

    // Campos físicos saem do Tenant (marca) — agora moram só na Location.
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN "whatsapp_number"`);
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN "address"`);
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN "is_open"`);
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN "opening_hours"`);
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN "delivery_fee"`);
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN "delivery_fee_per_km"`);
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN "delivery_max_radius_km"`);
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN "latitude"`);
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN "longitude"`);
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN "min_order_value"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tenants" ADD COLUMN "whatsapp_number" varchar(20)`);
    await queryRunner.query(`ALTER TABLE "tenants" ADD COLUMN "address" text`);
    await queryRunner.query(`ALTER TABLE "tenants" ADD COLUMN "is_open" boolean NOT NULL DEFAULT true`);
    await queryRunner.query(`ALTER TABLE "tenants" ADD COLUMN "opening_hours" jsonb`);
    await queryRunner.query(`ALTER TABLE "tenants" ADD COLUMN "delivery_fee" numeric(10,2) NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "tenants" ADD COLUMN "delivery_fee_per_km" numeric(10,2) NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "tenants" ADD COLUMN "delivery_max_radius_km" numeric(10,2)`);
    await queryRunner.query(`ALTER TABLE "tenants" ADD COLUMN "latitude" numeric(10,7)`);
    await queryRunner.query(`ALTER TABLE "tenants" ADD COLUMN "longitude" numeric(10,7)`);
    await queryRunner.query(`ALTER TABLE "tenants" ADD COLUMN "min_order_value" numeric(10,2) NOT NULL DEFAULT 0`);

    await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "FK_orders_location"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "location_id"`);
    await queryRunner.query(`ALTER TABLE "restaurant_tables" DROP CONSTRAINT "FK_tables_location"`);
    await queryRunner.query(`ALTER TABLE "restaurant_tables" DROP COLUMN "location_id"`);
    await queryRunner.query(`DROP TABLE "locations"`);
  }
}
