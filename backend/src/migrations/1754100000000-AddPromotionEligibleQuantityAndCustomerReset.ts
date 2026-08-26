import { MigrationInterface, QueryRunner } from 'typeorm';

// Migration incremental (nunca edita as anteriores já aplicadas):
//  1. `max_eligible_quantity` — quantas UNIDADES elegíveis, no máximo,
//     entram no cálculo do desconto (null = sem limite, todo o carrinho
//     elegível conta, igual antes). Corrige o bug de "desconto multiplica
//     junto com a quantidade": antes, adicionar mais unidades do mesmo
//     item elegível aumentava o desconto sem parar (só limitado pelo
//     teto em R$ de promoções percentuais); agora o admin pode travar
//     em quantas unidades o cupom realmente vale (ex: 1 ou 2), e essas
//     unidades ficam isoladas visualmente no carrinho (ver
//     PromotionsService.computeEligibleUnits e o frontend-cardapio).
//  2. `promotion_customer_resets` — permite o admin "devolver" o uso de
//     uma promoção pra um cliente específico sem apagar nem alterar o
//     histórico de pedidos (que precisa continuar íntegro pra sempre).
//     Ao invés de mexer nos pedidos antigos, guardamos quando o admin
//     resetou; a checagem de limite por cliente
//     (PromotionsService.validateSelectedPromotion) passa a contar só
//     pedidos feitos DEPOIS do último reset.
export class AddPromotionEligibleQuantityAndCustomerReset1754100000000
  implements MigrationInterface
{
  name = 'AddPromotionEligibleQuantityAndCustomerReset1754100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "max_eligible_quantity" integer NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "promotion_customer_resets" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "promotion_id" uuid NOT NULL,
        "customer_id" uuid NOT NULL,
        "reset_at" timestamptz NOT NULL DEFAULT now(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_promotion_customer_resets" PRIMARY KEY ("id"),
        CONSTRAINT "FK_promotion_customer_resets_promotion" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_promotion_customer_resets_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE
      )
    `);
    // Uma linha por (promoção, cliente) — resetar de novo simplesmente
    // atualiza o reset_at pra agora, em vez de acumular linhas.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_promotion_customer_resets_unique"
      ON "promotion_customer_resets" ("promotion_id", "customer_id")
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_promotion_customer_resets_tenant" ON "promotion_customer_resets" ("tenant_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "promotion_customer_resets"`);
    await queryRunner.query(
      `ALTER TABLE "promotions" DROP COLUMN IF EXISTS "max_eligible_quantity"`,
    );
  }
}
