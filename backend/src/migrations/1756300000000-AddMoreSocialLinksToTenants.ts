import { MigrationInterface, QueryRunner } from 'typeorm';

// Pedido do Felipe (18/09): redes sociais além de WhatsApp/Instagram —
// YouTube, Facebook, TikTok, Twitter/X, Telegram, Messenger. Todas em
// nível de TENANT (marca), como o Instagram já era — só o WhatsApp fica
// por loja (número físico de cada filial).
export class AddMoreSocialLinksToTenants1756300000000 implements MigrationInterface {
  name = 'AddMoreSocialLinksToTenants1756300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenants"
        ADD COLUMN "youtube_url" VARCHAR(300) NULL,
        ADD COLUMN "facebook_url" VARCHAR(300) NULL,
        ADD COLUMN "tiktok_handle" VARCHAR(100) NULL,
        ADD COLUMN "twitter_handle" VARCHAR(100) NULL,
        ADD COLUMN "telegram_username" VARCHAR(100) NULL,
        ADD COLUMN "messenger_username" VARCHAR(100) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenants"
        DROP COLUMN "youtube_url",
        DROP COLUMN "facebook_url",
        DROP COLUMN "tiktok_handle",
        DROP COLUMN "twitter_handle",
        DROP COLUMN "telegram_username",
        DROP COLUMN "messenger_username"
    `);
  }
}
