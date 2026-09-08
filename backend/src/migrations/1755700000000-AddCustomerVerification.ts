import { MigrationInterface, QueryRunner } from 'typeorm';

// Sistema de "Cliente Verificado" — todo o estado de uma verificação
// (nenhuma, pendente, aprovada, recusada) fica em cima do próprio
// Customer, sem tabela separada: só existe UMA solicitação "viva" por
// vez (uma recusa permite tentar de novo, sobrescrevendo os campos —
// não precisamos de histórico de tentativas anteriores pra essa
// feature). `is_verified` é o único campo que a aparência do selo em
// qualquer lugar do app realmente lê — os outros são só o estado do
// FLUXO de pedir/decidir a verificação.
export class AddCustomerVerification1755700000000 implements MigrationInterface {
  name = 'AddCustomerVerification1755700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customers"
      ADD COLUMN IF NOT EXISTS "is_verified" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "verification_status" varchar(20) NOT NULL DEFAULT 'none',
      ADD COLUMN IF NOT EXISTS "verification_photo_url" text NULL,
      ADD COLUMN IF NOT EXISTS "verification_photo_delete_at" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "verification_requested_at" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "verification_decided_at" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "verification_rejection_reason" text NULL,
      ADD COLUMN IF NOT EXISTS "verification_reviewed_by_admin_id" uuid NULL,
      ADD COLUMN IF NOT EXISTS "verification_congrats_pending" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customers"
      DROP COLUMN IF EXISTS "is_verified",
      DROP COLUMN IF EXISTS "verification_status",
      DROP COLUMN IF EXISTS "verification_photo_url",
      DROP COLUMN IF EXISTS "verification_photo_delete_at",
      DROP COLUMN IF EXISTS "verification_requested_at",
      DROP COLUMN IF EXISTS "verification_decided_at",
      DROP COLUMN IF EXISTS "verification_rejection_reason",
      DROP COLUMN IF EXISTS "verification_reviewed_by_admin_id",
      DROP COLUMN IF EXISTS "verification_congrats_pending"
    `);
  }
}
