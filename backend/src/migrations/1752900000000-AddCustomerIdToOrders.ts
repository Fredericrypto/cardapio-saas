import { MigrationInterface, QueryRunner } from 'typeorm';

// Nullable de propósito: pedido de convidado (sem login) continua
// funcionando normal com customer_id null. Só é preenchido quando o
// pedido foi criado com um token de cliente válido no header.
export class AddCustomerIdToOrders1752900000000 implements MigrationInterface {
  name = 'AddCustomerIdToOrders1752900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "customer_id" uuid NULL REFERENCES "customers"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_orders_customer_id" ON "orders" ("customer_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_orders_customer_id"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "customer_id"`);
  }
}
