import { MigrationInterface, QueryRunner } from 'typeorm';

// 03/10/2026 — Novas cores padrão do app/restaurante: principal #3d3846 e
// secundária #c0bfbc. Muda só o DEFAULT da coluna (valem para restaurantes
// novos) — restaurantes que já existem mantêm as cores que têm hoje.
export class DefaultBrandColors1757100000001 implements MigrationInterface {
  name = 'DefaultBrandColors1757100000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tenants" ALTER COLUMN "primary_color" SET DEFAULT '#3d3846'`);
    await queryRunner.query(`ALTER TABLE "tenants" ALTER COLUMN "secondary_color" SET DEFAULT '#c0bfbc'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tenants" ALTER COLUMN "primary_color" SET DEFAULT '#E63946'`);
    await queryRunner.query(`ALTER TABLE "tenants" ALTER COLUMN "secondary_color" SET DEFAULT '#1D3557'`);
  }
}
