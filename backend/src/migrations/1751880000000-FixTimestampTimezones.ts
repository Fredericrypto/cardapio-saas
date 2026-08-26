import { MigrationInterface, QueryRunner } from 'typeorm';

// BUG CORRIGIDO: todas as colunas de data/hora foram criadas como
// "timestamp" (sem timezone). O Postgres grava o valor sem saber que é
// UTC, e o navegador exibia a hora local errada (deslocada pelo fuso).
// "timestamptz" resolve isso de vez: o Postgres passa a gravar o instante
// exato (UTC internamente), e o navegador converte certo pro fuso do
// usuário automaticamente.
export class FixTimestampTimezones1751880000000 implements MigrationInterface {
  name = 'FixTimestampTimezones1751880000000';

  private readonly columns: Array<[string, string]> = [
    ['tenants', 'created_at'],
    ['tenants', 'updated_at'],
    ['tenants', 'deleted_at'],
    ['admin_users', 'created_at'],
    ['admin_users', 'updated_at'],
    ['admin_users', 'deleted_at'],
    ['categories', 'created_at'],
    ['categories', 'updated_at'],
    ['categories', 'deleted_at'],
    ['products', 'created_at'],
    ['products', 'updated_at'],
    ['products', 'deleted_at'],
    ['orders', 'created_at'],
    ['orders', 'updated_at'],
    ['restaurant_tables', 'created_at'],
    ['restaurant_tables', 'deleted_at'],
    ['table_sessions', 'opened_at'],
    ['table_sessions', 'closed_at'],
    ['waiter_calls', 'created_at'],
    ['waiter_calls', 'attended_at'],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [table, column] of this.columns) {
      // "AT TIME ZONE 'UTC'" reinterpreta o valor existente como UTC
      // (que é como o Postgres/Supabase já gravava por padrão), agora
      // com o tipo certo pra não haver mais ambiguidade de fuso.
      await queryRunner.query(`
        ALTER TABLE "${table}"
        ALTER COLUMN "${column}" TYPE timestamptz
        USING "${column}" AT TIME ZONE 'UTC'
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [table, column] of this.columns) {
      await queryRunner.query(`
        ALTER TABLE "${table}"
        ALTER COLUMN "${column}" TYPE timestamp
        USING "${column}" AT TIME ZONE 'UTC'
      `);
    }
  }
}
