import { MigrationInterface, QueryRunner } from 'typeorm';

// Sistema de Avaliações (estilo Uber Eats/iFood/Google): review sempre
// amarrada a um pedido de verdade (`order_id` UNIQUE = a prova de
// compra), 1 por pedido. Duas tabelas:
//
//  1. `reviews` — nota (1-5) + comentário opcional do cliente. Cliente
//     edita/apaga a própria review a qualquer momento; estabelecimento
//     NUNCA edita/apaga, só pode ocultar por violação de política real
//     (motivo obrigatório, sempre auditado em `hidden_reason` +
//     `hidden_by_staff_name` + `hidden_at`).
//  2. `review_responses` — resposta pública do estabelecimento, no
//     máximo 1 por review (`review_id` UNIQUE), editável.
export class AddReviews1755100000000 implements MigrationInterface {
  name = 'AddReviews1755100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "reviews" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "customer_id" uuid NOT NULL,
        "order_id" uuid NOT NULL,
        "location_id" uuid NULL,
        "rating" smallint NOT NULL,
        "comment" varchar(1000) NULL,
        "status" varchar(10) NOT NULL DEFAULT 'published',
        "hidden_reason" varchar(300) NULL,
        "hidden_by_staff_user_id" uuid NULL,
        "hidden_by_staff_name" varchar(150) NULL,
        "hidden_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_reviews" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_reviews_order" UNIQUE ("order_id"),
        CONSTRAINT "FK_reviews_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_reviews_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_reviews_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_reviews_location" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_reviews_rating" CHECK ("rating" BETWEEN 1 AND 5),
        CONSTRAINT "CHK_reviews_status" CHECK ("status" IN ('published', 'hidden'))
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_reviews_tenant" ON "reviews" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_reviews_customer" ON "reviews" ("customer_id")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "review_responses" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "review_id" uuid NOT NULL,
        "response_text" varchar(1000) NOT NULL,
        "staff_user_id" uuid NOT NULL,
        "staff_name" varchar(150) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_review_responses" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_review_responses_review" UNIQUE ("review_id"),
        CONSTRAINT "FK_review_responses_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_review_responses_review" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_review_responses_tenant" ON "review_responses" ("tenant_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "review_responses"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reviews"`);
  }
}
