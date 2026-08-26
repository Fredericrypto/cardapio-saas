import { MigrationInterface, QueryRunner } from 'typeorm';

// Simplificação do modelo de Avaliações, decisão de produto:
//  - Review vira IMUTÁVEL depois de publicada (nem cliente edita, nem
//    estabelecimento). Por isso sai todo o aparato de moderação
//    ("ocultar com motivo") — nunca mais vai ser usado.
//  - Apagar (só o dono pode) vira soft-delete (`deleted_at`), igual
//    Order/TableSession — o `orderId` continua "gasto" pra sempre,
//    mesmo depois de apagada, fechando a brecha de "apago e refaço até
//    dar a nota que eu quero".
//  - `is_anonymous`: cliente pode publicar escondendo nome/avatar do
//    público (admin sempre vê quem foi, só o público que não).
export class SimplifyReviews1755200000000 implements MigrationInterface {
  name = 'SimplifyReviews1755200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "reviews"
        DROP CONSTRAINT IF EXISTS "CHK_reviews_status",
        DROP COLUMN IF EXISTS "status",
        DROP COLUMN IF EXISTS "hidden_reason",
        DROP COLUMN IF EXISTS "hidden_by_staff_user_id",
        DROP COLUMN IF EXISTS "hidden_by_staff_name",
        DROP COLUMN IF EXISTS "hidden_at",
        ADD COLUMN IF NOT EXISTS "is_anonymous" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz NULL,
        DROP COLUMN IF EXISTS "updated_at"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "reviews"
        DROP COLUMN IF EXISTS "deleted_at",
        DROP COLUMN IF EXISTS "is_anonymous",
        ADD COLUMN IF NOT EXISTS "status" varchar(10) NOT NULL DEFAULT 'published',
        ADD COLUMN IF NOT EXISTS "hidden_reason" varchar(300) NULL,
        ADD COLUMN IF NOT EXISTS "hidden_by_staff_user_id" uuid NULL,
        ADD COLUMN IF NOT EXISTS "hidden_by_staff_name" varchar(150) NULL,
        ADD COLUMN IF NOT EXISTS "hidden_at" timestamptz NULL,
        ADD COLUMN IF NOT EXISTS "updated_at" timestamptz NOT NULL DEFAULT now(),
        ADD CONSTRAINT "CHK_reviews_status" CHECK ("status" IN ('published', 'hidden'))
    `);
  }
}
