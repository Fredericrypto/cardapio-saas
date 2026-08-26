import { MigrationInterface, QueryRunner } from 'typeorm';

// Suporte à taxa de entrega calculada por distância real (LocationIQ
// Geocoding). O tenant ganha coordenadas fixas (definidas uma vez em
// Configurações, sempre em conjunto com o endereço textual pra nunca ficar
// dessincronizado) e dois novos parâmetros de tarifação: taxa por km e
// raio máximo de entrega. `delivery_fee` passa a significar "taxa base"
// (mesma coluna, reaproveitada — era um valor fixo, agora é o piso da
// fórmula: base + km * taxa_por_km).
//
// O pedido passa a guardar o endereço de entrega, o ponto de referência
// informado pelo cliente, e a distância calculada no momento da compra —
// pra auditoria e pra exibir pro entregador, sem depender de recalcular
// depois.
export class AddDeliveryLocationFields1752500000000 implements MigrationInterface {
  name = 'AddDeliveryLocationFields1752500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenants" ADD COLUMN "latitude" NUMERIC(10, 7) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenants" ADD COLUMN "longitude" NUMERIC(10, 7) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenants" ADD COLUMN "delivery_fee_per_km" NUMERIC(10, 2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenants" ADD COLUMN "delivery_max_radius_km" NUMERIC(10, 2) NULL`,
    );

    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN "delivery_address" TEXT NULL`);
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "delivery_reference_point" TEXT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "delivery_distance_km" NUMERIC(10, 2) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "delivery_address_precise" BOOLEAN NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "delivery_address_precise"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "delivery_distance_km"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "delivery_reference_point"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "delivery_address"`);

    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN "delivery_max_radius_km"`);
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN "delivery_fee_per_km"`);
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN "longitude"`);
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN "latitude"`);
  }
}
