import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPixKeyToTenants1751890000000 implements MigrationInterface {
  name = 'AddPixKeyToTenants1751890000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenants"
        ADD COLUMN "pix_key_type" varchar(20),
        ADD COLUMN "pix_key" varchar(150)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenants"
        DROP COLUMN "pix_key_type",
        DROP COLUMN "pix_key"
    `);
  }
}
