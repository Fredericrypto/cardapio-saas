import { MigrationInterface, QueryRunner } from 'typeorm';

// "Carteira Pix" do cliente (Meus dados > Carteira Pix) — só a chave de
// destino pra reembolsos, sem saldo/dinheiro passando pela nossa infra.
export class AddCustomerPixKey1753300000000 implements MigrationInterface {
  name = 'AddCustomerPixKey1753300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "customers" ADD COLUMN "pix_key_type" VARCHAR(20) NULL`,
    );
    await queryRunner.query(`ALTER TABLE "customers" ADD COLUMN "pix_key" VARCHAR(150) NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "pix_key"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "pix_key_type"`);
  }
}
