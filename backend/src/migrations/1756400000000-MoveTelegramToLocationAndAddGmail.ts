import { MigrationInterface, QueryRunner } from 'typeorm';

// Pedido do Felipe (19/09): Telegram passa de nível de TENANT (marca)
// pra nível de LOCATION (loja) — mesmo raciocínio do WhatsApp, cada
// filial física tem seu próprio contato. Também adiciona telefone de
// contato "puro" por loja e o e-mail (Gmail) da marca, que ele esqueceu
// de pedir antes. Não migra nenhum dado existente do `telegram_username`
// do tenant pra location nenhuma — não há como saber com segurança qual
// filial deveria herdar o valor quando existe mais de uma loja, e neste
// estágio (pré-lançamento) esse campo nunca foi preenchido de verdade.
export class MoveTelegramToLocationAndAddGmail1756400000000
  implements MigrationInterface
{
  name = 'MoveTelegramToLocationAndAddGmail1756400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN IF EXISTS "telegram_username"`);
    await queryRunner.query(`ALTER TABLE "tenants" ADD COLUMN "gmail_address" VARCHAR(200) NULL`);
    await queryRunner.query(`
      ALTER TABLE "locations"
        ADD COLUMN "telegram_username" VARCHAR(100) NULL,
        ADD COLUMN "contact_phone_number" VARCHAR(20) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "locations"
        DROP COLUMN "telegram_username",
        DROP COLUMN "contact_phone_number"
    `);
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN "gmail_address"`);
    await queryRunner.query(`ALTER TABLE "tenants" ADD COLUMN "telegram_username" VARCHAR(100) NULL`);
  }
}
