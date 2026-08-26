import { MigrationInterface, QueryRunner } from 'typeorm';

// `tip_amount`: gorjeta escolhida pelo cliente no carrinho (só faz
// sentido pra pedidos avulsos — balcão/entrega — já que pedidos de mesa
// têm a gorjeta definida na sessão, ao "Fechar conta").
// `amount_received`: quanto o cliente pagou em dinheiro, registrado pelo
// admin ao concluir um pedido avulso — existe só pra calcular/exibir o
// troco depois no cupom, igual já acontecia com as sessões de mesa.
export class AddTipAndAmountReceivedToOrders1752700000000 implements MigrationInterface {
  name = 'AddTipAndAmountReceivedToOrders1752700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "tip_amount" numeric(10,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "amount_received" numeric(10,2) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "amount_received"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "tip_amount"`);
  }
}
