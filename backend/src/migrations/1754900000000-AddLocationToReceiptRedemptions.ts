import { MigrationInterface, QueryRunner } from 'typeorm';

// Snapshot de ONDE cada resgate de cupom aconteceu (loja) — necessário
// pro histórico de Fidelidade no admin mostrar "quem, quando e ONDE",
// no mesmo molde do histórico de Promoções (ver PromotionsService.
// getRedemptions, que já mostra `location.name` via join). Antes disso,
// ReceiptRedemption só sabia sourceType/sourceId (pedido ou sessão),
// exigindo um join indireto que muda de formato dependendo do tipo —
// guardar direto aqui simplifica a consulta de histórico.
export class AddLocationToReceiptRedemptions1754900000000 implements MigrationInterface {
  name = 'AddLocationToReceiptRedemptions1754900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "receipt_redemptions"
        ADD COLUMN IF NOT EXISTS "location_id" uuid NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "receipt_redemptions"
        ADD CONSTRAINT "FK_receipt_redemptions_location"
        FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "receipt_redemptions" DROP CONSTRAINT IF EXISTS "FK_receipt_redemptions_location"`,
    );
    await queryRunner.query(`ALTER TABLE "receipt_redemptions" DROP COLUMN IF EXISTS "location_id"`);
  }
}
