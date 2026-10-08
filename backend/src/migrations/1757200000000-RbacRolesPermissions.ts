import { MigrationInterface, QueryRunner } from 'typeorm';
import { PERMISSION_CATALOG, SYSTEM_ROLES } from '../modules/roles/permissions.catalog';

// 07/10/2026 — RBAC por permissões (com wildcard).
//  - permissions: catálogo global; roles: cargos POR estabelecimento;
//    role_permissions: N:N; admin_users.role_id: cargo do usuário.
//  - Semeia o catálogo e cria os 3 cargos de sistema (admin "*", manager,
//    staff) para CADA estabelecimento existente; migra owner→admin,
//    manager→manager, staff→staff (qualquer outro valor → staff, menor privilégio).
//  - Nada de valores concatenados: tudo via parâmetros ($1, $2…).
//  - A coluna legada admin_users.role é mantida (notificações internas).
// Após esta migration o backend também sincroniza o catálogo a cada boot
// (PermissionsSyncService), então permissões novas não exigem migration.
export class RbacRolesPermissions1757200000000 implements MigrationInterface {
  name = 'RbacRolesPermissions1757200000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

    await q.query(`
      CREATE TABLE IF NOT EXISTS "permissions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "slug" varchar(80) NOT NULL,
        "name" varchar(120) NOT NULL,
        "module" varchar(60) NOT NULL,
        "description" varchar(300) NOT NULL DEFAULT '',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_permissions_slug" UNIQUE ("slug")
      )
    `);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_permissions_module" ON "permissions" ("module")`);

    await q.query(`
      CREATE TABLE IF NOT EXISTS "roles" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "name" varchar(60) NOT NULL,
        "slug" varchar(80) NOT NULL,
        "description" varchar(200) NULL,
        "is_system_default" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_roles_tenant_slug" UNIQUE ("tenant_id", "slug"),
        CONSTRAINT "FK_roles_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_roles_tenant" ON "roles" ("tenant_id")`);

    await q.query(`
      CREATE TABLE IF NOT EXISTS "role_permissions" (
        "role_id" uuid NOT NULL,
        "permission_id" uuid NOT NULL,
        PRIMARY KEY ("role_id", "permission_id"),
        CONSTRAINT "FK_role_permissions_role" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_role_permissions_permission" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_role_permissions_permission" ON "role_permissions" ("permission_id")`);

    await q.query(`ALTER TABLE "admin_users" ADD COLUMN IF NOT EXISTS "role_id" uuid NULL`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_admin_users_role" ON "admin_users" ("role_id")`);
    await q.query(`
      DO $$ BEGIN
        ALTER TABLE "admin_users"
          ADD CONSTRAINT "FK_admin_users_role" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    // Catálogo de permissões.
    for (const d of PERMISSION_CATALOG) {
      await q.query(
        `INSERT INTO "permissions" ("slug", "name", "module", "description")
         VALUES ($1, $2, $3, $4)
         ON CONFLICT ("slug") DO UPDATE SET "name" = EXCLUDED."name", "module" = EXCLUDED."module", "description" = EXCLUDED."description"`,
        [d.slug, d.name, d.module, d.description],
      );
    }

    // Cargos de sistema para todos os estabelecimentos existentes.
    for (const def of SYSTEM_ROLES) {
      await q.query(
        `INSERT INTO "roles" ("tenant_id", "name", "slug", "description", "is_system_default")
         SELECT t."id", $1, $2, $3, true FROM "tenants" t
         ON CONFLICT ("tenant_id", "slug") DO NOTHING`,
        [def.name, def.slug, def.description],
      );
      await q.query(
        `INSERT INTO "role_permissions" ("role_id", "permission_id")
         SELECT r."id", p."id" FROM "roles" r
         JOIN "permissions" p ON p."slug" = ANY($2::text[])
         WHERE r."slug" = $1 AND r."is_system_default" = true
         ON CONFLICT DO NOTHING`,
        [def.slug, def.permissions],
      );
    }

    // Backfill: perfil legado → cargo. Desconhecido cai em "staff".
    await q.query(`
      UPDATE "admin_users" u
         SET "role_id" = r."id"
        FROM "roles" r
       WHERE u."role_id" IS NULL
         AND r."tenant_id" = u."tenant_id"
         AND r."is_system_default" = true
         AND r."slug" = CASE u."role" WHEN 'owner' THEN 'admin' WHEN 'manager' THEN 'manager' ELSE 'staff' END
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "admin_users" DROP CONSTRAINT IF EXISTS "FK_admin_users_role"`);
    await q.query(`DROP INDEX IF EXISTS "IDX_admin_users_role"`);
    await q.query(`ALTER TABLE "admin_users" DROP COLUMN IF EXISTS "role_id"`);
    await q.query(`DROP TABLE IF EXISTS "role_permissions"`);
    await q.query(`DROP TABLE IF EXISTS "roles"`);
    await q.query(`DROP TABLE IF EXISTS "permissions"`);
  }
}
