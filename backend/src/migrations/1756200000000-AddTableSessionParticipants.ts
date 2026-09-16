import { MigrationInterface, QueryRunner } from 'typeorm';

// Pedido do Felipe (14/09, sessão I): rastrear quem está presente numa
// mesa desde o momento em que confirma entrar (scan + "sim, continuar"),
// não só a partir do primeiro pedido. Ver TableSessionParticipant.
export class AddTableSessionParticipants1756200000000 implements MigrationInterface {
  name = 'AddTableSessionParticipants1756200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "table_session_participants" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "table_session_id" uuid NOT NULL REFERENCES "table_sessions"("id") ON DELETE CASCADE,
        "customer_id" uuid NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE,
        "joined_at" timestamptz NOT NULL DEFAULT now(),
        "left_at" timestamptz NULL,
        CONSTRAINT "UQ_table_session_participant" UNIQUE ("table_session_id", "customer_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_tsp_session" ON "table_session_participants" ("table_session_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tsp_customer" ON "table_session_participants" ("customer_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "table_session_participants"`);
  }
}
