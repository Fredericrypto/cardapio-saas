import { MigrationInterface, QueryRunner } from 'typeorm';

// Modo Vitrine: preferências do restaurante (só referências às imagens) em uma
// coluna jsonb nullable de `tenants`. null = padrão. Sem tabela nova.
// down: remove a coluna (a vitrine volta ao padrão; nada mais depende dela).
export class TenantVitrineSettings1760300000000 implements MigrationInterface {
  name = 'TenantVitrineSettings1760300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "vitrine_settings" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN IF EXISTS "vitrine_settings"`);
  }
}
