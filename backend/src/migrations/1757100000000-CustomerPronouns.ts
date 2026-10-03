import { MigrationInterface, QueryRunner } from 'typeorm';

// 03/10/2026 — Pronomes pessoais do cliente ("ela/dela", "ele/dele"…),
// escolhidos em "Meus dados". Coluna opcional; sem pronome = nada aparece.
export class CustomerPronouns1757100000000 implements MigrationInterface {
  name = 'CustomerPronouns1757100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "pronouns" varchar(20) NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN IF EXISTS "pronouns"`);
  }
}
