import { MigrationInterface, QueryRunner } from 'typeorm';
import { signVerification } from '../common/utils/verification-signature';

// Resposta a uma preocupação real e específica do Felipe: um selo
// "Cliente Verificado" que é só um boolean no banco não tem como provar
// pra o próprio estabelecimento que foi concedido DE VERDADE pelo
// sistema (e não adulterado por acesso direto ao banco, ou qualquer
// outro caminho fora do fluxo de aprovação normal). Essa migration
// adiciona:
// - `verification_integrity_signature`: prova criptográfica (HMAC,
//   ver common/utils/verification-signature.ts) gravada NO MOMENTO da
//   aprovação — some sozinha quando revogado.
// - `verification_tamper_flagged_at`: marcado automaticamente (nunca
//   pelo admin) sempre que o sistema encontra `is_verified = true` SEM
//   uma assinatura válida — sinal de que algo forjou esse campo por
//   fora do fluxo normal.
// - Campos de REVOGAÇÃO — a única forma de tirar o selo de alguém além
//   de excluir a conta inteira: ação manual do admin, com motivo
//   obrigatório, sempre auditada.
// - Campos de SUSPENSÃO — a "punição" que o Felipe pediu: bloqueia
//   login enquanto suspenso (ver CustomersAuthService.login).
export class AddVerificationIntegrityAndSuspension1755900000000
  implements MigrationInterface
{
  name = 'AddVerificationIntegrityAndSuspension1755900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customers"
      ADD COLUMN IF NOT EXISTS "verification_integrity_signature" varchar(64) NULL,
      ADD COLUMN IF NOT EXISTS "verification_tamper_flagged_at" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "verification_revoked_at" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "verification_revoked_reason" text NULL,
      ADD COLUMN IF NOT EXISTS "verification_revoked_by_admin_id" uuid NULL,
      ADD COLUMN IF NOT EXISTS "is_suspended" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "suspended_at" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "suspended_reason" text NULL,
      ADD COLUMN IF NOT EXISTS "suspended_by_admin_id" uuid NULL
    `);

    // Retroativo: clientes já aprovados ANTES dessa migration existir
    // não têm assinatura nenhuma. Confiamos nesses registros (o único
    // jeito de terem chegado em `is_verified = true` até agora era pelo
    // fluxo normal de aprovação, já que a coluna não existia pra
    // adulterar) — geramos a assinatura retroativa deles agora, uma vez
    // só, a partir dos campos de auditoria que já existiam
    // (`verification_decided_at` / `verification_reviewed_by_admin_id`).
    // Dali em diante, a assinatura só é gravada no momento da aprovação
    // de verdade (ver CustomerVerificationService.approve) — isso aqui
    // é só pra não quebrar/desverificar quem já tinha o selo antes
    // dessa proteção existir.
    const alreadyVerified: Array<{
      id: string;
      tenant_id: string;
      verification_decided_at: Date;
      verification_reviewed_by_admin_id: string;
    }> = await queryRunner.query(`
      SELECT id, tenant_id, verification_decided_at, verification_reviewed_by_admin_id
      FROM customers
      WHERE is_verified = true
        AND verification_integrity_signature IS NULL
        AND verification_decided_at IS NOT NULL
        AND verification_reviewed_by_admin_id IS NOT NULL
    `);
    for (const row of alreadyVerified) {
      const decidedAtIso = new Date(row.verification_decided_at).toISOString();
      const signature = signVerification(
        row.id,
        row.tenant_id,
        decidedAtIso,
        row.verification_reviewed_by_admin_id,
      );
      await queryRunner.query(
        `UPDATE customers SET verification_integrity_signature = $1 WHERE id = $2`,
        [signature, row.id],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customers"
      DROP COLUMN IF EXISTS "suspended_by_admin_id",
      DROP COLUMN IF EXISTS "suspended_reason",
      DROP COLUMN IF EXISTS "suspended_at",
      DROP COLUMN IF EXISTS "is_suspended",
      DROP COLUMN IF EXISTS "verification_revoked_by_admin_id",
      DROP COLUMN IF EXISTS "verification_revoked_reason",
      DROP COLUMN IF EXISTS "verification_revoked_at",
      DROP COLUMN IF EXISTS "verification_tamper_flagged_at",
      DROP COLUMN IF EXISTS "verification_integrity_signature"
    `);
  }
}
