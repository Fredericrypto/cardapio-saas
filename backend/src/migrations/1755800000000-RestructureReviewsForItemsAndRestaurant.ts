import { MigrationInterface, QueryRunner } from 'typeorm';

// Reestrutura completa do sistema de avaliações — antes só existia
// avaliação POR PEDIDO (uma por order_id, pra sempre). Agora existem
// dois tipos independentes:
// - 'restaurant': UMA por cliente por restaurante (estilo Play Store) —
//   com texto, sempre que o cliente tiver um pedido concluído ainda não
//   usado por essa avaliação.
// - 'item': uma por cliente por PRODUTO — só estrelas, sem texto, cada
//   pedido concluído contendo aquele produto libera uma tentativa (se a
//   anterior tiver sido apagada).
//
// A trava de "não pode reavaliar sem comprar de novo" continua vindo do
// mesmo mecanismo de antes (soft-delete + índice único cobrindo também
// linhas apagadas) — só que agora dividido em dois índices parciais
// (um por tipo), já que um mesmo `order_id` agora pode aparecer em VÁRIAS
// linhas de review (uma de restaurante + uma por produto do pedido).
export class RestructureReviewsForItemsAndRestaurant1755800000000
  implements MigrationInterface
{
  name = 'RestructureReviewsForItemsAndRestaurant1755800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "reviews"
      ADD COLUMN IF NOT EXISTS "target_type" varchar(20) NOT NULL DEFAULT 'restaurant',
      ADD COLUMN IF NOT EXISTS "product_id" uuid NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "UQ_reviews_order"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_reviews_orderId"
    `);
    await queryRunner.query(`
      ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "UQ_reviews_orderId"
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_reviews_one_restaurant_per_order"
      ON "reviews" ("order_id")
      WHERE "target_type" = 'restaurant'
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_reviews_one_item_per_order_product"
      ON "reviews" ("order_id", "product_id")
      WHERE "target_type" = 'item'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_reviews_customer_target_product"
      ON "reviews" ("customer_id", "target_type", "product_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_reviews_customer_target_product"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_reviews_one_item_per_order_product"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_reviews_one_restaurant_per_order"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_reviews_orderId" ON "reviews" ("order_id")
    `);
    await queryRunner.query(`
      ALTER TABLE "reviews" ADD CONSTRAINT "UQ_reviews_order" UNIQUE ("order_id")
    `);
    await queryRunner.query(`
      ALTER TABLE "reviews"
      DROP COLUMN IF EXISTS "product_id",
      DROP COLUMN IF EXISTS "target_type"
    `);
  }
}
