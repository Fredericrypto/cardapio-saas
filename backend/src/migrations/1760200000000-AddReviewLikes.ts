import { MigrationInterface, QueryRunner } from 'typeorm';

// 17/10/2026 — Curtidas nas avaliações públicas.
//  - review_likes: uma linha por (avaliação, cliente). UNIQUE impede curtida duplicada
//    mesmo com toques simultâneos; a rota alterna (insere/apaga).
//  - tenant_id NOT NULL: exigido pelo plano de backup (tabela sem tenant_id é recusada).
//  - Tabela nova, sem alterar nenhuma existente. Reversível: o down só remove a tabela.
export class AddReviewLikes1760200000000 implements MigrationInterface {
  name = 'AddReviewLikes1760200000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "review_likes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "review_id" uuid NOT NULL,
        "customer_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_review_likes" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_review_likes_review_customer" UNIQUE ("review_id", "customer_id"),
        CONSTRAINT "FK_review_likes_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_review_likes_review" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_review_likes_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_review_likes_tenant" ON "review_likes" ("tenant_id")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_review_likes_review" ON "review_likes" ("review_id")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "review_likes"`);
  }
}
