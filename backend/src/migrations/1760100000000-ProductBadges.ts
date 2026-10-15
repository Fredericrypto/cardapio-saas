import { MigrationInterface, QueryRunner } from 'typeorm';

// 15/10/2026 — Selos (badges) DECLARATIVOS do produto.
//  - products.badges text[] NOT NULL DEFAULT '{}': lista de CÓDIGOS estáveis
//    (ex.: 'vegan', 'house_recipe'), validada pela aplicação contra o catálogo
//    (modules/products/badges/product-badges.types.ts). Código novo no catálogo
//    NÃO exige migration. O DEFAULT é de propósito: o módulo de backup recusa
//    restaurar arquivos antigos se uma coluna nova for NOT NULL sem padrão.
//  - CHECK cardinality(badges) <= 12: teto no BANCO (o catálogo tem 12 códigos).
//  - Selos automáticos (mais pedido, favorito, tendência) NÃO são gravados:
//    são calculados na leitura a partir de pedidos e avaliações.
// Reversível: o down remove só a coluna.
export class ProductBadges1760100000000 implements MigrationInterface {
  name = 'ProductBadges1760100000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "badges" text[] NOT NULL DEFAULT '{}'`);
    await q.query(`ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "CHK_products_badges_max_12"`);
    await q.query(`ALTER TABLE "products" ADD CONSTRAINT "CHK_products_badges_max_12" CHECK (cardinality("badges") <= 12)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "CHK_products_badges_max_12"`);
    await q.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "badges"`);
  }
}
