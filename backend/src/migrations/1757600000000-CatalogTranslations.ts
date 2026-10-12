import { MigrationInterface, QueryRunner } from 'typeorm';

// 11/10/2026 — Traduções opcionais do catálogo. products.translations /
// promotions.translations: jsonb { en: { name, description }, es: {...} }.
// NULL = sem tradução cadastrada (o cardápio usa o glossário ou o texto original).
export class CatalogTranslations1757600000000 implements MigrationInterface {
  name = 'CatalogTranslations1757600000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "translations" jsonb`);
    await q.query(`ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "translations" jsonb`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "promotions" DROP COLUMN IF EXISTS "translations"`);
    await q.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "translations"`);
  }
}
