import { MigrationInterface, QueryRunner } from 'typeorm';

// Reparo de dados: a sessão anterior impediu, dali pra frente, salvar
// `max_eligible_quantity` junto com `scope='all'` (não faz sentido
// travar "N unidades" de um cupom que vale pro carrinho inteiro — de
// qual produto seriam essas unidades?). Mas isso só bloqueou salvamentos
// NOVOS — qualquer promoção que já tinha essa combinação salva ANTES da
// correção ficou presa nela. Na prática, isso fazia o cupom escolher
// sempre o item mais caro do carrinho pra "isolar" o desconto (ver
// PromotionsService.eligibleSubtotalCents, prioriza preço decrescente),
// o que parecia "aplicar no item errado" pro cliente. Aqui, limpa
// qualquer resíduo assim que ainda exista.
export class ClearOrphanedMaxEligibleQuantityOnScopeAll1754400000000
  implements MigrationInterface
{
  name = 'ClearOrphanedMaxEligibleQuantityOnScopeAll1754400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "promotions" SET "max_eligible_quantity" = NULL WHERE "scope" = 'all'`,
    );
  }

  public async down(): Promise<void> {
    // Não reversível (não dá pra reconstruir o valor apagado, e não
    // faria sentido querer voltar pro estado incorreto de qualquer forma).
  }
}
