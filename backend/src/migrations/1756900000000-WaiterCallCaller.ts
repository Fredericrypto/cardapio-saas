import { MigrationInterface, QueryRunner } from 'typeorm';

// 01/10/2026 — O painel do admin precisa mostrar QUEM chamou o garçom
// (inclusive visitante sem conta). O chamado guarda o assento de quem
// chamou e uma foto do nome naquele momento.
export class WaiterCallCaller1756900000000 implements MigrationInterface {
  name = 'WaiterCallCaller1756900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "waiter_calls"
        ADD COLUMN "table_participant_id" uuid NULL,
        ADD COLUMN "called_by_name" varchar(60) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "waiter_calls"
        ADD CONSTRAINT "FK_waiter_calls_participant"
        FOREIGN KEY ("table_participant_id") REFERENCES "table_session_participants"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "waiter_calls" DROP CONSTRAINT "FK_waiter_calls_participant"`);
    await queryRunner.query(`
      ALTER TABLE "waiter_calls" DROP COLUMN "called_by_name", DROP COLUMN "table_participant_id"
    `);
  }
}
