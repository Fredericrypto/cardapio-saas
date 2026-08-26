import { MigrationInterface, QueryRunner } from 'typeorm';

// Suporte à marcação manual de "cupom importante/requer atenção" no
// histórico (destaque vermelho na UI) — não tem relação com o soft-delete
// automático de 7 dias, é só uma flag visual/administrativa.
export class AddFlaggedToOrdersAndSessions1752400000000 implements MigrationInterface {
  name = 'AddFlaggedToOrdersAndSessions1752400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "flagged" BOOLEAN NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "table_sessions" ADD COLUMN "flagged" BOOLEAN NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "table_sessions" DROP COLUMN "flagged"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "flagged"`);
  }
}
