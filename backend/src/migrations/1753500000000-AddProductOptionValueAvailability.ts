import { MigrationInterface, QueryRunner } from 'typeorm';

// "Disponível/indisponível" por adicional — evita ter que apagar e
// recriar a opção toda vez que algo acabar (ex: bacon em falta hoje).
export class AddProductOptionValueAvailability1753500000000
  implements MigrationInterface
{
  name = 'AddProductOptionValueAvailability1753500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product_option_values" ADD COLUMN "is_available" BOOLEAN NOT NULL DEFAULT true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product_option_values" DROP COLUMN "is_available"`,
    );
  }
}
