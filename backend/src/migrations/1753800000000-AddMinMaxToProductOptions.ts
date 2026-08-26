import { MigrationInterface, QueryRunner } from 'typeorm';

// Troca o modelo de grupo de opções de dois booleanos soltos
// (is_required / allow_multiple) pelo modelo real do iFood: quantidade
// MÍNIMA e MÁXIMA de escolhas por grupo (ver comentário em
// product-option.entity.ts). Backfill preserva o comportamento antigo
// exatamente: is_required=true vira min_select=1; allow_multiple=true
// vira max_select = quantidade de opções já cadastradas nesse grupo
// (era, na prática, "sem limite dentro do que existe").
export class AddMinMaxToProductOptions1753800000000 implements MigrationInterface {
  name = 'AddMinMaxToProductOptions1753800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product_options" ADD COLUMN "min_select" int NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_options" ADD COLUMN "max_select" int NOT NULL DEFAULT 1`,
    );

    await queryRunner.query(`
      UPDATE "product_options"
      SET "min_select" = CASE WHEN "is_required" THEN 1 ELSE 0 END
    `);
    await queryRunner.query(`
      UPDATE "product_options" po
      SET "max_select" = CASE
        WHEN po."allow_multiple" THEN GREATEST(
          1,
          (SELECT COUNT(*) FROM "product_option_values" pov WHERE pov."option_id" = po."id")
        )
        ELSE 1
      END
    `);

    await queryRunner.query(`ALTER TABLE "product_options" DROP COLUMN "is_required"`);
    await queryRunner.query(`ALTER TABLE "product_options" DROP COLUMN "allow_multiple"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product_options" ADD COLUMN "is_required" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_options" ADD COLUMN "allow_multiple" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `UPDATE "product_options" SET "is_required" = ("min_select" > 0)`,
    );
    await queryRunner.query(
      `UPDATE "product_options" SET "allow_multiple" = ("max_select" > 1)`,
    );
    await queryRunner.query(`ALTER TABLE "product_options" DROP COLUMN "min_select"`);
    await queryRunner.query(`ALTER TABLE "product_options" DROP COLUMN "max_select"`);
  }
}
