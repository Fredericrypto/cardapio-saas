import { MigrationInterface, QueryRunner } from 'typeorm';

// Handle do Instagram do estabelecimento (só o usuário, sem @ nem URL —
// ex: "restaurante.teste"), exibido no header do cardápio do cliente como
// link clicável junto com o WhatsApp. Guardado solto, sem geocodificação
// nem validação de formato pesada — é só texto pra montar o link
// `instagram.com/<handle>`.
export class AddInstagramHandleToTenants1752600000000 implements MigrationInterface {
  name = 'AddInstagramHandleToTenants1752600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenants" ADD COLUMN "instagram_handle" VARCHAR(100) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN "instagram_handle"`);
  }
}
