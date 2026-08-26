import { MigrationInterface, QueryRunner } from 'typeorm';

// Suporte ao checkout com Pix real (QR gerado na hora, valor já
// preenchido) pra balcão/entrega — ver PaymentsService. Mesa continua
// sem mudança (paga ao fechar a conta, fluxo já existente do admin).
export class AddPixCheckoutFields1753200000000 implements MigrationInterface {
  name = 'AddPixCheckoutFields1753200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenants" ADD COLUMN "pix_merchant_city" VARCHAR(15) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenants" ADD COLUMN "pix_enabled" BOOLEAN NOT NULL DEFAULT false`,
    );
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN "pix_payload" TEXT NULL`);
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "pix_expires_at" TIMESTAMPTZ NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "pix_expires_at"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "pix_payload"`);
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN "pix_enabled"`);
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN "pix_merchant_city"`);
  }
}
