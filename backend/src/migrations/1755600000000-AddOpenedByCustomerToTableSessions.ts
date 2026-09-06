import { MigrationInterface, QueryRunner } from 'typeorm';

// Guarda qual cliente LOGADO abriu cada sessão de mesa (nulo pra
// convidado sem conta — nunca dá pra saber quem é sem login). Existe só
// pra uma coisa: quando esse mesmo cliente abre uma mesa NOVA, dá pra
// fechar sozinho a mesa vazia (sem nenhum pedido) que ele tinha deixado
// aberta antes em outra mesa, sem arriscar fechar a mesa de outra
// pessoa — nunca usado pra nada além disso.
export class AddOpenedByCustomerToTableSessions1755600000000
  implements MigrationInterface
{
  name = 'AddOpenedByCustomerToTableSessions1755600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "table_sessions"
      ADD COLUMN IF NOT EXISTS "opened_by_customer_id" uuid NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "table_sessions"
      DROP COLUMN IF EXISTS "opened_by_customer_id"
    `);
  }
}
