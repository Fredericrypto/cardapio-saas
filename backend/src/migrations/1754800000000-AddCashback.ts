import { MigrationInterface, QueryRunner } from 'typeorm';

// Sistema de Cashback (estilo Uber Cash / iFood): % de volta em toda
// compra, creditado automaticamente na carteira do cliente ao pagamento
// ser confirmado, gasto por escolha do cliente no checkout ("usar meu
// saldo de cashback"). Três tabelas:
//
//  1. `cashback_settings` — config por tenant, escopo por loja (mesmo
//     padrão de promotion_locations/loyalty_program_locations).
//  2. `cashback_ledger_entries` — ledger de CRÉDITOS, append-only. O
//     saldo do cliente é sempre a soma de `remaining_amount` das linhas
//     não expiradas — nunca um contador solto.
//  3. `cashback_consumptions` — detalhamento de quanto cada PEDIDO gastou
//     de CADA crédito (um pedido pode consumir de vários créditos ao
//     mesmo tempo).
//
// Também adiciona `cashback_used`/`cashback_earned` em `orders`, mesma
// lógica de snapshot já usada em delivery_fee/discount_amount.
export class AddCashback1754800000000 implements MigrationInterface {
  name = 'AddCashback1754800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---- cashback_settings ----
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cashback_settings" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "name" varchar(80) NOT NULL DEFAULT 'Cashback',
        "is_active" boolean NOT NULL DEFAULT true,
        "percentage" numeric(5,2) NOT NULL,
        "min_order_value" numeric(10,2) NOT NULL DEFAULT 0,
        "max_cashback_per_order" numeric(10,2) NULL,
        "expiration_days" integer NULL,
        "promo_text" varchar(150) NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cashback_settings" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cashback_settings_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_cashback_settings_percentage" CHECK ("percentage" > 0 AND "percentage" <= 100)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_cashback_settings_tenant" ON "cashback_settings" ("tenant_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cashback_settings_locations" (
        "cashback_settings_id" uuid NOT NULL,
        "location_id" uuid NOT NULL,
        CONSTRAINT "PK_cashback_settings_locations" PRIMARY KEY ("cashback_settings_id", "location_id"),
        CONSTRAINT "FK_cashback_settings_locations_settings" FOREIGN KEY ("cashback_settings_id") REFERENCES "cashback_settings"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cashback_settings_locations_location" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE
      )
    `);

    // ---- cashback_ledger_entries ----
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cashback_ledger_entries" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "customer_id" uuid NOT NULL,
        "location_id" uuid NULL,
        "source_type" varchar(20) NOT NULL,
        "source_id" uuid NULL,
        "original_amount" numeric(10,2) NOT NULL,
        "remaining_amount" numeric(10,2) NOT NULL,
        "expires_at" timestamptz NULL,
        "notes" varchar(300) NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cashback_ledger_entries" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cashback_ledger_entries_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cashback_ledger_entries_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cashback_ledger_entries_location" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_cashback_ledger_entries_source_type" CHECK ("source_type" IN ('order', 'loyalty_reward', 'admin_adjustment')),
        CONSTRAINT "CHK_cashback_ledger_entries_remaining" CHECK ("remaining_amount" >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_cashback_ledger_entries_tenant" ON "cashback_ledger_entries" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_cashback_ledger_entries_customer" ON "cashback_ledger_entries" ("customer_id")`,
    );
    // Índice único PARCIAL (só sobre linhas com source_id preenchido) —
    // 'admin_adjustment' pode se repetir livremente (source_id fica
    // null), mas 'order'/'loyalty_reward' nunca creditam duas vezes pra
    // MESMA origem, mesmo sob concorrência (2 requisições tentando
    // confirmar o mesmo pagamento ao mesmo tempo).
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_cashback_ledger_entries_unique_source"
      ON "cashback_ledger_entries" ("source_type", "source_id")
      WHERE "source_id" IS NOT NULL
    `);

    // ---- cashback_consumptions ----
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cashback_consumptions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "customer_id" uuid NOT NULL,
        "order_id" uuid NOT NULL,
        "ledger_entry_id" uuid NOT NULL,
        "amount" numeric(10,2) NOT NULL,
        "reversed" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cashback_consumptions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cashback_consumptions_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cashback_consumptions_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cashback_consumptions_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cashback_consumptions_ledger_entry" FOREIGN KEY ("ledger_entry_id") REFERENCES "cashback_ledger_entries"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_cashback_consumptions_tenant" ON "cashback_consumptions" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_cashback_consumptions_order" ON "cashback_consumptions" ("order_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_cashback_consumptions_ledger_entry" ON "cashback_consumptions" ("ledger_entry_id")`,
    );

    // ---- orders: snapshot de cashback usado/ganho ----
    await queryRunner.query(`
      ALTER TABLE "orders"
        ADD COLUMN IF NOT EXISTS "cashback_used" numeric(10,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "cashback_earned" numeric(10,2) NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "cashback_used", DROP COLUMN IF EXISTS "cashback_earned"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "cashback_consumptions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cashback_ledger_entries"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cashback_settings_locations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cashback_settings"`);
  }
}
