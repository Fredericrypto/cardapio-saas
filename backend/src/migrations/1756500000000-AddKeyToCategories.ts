import { MigrationInterface, QueryRunner } from 'typeorm';

// Categorias passam a vir de um catálogo fixo (pedido do Felipe, 28/09).
// Adiciona `key` e faz o backfill das categorias que já existem casando
// o nome (sem acento/maiúscula) com o catálogo — "Lanches", "Bebidas"
// etc. já criadas à mão viram categorias do catálogo sem perder produtos.
// Nomes fora do catálogo ficam com key NULL (legadas, continuam
// funcionando). Se duas do mesmo tenant casarem com a mesma chave, só a
// primeira recebe a chave (índice único parcial).
const NAME_TO_KEY: Record<string, string> = {
  lanches: 'lanches',
  bebidas: 'bebidas',
  sobremesas: 'sobremesas',
  entradas: 'entradas',
  'petiscos / aperitivos': 'petiscos',
  petiscos: 'petiscos',
  aperitivos: 'petiscos',
  saladas: 'saladas',
  sorvetes: 'sorvetes',
  vinhos: 'vinhos',
  'sopas e caldos': 'sopas-caldos',
  'pratos principais': 'pratos-principais',
  'carnes e grelhados': 'carnes-grelhados',
  'peixes e frutos do mar': 'peixes-frutos-do-mar',
  'massas e risotos': 'massas-risotos',
  'pratos executivos': 'pratos-executivos',
  'acompanhamentos / guarnicoes': 'acompanhamentos',
  acompanhamentos: 'acompanhamentos',
  'menu vegetariano / vegano': 'menu-vegetariano',
  'menu infantil / kids': 'menu-infantil',
  'menu degustacao': 'menu-degustacao',
  combinados: 'combinados',
  'pratos para compartilhar': 'pratos-compartilhar',
};

function normalize(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

export class AddKeyToCategories1756500000000 implements MigrationInterface {
  name = 'AddKeyToCategories1756500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "categories" ADD COLUMN "key" VARCHAR(40) NULL`);

    const rows: { id: string; tenant_id: string; name: string }[] = await queryRunner.query(
      `SELECT "id", "tenant_id", "name" FROM "categories" WHERE "deleted_at" IS NULL ORDER BY "display_order" ASC, "created_at" ASC`,
    );
    const taken = new Set<string>();
    for (const row of rows) {
      const key = NAME_TO_KEY[normalize(row.name)];
      if (!key) continue;
      const slot = `${row.tenant_id}:${key}`;
      if (taken.has(slot)) continue;
      taken.add(slot);
      await queryRunner.query(`UPDATE "categories" SET "key" = $1 WHERE "id" = $2`, [key, row.id]);
    }

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_categories_tenant_key"
        ON "categories" ("tenant_id", "key")
        WHERE "key" IS NOT NULL AND "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_categories_tenant_key"`);
    await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN "key"`);
  }
}
