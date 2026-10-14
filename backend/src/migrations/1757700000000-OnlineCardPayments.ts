import { MigrationInterface, QueryRunner } from 'typeorm';

// 13/10/2026 — Pagamento online por cartão (Mercado Pago) + chave pública.
//  - tenants.mercado_pago_public_key: chave PÚBLICA do MP do restaurante (usada
//    pelo SDK no navegador para tokenizar o cartão). NULL = cartão online desligado.
//  - orders.card_payment_attempts: contador de tentativas de cartão por pedido
//    (limite contra "card testing"). Pedidos antigos ficam com 0.
// Aditiva e reversível. Nenhum dado existente é alterado.
export class OnlineCardPayments1757700000000 implements MigrationInterface {
  name = 'OnlineCardPayments1757700000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "mercado_pago_public_key" varchar(255) NULL`);
    await q.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "card_payment_attempts" smallint NOT NULL DEFAULT 0`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "card_payment_attempts"`);
    await q.query(`ALTER TABLE "tenants" DROP COLUMN IF EXISTS "mercado_pago_public_key"`);
  }
}
