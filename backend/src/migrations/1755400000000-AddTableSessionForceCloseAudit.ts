import { MigrationInterface, QueryRunner } from 'typeorm';

// Auditoria do escape-hatch administrativo de fechamento de mesa sem
// pagamento — motivo obrigatório + quem fez + snapshot do e-mail (não
// depende da conta do funcionário continuar existindo depois). Ficam
// NULL em toda sessão fechada normalmente (com pagamento) — já servem
// de filtro pra auditoria sozinhos.
export class AddTableSessionForceCloseAudit1755400000000 implements MigrationInterface {
  name = 'AddTableSessionForceCloseAudit1755400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "table_sessions"
      ADD COLUMN IF NOT EXISTS "force_closed_reason" text NULL,
      ADD COLUMN IF NOT EXISTS "force_closed_by_user_id" uuid NULL,
      ADD COLUMN IF NOT EXISTS "force_closed_by_email" varchar(255) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "table_sessions"
      DROP COLUMN IF EXISTS "force_closed_reason",
      DROP COLUMN IF EXISTS "force_closed_by_user_id",
      DROP COLUMN IF EXISTS "force_closed_by_email"
    `);
  }
}
