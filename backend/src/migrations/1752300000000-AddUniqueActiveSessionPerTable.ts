import { MigrationInterface, QueryRunner } from 'typeorm';

// Corrige uma race condition real: se duas requisições de scan do QR code
// chegarem quase simultaneamente pra mesma mesa (StrictMode disparando o
// efeito 2x em dev, ou duas pessoas escaneando ao mesmo tempo em produção),
// as duas podem passar pelo SELECT de "sessão existente" antes de qualquer
// INSERT terminar, e cada uma cria a sua própria sessão "aberta" pra mesma
// mesa — gerando duas contas em paralelo (bug visto no painel: "Mesa 1" e
// "Mesa 1" ao mesmo tempo).
//
// Esse índice único parcial garante, a nível de banco, que só pode existir
// UMA sessão não-fechada por mesa. Quando duas requisições concorrerem, o
// banco deixa uma passar e rejeita a outra com unique violation (23505) —
// tratado em TablesService.openOrJoinSession, que aí busca e retorna a
// sessão que venceu, em vez de estourar erro.
export class AddUniqueActiveSessionPerTable1752300000000 implements MigrationInterface {
  name = 'AddUniqueActiveSessionPerTable1752300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Passo 1 — resolve duplicatas que já existem no banco (esse bug já
    // rodou em produção/dev antes dessa correção, então pode haver mais de
    // uma sessão "aberta"/"fechamento_solicitado" pra mesma mesa agora).
    // Pra cada mesa com duplicatas: escolhe como "vencedora" a sessão com
    // mais pedidos vinculados (desempate: a mais antiga); migra os pedidos
    // das outras pra ela; e fecha as demais (status = 'fechada') pra não
    // aparecerem mais como conta ativa em duplicidade.
    const duplicateGroups: { table_id: string }[] = await queryRunner.query(`
      SELECT table_id
      FROM table_sessions
      WHERE status <> 'fechada' AND deleted_at IS NULL
      GROUP BY table_id
      HAVING COUNT(*) > 1
    `);

    for (const { table_id } of duplicateGroups) {
      const sessions: { id: string }[] = await queryRunner.query(
        `
        SELECT ts.id
        FROM table_sessions ts
        WHERE ts.table_id = $1 AND ts.status <> 'fechada' AND ts.deleted_at IS NULL
        ORDER BY (
          SELECT COUNT(*) FROM orders o WHERE o.table_session_id = ts.id
        ) DESC, ts.opened_at ASC
        `,
        [table_id],
      );

      const [keeper, ...losers] = sessions;
      if (!keeper || losers.length === 0) continue;

      for (const loser of losers) {
        await queryRunner.query(
          `UPDATE orders SET table_session_id = $1 WHERE table_session_id = $2`,
          [keeper.id, loser.id],
        );
        await queryRunner.query(
          `UPDATE table_sessions SET status = 'fechada', closed_at = now() WHERE id = $1`,
          [loser.id],
        );
      }
    }

    // Passo 2 — agora que não há mais duplicatas, o índice pode ser criado
    // com segurança e passa a impedir novas duplicatas por concorrência.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_table_sessions_one_active_per_table"
      ON "table_sessions" ("table_id")
      WHERE "status" <> 'fechada' AND "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_table_sessions_one_active_per_table"`);
  }
}
