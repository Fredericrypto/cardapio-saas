import { MigrationInterface, QueryRunner } from 'typeorm';

// Base de dois sistemas novos:
//
//  1. `receipt_redemptions` — o registro de "esse cupom foi usado pra
//     ISSO" (reembolso, reclamação, retirada, carimbo de fidelidade,
//     etc). É o mecanismo ANTI-PASSBACK: se o mesmo cupom for escaneado
//     de novo pro MESMO propósito, o admin vê na hora quando/quem/por
//     quê já foi usado, em vez de deixar aprovar de novo (o cenário que
//     motivou isso: cliente de má-fé voltando em outro horário, falando
//     com outro atendente que não tem como saber que aquele cupom já
//     foi usado). Cada propósito é INDEPENDENTE dos outros — usar pra
//     reclamação não trava usar pra fidelidade no mesmo cupom.
//
//  2. `loyalty_programs` / `loyalty_stamps` / `loyalty_rewards` — cartão
//     fidelidade configurável pelo estabelecimento ("a cada 5 compras,
//     ganha 1 sobremesa"). Cada carimbo é um `receipt_redemptions` com
//     propósito 'fidelidade', então o mesmo cupom nunca conta carimbo
//     duas vezes pro mesmo programa.
export class AddReceiptRedemptionsAndLoyaltyProgram1754700000000
  implements MigrationInterface
{
  name = 'AddReceiptRedemptionsAndLoyaltyProgram1754700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---- receipt_redemptions ----
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "receipt_redemptions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "source_type" varchar(10) NOT NULL,
        "source_id" uuid NOT NULL,
        "customer_id" uuid NULL,
        "purpose" varchar(20) NOT NULL,
        "loyalty_program_id" uuid NULL,
        "staff_user_id" uuid NOT NULL,
        "staff_name" varchar(150) NOT NULL,
        "notes" varchar(500) NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_receipt_redemptions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_receipt_redemptions_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_receipt_redemptions_source_type" CHECK ("source_type" IN ('avulso', 'mesa')),
        CONSTRAINT "CHK_receipt_redemptions_purpose" CHECK ("purpose" IN ('reembolso', 'reclamacao', 'retirada', 'fidelidade', 'outro'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_receipt_redemptions_tenant" ON "receipt_redemptions" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_receipt_redemptions_customer" ON "receipt_redemptions" ("customer_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_receipt_redemptions_source" ON "receipt_redemptions" ("source_type", "source_id")`,
    );
    // Anti-passback de verdade: dois índices únicos PARCIAIS (não dá pra
    // usar UNIQUE normal incluindo loyalty_program_id porque NULL nunca
    // é igual a NULL no Postgres — dois reembolsos do mesmo pedido, os
    // dois com loyalty_program_id NULL, passariam batido). Um índice
    // cobre os propósitos SEM programa (reembolso/reclamação/retirada/
    // outro — nunca mais de um por pedido); o outro cobre fidelidade
    // (pode ter um carimbo por PROGRAMA diferente no mesmo pedido, mas
    // nunca dois carimbos pro MESMO programa).
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_receipt_redemptions_unique_no_program"
      ON "receipt_redemptions" ("source_type", "source_id", "purpose")
      WHERE "purpose" != 'fidelidade'
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_receipt_redemptions_unique_loyalty"
      ON "receipt_redemptions" ("source_type", "source_id", "loyalty_program_id")
      WHERE "purpose" = 'fidelidade'
    `);

    // ---- loyalty_programs ----
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "loyalty_programs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "name" varchar(80) NOT NULL,
        "description" varchar(300) NULL,
        "stamps_required" integer NOT NULL,
        "reward_type" varchar(20) NOT NULL,
        "reward_description" varchar(150) NOT NULL,
        "cashback_amount" numeric(10,2) NULL,
        "discount_type" varchar(10) NULL,
        "discount_value" numeric(10,2) NULL,
        "min_order_value" numeric(10,2) NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_loyalty_programs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_loyalty_programs_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_loyalty_programs_reward_type" CHECK ("reward_type" IN ('sobremesa', 'brinde', 'camiseta', 'refeicao', 'cashback', 'desconto', 'outro')),
        CONSTRAINT "CHK_loyalty_programs_stamps_required" CHECK ("stamps_required" > 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_loyalty_programs_tenant" ON "loyalty_programs" ("tenant_id")`,
    );

    // Mesmo padrão de escopo por loja das promoções (ver
    // promotion_locations) — vazio = vale em todas as lojas.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "loyalty_program_locations" (
        "loyalty_program_id" uuid NOT NULL,
        "location_id" uuid NOT NULL,
        CONSTRAINT "PK_loyalty_program_locations" PRIMARY KEY ("loyalty_program_id", "location_id"),
        CONSTRAINT "FK_loyalty_program_locations_program" FOREIGN KEY ("loyalty_program_id") REFERENCES "loyalty_programs"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_loyalty_program_locations_location" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE
      )
    `);

    // ---- loyalty_stamps ----
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "loyalty_stamps" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "program_id" uuid NOT NULL,
        "customer_id" uuid NOT NULL,
        "redemption_id" uuid NOT NULL,
        "reward_id" uuid NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_loyalty_stamps" PRIMARY KEY ("id"),
        CONSTRAINT "FK_loyalty_stamps_program" FOREIGN KEY ("program_id") REFERENCES "loyalty_programs"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_loyalty_stamps_redemption" FOREIGN KEY ("redemption_id") REFERENCES "receipt_redemptions"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_loyalty_stamps_redemption" UNIQUE ("redemption_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_loyalty_stamps_customer_program" ON "loyalty_stamps" ("program_id", "customer_id")`,
    );

    // ---- loyalty_rewards ----
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "loyalty_rewards" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "program_id" uuid NOT NULL,
        "customer_id" uuid NOT NULL,
        "status" varchar(15) NOT NULL DEFAULT 'pendente',
        "granted_at" timestamptz NOT NULL DEFAULT now(),
        "redeemed_at" timestamptz NULL,
        "redeemed_by_staff_user_id" uuid NULL,
        "redeemed_by_staff_name" varchar(150) NULL,
        CONSTRAINT "PK_loyalty_rewards" PRIMARY KEY ("id"),
        CONSTRAINT "FK_loyalty_rewards_program" FOREIGN KEY ("program_id") REFERENCES "loyalty_programs"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_loyalty_rewards_status" CHECK ("status" IN ('pendente', 'resgatado'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_loyalty_rewards_customer_program" ON "loyalty_rewards" ("program_id", "customer_id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "loyalty_stamps" ADD CONSTRAINT "FK_loyalty_stamps_reward" FOREIGN KEY ("reward_id") REFERENCES "loyalty_rewards"("id") ON DELETE SET NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "loyalty_rewards"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "loyalty_stamps"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "loyalty_program_locations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "loyalty_programs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "receipt_redemptions"`);
  }
}
