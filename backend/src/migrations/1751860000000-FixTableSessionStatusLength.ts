import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixTableSessionStatusLength1751860000000
  implements MigrationInterface
{
  name = 'FixTableSessionStatusLength1751860000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 'fechamento_solicitado' tem 21 caracteres — não cabia no varchar(20)
    // original, causando erro 500 ao solicitar fechamento de mesa.
    await queryRunner.query(`
      ALTER TABLE "table_sessions" ALTER COLUMN "status" TYPE varchar(30)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "table_sessions" ALTER COLUMN "status" TYPE varchar(20)
    `);
  }
}
