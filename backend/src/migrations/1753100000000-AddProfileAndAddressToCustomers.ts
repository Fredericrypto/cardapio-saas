import { MigrationInterface, QueryRunner } from 'typeorm';

// Perfil completo do cliente: gênero, avatar, e endereço salvo já
// verificado por geocodificação (mesma API usada pro estabelecimento) —
// pra pedidos de entrega preencherem automaticamente, igual iFood.
export class AddProfileAndAddressToCustomers1753100000000 implements MigrationInterface {
  name = 'AddProfileAndAddressToCustomers1753100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customers"
        ADD COLUMN "gender" varchar(20) NULL,
        ADD COLUMN "avatar_url" text NULL,
        ADD COLUMN "address_street" varchar(200) NULL,
        ADD COLUMN "address_number" varchar(20) NULL,
        ADD COLUMN "address_neighborhood" varchar(120) NULL,
        ADD COLUMN "address_city" varchar(120) NULL,
        ADD COLUMN "address_state" varchar(2) NULL,
        ADD COLUMN "address_postcode" varchar(12) NULL,
        ADD COLUMN "address_reference_point" varchar(200) NULL,
        ADD COLUMN "address_formatted" text NULL,
        ADD COLUMN "address_latitude" numeric(10,7) NULL,
        ADD COLUMN "address_longitude" numeric(10,7) NULL,
        ADD COLUMN "address_precise" boolean NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customers"
        DROP COLUMN "gender",
        DROP COLUMN "avatar_url",
        DROP COLUMN "address_street",
        DROP COLUMN "address_number",
        DROP COLUMN "address_neighborhood",
        DROP COLUMN "address_city",
        DROP COLUMN "address_state",
        DROP COLUMN "address_postcode",
        DROP COLUMN "address_reference_point",
        DROP COLUMN "address_formatted",
        DROP COLUMN "address_latitude",
        DROP COLUMN "address_longitude",
        DROP COLUMN "address_precise"
    `);
  }
}
