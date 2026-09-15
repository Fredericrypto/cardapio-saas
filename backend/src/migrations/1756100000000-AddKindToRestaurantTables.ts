import { MigrationInterface, QueryRunner } from 'typeorm';

// Pedido do Felipe (13/09, sessão B): separar Mesa e Balcão de verdade no
// admin — mesmo backend/sessão/pedido, só identidade visual e agrupamento
// diferentes. `kind` é só uma etiqueta; nada no fluxo de QR/sessão muda.
// Default 'mesa' cobre todo cadastro existente automaticamente. Backfill
// abaixo detecta mesas já cadastradas com "balcão"/"balcao" no início do
// nome (como a "Balcão 1" que o Felipe já tinha criado manualmente) e
// marca como kind='balcao' sem precisar recriar nada.
export class AddKindToRestaurantTables1756100000000 implements MigrationInterface {
  name = 'AddKindToRestaurantTables1756100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "restaurant_tables" ADD COLUMN "kind" VARCHAR(10) NOT NULL DEFAULT 'mesa'`,
    );
    await queryRunner.query(
      `UPDATE "restaurant_tables" SET "kind" = 'balcao' WHERE "number" ILIKE 'balc%'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "restaurant_tables" DROP COLUMN "kind"`);
  }
}
