import { MigrationInterface, QueryRunner } from 'typeorm';

// 02/10/2026 — A ordem das categorias passa a ser SÓ a escolhida pelo dono
// (reordenar no painel). Até aqui, Lanches → Bebidas → Sobremesas eram
// forçadas nas 3 primeiras posições por código (`fixedRank`), por cima de
// `display_order`. Pra nenhuma loja existente mudar de ordem quando essa
// regra sai do código, "assa" a ordem atual em `display_order`: as três
// primeiro (nessa sequência), o resto na ordem que já tinham.
export class CategoryOrderNormalize1757000000000 implements MigrationInterface {
  name = 'CategoryOrderNormalize1757000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH ranked AS (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY tenant_id
                 ORDER BY CASE key WHEN 'lanches' THEN 1 WHEN 'bebidas' THEN 2 WHEN 'sobremesas' THEN 3 ELSE 99 END,
                          display_order, created_at, id
               ) AS new_order
          FROM categories
         WHERE deleted_at IS NULL
      )
      UPDATE categories c SET display_order = r.new_order FROM ranked r WHERE c.id = r.id
    `);
  }

  public async down(): Promise<void> {
    // Sem volta: a ordem anterior era derivada em tempo de leitura.
  }
}
