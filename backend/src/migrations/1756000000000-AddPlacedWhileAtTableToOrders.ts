import { MigrationInterface, QueryRunner } from 'typeorm';

// Pedido do Felipe: cliente que escaneou uma mesa (logado) mas escolheu
// "Entrega" no carrinho — guarda o número da mesa em que ele estava no
// momento do pedido, só pra sinalizar isso pro admin no painel. Snapshot
// de texto (não FK), igual customerName/tableNumber já fazem nessa
// tabela — a sessão de mesa pode fechar/expirar depois, o aviso deve
// continuar fazendo sentido mesmo assim.
export class AddPlacedWhileAtTableToOrders1756000000000 implements MigrationInterface {
  name = 'AddPlacedWhileAtTableToOrders1756000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "placed_while_at_table" VARCHAR(20)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "placed_while_at_table"`);
  }
}
