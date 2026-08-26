import { MigrationInterface, QueryRunner } from 'typeorm';

// Correção de dados + remoção do "limite total de usos" (maxRedemptions)
// da experiência do admin. Dois problemas reais, resolvidos aqui:
//
//  1. Promoções com `redemption_count` desatualizado. Antes da correção
//     em OrdersService.markCancelled (sessão anterior), cancelar um
//     pedido NÃO devolvia a vaga no contador — então qualquer promoção
//     que já tinha um pedido cancelado ANTES daquela correção ficou com
//     um `redemption_count` preso, mesmo já não tendo nenhum uso de
//     verdade. É exatamente o "1/1 usados" + "ainda não foi usada"
//     que o Felipe viu. Aqui, recalculamos `redemption_count` do zero
//     pra CADA promoção, contando de verdade quantos pedidos NÃO
//     cancelados existem — vira a fonte de verdade, sem depender de
//     nenhum contador incremental que possa ter ficado desalinhado.
//
//  2. `max_redemptions` (teto de usos NO TOTAL, somando todos os
//     clientes) some do admin — o produto passa a ser só "quantas
//     vezes CADA cliente pode usar" (usage_limit_per_customer), sem um
//     teto artificial de pedidos totais. Zeramos o valor em todas as
//     promoções existentes pra não deixar nenhuma presa com um teto
//     configurado que não tem mais como editar pela UI.
export class RecomputeRedemptionCountAndDropMaxRedemptions1754200000000
  implements MigrationInterface
{
  name = 'RecomputeRedemptionCountAndDropMaxRedemptions1754200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "promotions" p
      SET "redemption_count" = COALESCE((
        SELECT COUNT(*)
        FROM "orders" o
        WHERE o."promotion_id" = p."id"
          AND o."status" != 'cancelado'
      ), 0)
    `);

    await queryRunner.query(`UPDATE "promotions" SET "max_redemptions" = NULL`);
  }

  public async down(): Promise<void> {
    // Não reversível de forma confiável (não dá pra reconstruir o
    // max_redemptions original nem o redemption_count desatualizado de
    // antes — e não faria sentido querer voltar pro estado incorreto).
  }
}
