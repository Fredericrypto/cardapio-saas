import { MigrationInterface, QueryRunner } from 'typeorm';

// 10/10/2026 — Ordem persistida das anotações (fixar / arrastar estilo Trello).
// notes.sort_order: menor = primeiro, dentro do grupo fixadas / soltas. As notas
// existentes recebem a numeração da ordem que já aparecia na tela (fixadas
// primeiro, depois as mais recentes), então nada muda de lugar no deploy.
export class NotesSortOrder1757500000000 implements MigrationInterface {
  name = 'NotesSortOrder1757500000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "sort_order" integer NOT NULL DEFAULT 0`);
    await q.query(`
      UPDATE "notes" n
         SET "sort_order" = x.rn
        FROM (
          SELECT id,
                 ROW_NUMBER() OVER (
                   PARTITION BY tenant_id, is_pinned
                   ORDER BY created_at DESC, id ASC
                 ) - 1 AS rn
            FROM "notes"
        ) x
       WHERE n.id = x.id
    `);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_notes_tenant_order" ON "notes" ("tenant_id", "is_pinned", "sort_order")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "IDX_notes_tenant_order"`);
    await q.query(`ALTER TABLE "notes" DROP COLUMN IF EXISTS "sort_order"`);
  }
}
