import { MigrationInterface, QueryRunner } from 'typeorm';

// Módulo de Backup & Restauração (snapshot por restaurante):
//  - tenant_backups: metadados de cada snapshot (o arquivo criptografado fica
//    no bucket privado). Índice único PARCIAL = no máximo uma operação em
//    andamento por restaurante.
//  - tenant_backup_settings: agenda (frequência, horário BRT, retenção).
//  - backup_audit_logs: auditoria apenas-inserção (gatilho recusa UPDATE).
// As três ficam FORA do snapshot (ver EXCLUDED_TABLES em backup-plan.ts).
export class TenantBackups1757200000000 implements MigrationInterface {
  name = 'TenantBackups1757200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tenant_backups" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "file_name" varchar(200) NOT NULL,
        "storage_path" varchar(300) NOT NULL,
        "file_size" bigint NOT NULL DEFAULT 0,
        "backup_type" varchar(20) NOT NULL,
        "status" varchar(15) NOT NULL DEFAULT 'processando',
        "checksum_sha256" varchar(64) NULL,
        "total_rows" integer NULL,
        "table_counts" jsonb NULL,
        "schema_head" varchar(60) NULL,
        "format_version" smallint NOT NULL DEFAULT 1,
        "error_message" varchar(500) NULL,
        "created_by_user_id" uuid NULL,
        "created_by_name" varchar(150) NULL,
        "restore_count" integer NOT NULL DEFAULT 0,
        "restored_at" timestamptz NULL,
        "restored_by_user_id" uuid NULL,
        "restored_by_name" varchar(150) NULL,
        "completed_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tenant_backups" PRIMARY KEY ("id"),
        CONSTRAINT "FK_tenant_backups_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_tenant_backups_type" CHECK ("backup_type" IN ('automatico', 'manual', 'pre_restauracao')),
        CONSTRAINT "CHK_tenant_backups_status" CHECK ("status" IN ('processando', 'concluido', 'restaurando', 'restaurado', 'falhou')),
        CONSTRAINT "CHK_tenant_backups_size" CHECK ("file_size" >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_tenant_backups_tenant_created" ON "tenant_backups" ("tenant_id", "created_at" DESC)`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tenant_backups_one_in_flight"
      ON "tenant_backups" ("tenant_id")
      WHERE "status" IN ('processando', 'restaurando')
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tenant_backup_settings" (
        "tenant_id" uuid NOT NULL,
        "frequency_days" integer NOT NULL DEFAULT 0,
        "run_time" varchar(5) NOT NULL DEFAULT '04:00',
        "retention_days" integer NOT NULL DEFAULT 90,
        "next_run_at" timestamptz NULL,
        "last_auto_backup_at" timestamptz NULL,
        "updated_by_user_id" uuid NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tenant_backup_settings" PRIMARY KEY ("tenant_id"),
        CONSTRAINT "FK_tenant_backup_settings_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_tenant_backup_settings_frequency" CHECK ("frequency_days" IN (0, 3, 7, 15, 30)),
        CONSTRAINT "CHK_tenant_backup_settings_run_time" CHECK ("run_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
        CONSTRAINT "CHK_tenant_backup_settings_retention" CHECK ("retention_days" BETWEEN 7 AND 365)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_tenant_backup_settings_next_run" ON "tenant_backup_settings" ("next_run_at") WHERE "frequency_days" > 0`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "backup_audit_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "user_id" uuid NULL,
        "user_email" varchar(150) NULL,
        "user_role" varchar(20) NULL,
        "action" varchar(40) NOT NULL,
        "backup_id" uuid NULL,
        "success" boolean NOT NULL DEFAULT true,
        "ip" varchar(64) NULL,
        "forwarded_for" varchar(300) NULL,
        "user_agent" varchar(300) NULL,
        "detail" jsonb NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_backup_audit_logs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_backup_audit_logs_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_backup_audit_logs_tenant_created" ON "backup_audit_logs" ("tenant_id", "created_at" DESC)`,
    );
    // Apenas-inserção: nenhuma linha de auditoria pode ser alterada depois de gravada.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "backup_audit_logs_block_update"() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'backup_audit_logs é apenas-inserção: UPDATE não é permitido';
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_backup_audit_logs_block_update" ON "backup_audit_logs"`);
    await queryRunner.query(`
      CREATE TRIGGER "trg_backup_audit_logs_block_update"
      BEFORE UPDATE ON "backup_audit_logs"
      FOR EACH ROW EXECUTE FUNCTION "backup_audit_logs_block_update"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "backup_audit_logs"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS "backup_audit_logs_block_update"()`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenant_backup_settings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenant_backups"`);
  }
}
