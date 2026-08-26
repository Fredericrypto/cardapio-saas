import { MigrationInterface, QueryRunner } from 'typeorm';

// Suporte a MAIS DE UM cupom no mesmo pedido (ex: um cupom pro burger +
// outro pra coca-cola, cada um descontando itens diferentes do carrinho
// — ver PromotionsService.validateSelectedPromotions). `promotion_id`
// (singular) continua existindo, só não é mais a fonte de verdade: vira
// sempre a PRIMEIRA da lista nova `promotion_ids`, mantido por
// compatibilidade com qualquer código/relatório antigo que ainda olhe
// só pra ele. Pedidos já existentes são migrados automaticamente
// (promotion_ids = [promotion_id] pra quem já tinha uma promoção).
export class AddMultiplePromotionsToOrders1754500000000 implements MigrationInterface {
  name = 'AddMultiplePromotionsToOrders1754500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "promotion_ids" uuid[] NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "promotion_titles_snapshot" varchar(60)[] NULL`,
    );

    await queryRunner.query(`
      UPDATE "orders"
      SET "promotion_ids" = ARRAY["promotion_id"]
      WHERE "promotion_id" IS NOT NULL AND "promotion_ids" IS NULL
    `);
    await queryRunner.query(`
      UPDATE "orders"
      SET "promotion_titles_snapshot" = ARRAY["promotion_title_snapshot"]
      WHERE "promotion_title_snapshot" IS NOT NULL AND "promotion_titles_snapshot" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "promotion_titles_snapshot"`,
    );
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "promotion_ids"`);
  }
}
