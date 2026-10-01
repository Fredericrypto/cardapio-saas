import { MigrationInterface, QueryRunner } from 'typeorm';

// 30/09/2026 — Decisão final do Felipe: sessão encerrada/saída é DEFINITIVA.
// Cada pessoa que entra numa mesa (logada OU convidada) passa a ter um
// "assento" com um token secreto que só o servidor reconhece. Quando a
// pessoa sai, o assento morre pra sempre — o servidor recusa qualquer
// pedido/fechamento/chamado feito com ele, não importa o que o navegador
// faça (refresh, voltar, limpar cache). Reentrada = novo assento = só por
// um novo escaneamento.
//
//  - table_session_participants.customer_id vira opcional (convidado tem
//    assento sem conta) e ganha seat_token único.
//  - orders.table_participant_id liga o pedido ao assento (regra "só sai
//    quem não tem pedido" precisa saber de quem é cada pedido, inclusive
//    de convidado).
//  - table_sessions.closed_reason marca sessões vazias encerradas porque
//    o último cliente saiu (não contam como "recém-encerrada").
export class TableSeatsAndExit1756800000000 implements MigrationInterface {
  name = 'TableSeatsAndExit1756800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "table_session_participants"
        ALTER COLUMN "customer_id" DROP NOT NULL,
        ADD COLUMN "seat_token" varchar(64)
    `);
    // Linhas que já existem ganham um token aleatório (256 bits) — nenhum
    // cliente antigo o conhece; o servidor o entrega na próxima leitura.
    await queryRunner.query(`
      UPDATE "table_session_participants"
         SET "seat_token" = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
    `);
    await queryRunner.query(`
      ALTER TABLE "table_session_participants" ALTER COLUMN "seat_token" SET NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_tsp_seat_token" ON "table_session_participants" ("seat_token")
    `);

    await queryRunner.query(`
      ALTER TABLE "orders" ADD COLUMN "table_participant_id" uuid NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "orders"
        ADD CONSTRAINT "FK_orders_table_participant"
        FOREIGN KEY ("table_participant_id") REFERENCES "table_session_participants"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_orders_table_participant" ON "orders" ("table_participant_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "table_sessions" ADD COLUMN "closed_reason" varchar(30) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "table_sessions" DROP COLUMN "closed_reason"`);
    await queryRunner.query(`DROP INDEX "IDX_orders_table_participant"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "FK_orders_table_participant"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "table_participant_id"`);
    await queryRunner.query(`DROP INDEX "UQ_tsp_seat_token"`);
    await queryRunner.query(`ALTER TABLE "table_session_participants" DROP COLUMN "seat_token"`);
    // customer_id NOT NULL não é restaurado: já podem existir assentos de convidado.
  }
}
