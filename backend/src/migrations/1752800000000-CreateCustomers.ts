import { MigrationInterface, QueryRunner } from 'typeorm';

// Tabela TOTALMENTE separada de `admin_users` — sem FK, sem coluna
// compartilhada, sem relação nenhuma. Ver customer.entity.ts pro porquê.
export class CreateCustomers1752800000000 implements MigrationInterface {
  name = 'CreateCustomers1752800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "customers" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" varchar(150) NOT NULL UNIQUE,
        "password_hash" varchar(255) NOT NULL,
        "name" varchar(150) NOT NULL,
        "phone" varchar(20) NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz NULL
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "customers"`);
  }
}
