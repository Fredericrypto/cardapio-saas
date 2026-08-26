import { MigrationInterface, QueryRunner } from 'typeorm';

// Decisão de produto: cliente passa a ser POR RESTAURANTE, não mais
// global na plataforma — cada restaurante é uma ilha isolada, sem
// "central tipo iFood" cruzando dados entre eles. Contas de teste
// criadas antes dessa mudança não têm como saber a qual restaurante
// pertencem, então são removidas aqui (é só dado de teste nessa fase).
export class ScopeCustomersToTenant1753000000000 implements MigrationInterface {
  name = 'ScopeCustomersToTenant1753000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "customers"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP CONSTRAINT IF EXISTS "customers_email_key"`);
    await queryRunner.query(
      `ALTER TABLE "customers" ADD COLUMN "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_customers_tenant_email" ON "customers" ("tenant_id", "email")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_customers_tenant_email"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "tenant_id"`);
    await queryRunner.query(`ALTER TABLE "customers" ADD CONSTRAINT "customers_email_key" UNIQUE ("email")`);
  }
}
