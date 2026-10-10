import { MigrationInterface, QueryRunner } from 'typeorm';

// 09/10/2026 — Idioma do cliente (i18n do app do cliente e das notificações).
// customers.language: 'pt-BR' (padrão) | 'en' | 'es'. Toda conta existente
// continua em português; a CHECK impede valor fora da lista mesmo por SQL direto.
export class CustomerLanguage1757400000000 implements MigrationInterface {
  name = 'CustomerLanguage1757400000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "language" varchar(8) NOT NULL DEFAULT 'pt-BR'`);
    await q.query(`ALTER TABLE "customers" DROP CONSTRAINT IF EXISTS "chk_customers_language"`);
    await q.query(
      `ALTER TABLE "customers" ADD CONSTRAINT "chk_customers_language" CHECK ("language" IN ('pt-BR', 'en', 'es'))`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "customers" DROP CONSTRAINT IF EXISTS "chk_customers_language"`);
    await q.query(`ALTER TABLE "customers" DROP COLUMN IF EXISTS "language"`);
  }
}
