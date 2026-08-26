import { MigrationInterface, QueryRunner } from 'typeorm';

// "Resetar pra TODOS" — devolve o uso de uma promoção pra TODOS os
// clientes de uma vez (não só um por um), sem apagar nenhum pedido:
//  - `usage_reset_at`: qualquer pedido criado ANTES desse timestamp
//    deixa de contar pra checagem de limite por cliente (ver
//    PromotionsService.getCustomerUsedCount) — igual o reset
//    individual (promotion_customer_resets), só que valendo pra todo
//    mundo de uma vez.
//  - `usage_count_before_reset`: snapshot de quantos clientes
//    diferentes tinham usado a promoção no momento do reset — só pra
//    o admin ter esse número de referência depois (ver requisito:
//    "salvando apenas quantas pessoas usaram da última vez").
export class AddPromotionGlobalUsageReset1754300000000 implements MigrationInterface {
  name = 'AddPromotionGlobalUsageReset1754300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "usage_reset_at" timestamptz NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "usage_count_before_reset" integer NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "promotions" DROP COLUMN IF EXISTS "usage_count_before_reset"`,
    );
    await queryRunner.query(`ALTER TABLE "promotions" DROP COLUMN IF EXISTS "usage_reset_at"`);
  }
}
