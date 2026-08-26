import { MigrationInterface, QueryRunner } from 'typeorm';

// Integração real com Mercado Pago (Pix confirmado automaticamente,
// substituindo o QR estático com confirmação manual quando configurado).
export class AddMercadoPagoFields1753400000000 implements MigrationInterface {
  name = 'AddMercadoPagoFields1753400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenants" ADD COLUMN "mercado_pago_access_token_encrypted" TEXT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenants" ADD COLUMN "mercado_pago_webhook_secret_encrypted" TEXT NULL`,
    );
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN "mp_payment_id" VARCHAR(60) NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "mp_payment_id"`);
    await queryRunner.query(
      `ALTER TABLE "tenants" DROP COLUMN "mercado_pago_webhook_secret_encrypted"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenants" DROP COLUMN "mercado_pago_access_token_encrypted"`,
    );
  }
}
