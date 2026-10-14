import { MigrationInterface, QueryRunner } from 'typeorm';

// 13/10/2026 — Várias fotos por item do cardápio (até 5).
//  - products.images text[] NOT NULL DEFAULT '{}': galeria ordenada. O DEFAULT
//    é de propósito: o módulo de backup recusa restaurar arquivos antigos se uma
//    coluna nova for NOT NULL sem padrão.
//  - Backfill: todo produto que já tinha foto passa a ter images = {image_url}
//    (inclusive os apagados com soft-delete). image_url NÃO é removida: segue como
//    a CAPA (images[0]) — promoção, avaliações, carrinho e og:image dependem dela.
//  - CHECK cardinality(images) <= 5: o limite vale no BANCO, mesmo contra
//    requisições concorrentes ou chamadas diretas.
// Reversível: o down remove só a galeria; a capa continua em image_url.
export class ProductImagesGallery1757400000000 implements MigrationInterface {
  name = 'ProductImagesGallery1757400000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "images" text[] NOT NULL DEFAULT '{}'`);
    await q.query(`
      UPDATE "products"
         SET "images" = ARRAY[btrim("image_url")]
       WHERE "image_url" IS NOT NULL
         AND btrim("image_url") <> ''
         AND cardinality("images") = 0
    `);
    await q.query(`ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "CHK_products_images_max_5"`);
    await q.query(`ALTER TABLE "products" ADD CONSTRAINT "CHK_products_images_max_5" CHECK (cardinality("images") <= 5)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "CHK_products_images_max_5"`);
    await q.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "images"`);
  }
}
