import { MigrationInterface, QueryRunner } from 'typeorm';

// Dois reforços de segurança no Cashback, depois de auditoria:
//
// 1. `orders.cashback_locked` — trava contra "recebeu o produto e
//    cancelou depois": vira `true` no EXATO momento em que o cashback
//    daquele pedido se torna definitivo (pagamento confirmado, ou —
//    pra mesa — sessão fechada), nos mesmos 4 pontos que já creditam
//    cashback. A partir daí, cancelar o pedido NUNCA mais reverte
//    saldo (nem o usado, nem o ganho) — ver OrdersService.
//    markCancelled. Antes disso (pedido esperando pagamento, cozinha
//    ainda preparando), cancelar continua revertendo normalmente, como
//    sempre foi.
//
// 2. `cashback_settings.max_cashback_per_customer_per_day` — teto de
//    quanto UM cliente pode ganhar de cashback em 24h, somando todos os
//    pedidos dele. Sem isso, só existia teto POR PEDIDO
//    (max_cashback_per_order); nada impedia acumular fazendo vários
//    pedidos pequenos seguidos. null = sem teto diário (comportamento
//    de antes, preservado por padrão).
export class AddCashbackFraudGuards1755000000000 implements MigrationInterface {
  name = 'AddCashbackFraudGuards1755000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "orders"
        ADD COLUMN IF NOT EXISTS "cashback_locked" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "cashback_settings"
        ADD COLUMN IF NOT EXISTS "max_cashback_per_customer_per_day" numeric(10,2) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cashback_settings" DROP COLUMN IF EXISTS "max_cashback_per_customer_per_day"`,
    );
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "cashback_locked"`);
  }
}
