import { MigrationInterface, QueryRunner } from 'typeorm';

// 13/10/2026 — SIOD (Sistema de Inteligência Operacional de Delivery).
//  - orders.preparing_at / ready_at / delivered_at: carimbos do ciclo de vida
//    (Camada 3). Pedidos antigos ficam NULL (nada é inventado);
//  - tenants.siod_settings: parâmetros do motor por restaurante (jsonb; NULL =
//    padrão). NUNCA sai nas rotas públicas (ver toPublicTenant);
//  - order_delivery_intelligence: 1:1 com orders, evidência operacional
//    imutável (Camadas 1–2 congeladas no checkout) + realidade e feedback
//    (Camadas 3–4). Enums como varchar + CHECK (padrão do projeto), sem CHECK
//    entre colunas numéricas (o semeador genérico do teste de backup preenche
//    todas as tabelas com valores arbitrários).
export class OrderDeliveryIntelligence1760000000000 implements MigrationInterface {
  name = 'OrderDeliveryIntelligence1760000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "preparing_at" timestamptz NULL`);
    await q.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "ready_at" timestamptz NULL`);
    await q.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivered_at" timestamptz NULL`);
    await q.query(`ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "siod_settings" jsonb NULL`);

    await q.query(`
      CREATE TABLE IF NOT EXISTS "order_delivery_intelligence" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "order_id" uuid NOT NULL,
        "tenant_id" uuid NOT NULL,

        "estimation_version" varchar(40) NOT NULL,
        "estimation_confidence" varchar(10) NOT NULL,
        "route_provider" varchar(12) NOT NULL,
        "route_fallback_used" boolean NOT NULL DEFAULT false,
        "metrics_status" varchar(20) NOT NULL DEFAULT 'MISSING_DATA',
        "engine_payload_json" jsonb NOT NULL,

        "origin_latitude" numeric(10,7) NOT NULL,
        "origin_longitude" numeric(10,7) NOT NULL,
        "destination_latitude" numeric(10,7) NOT NULL,
        "destination_longitude" numeric(10,7) NOT NULL,

        "estimated_prep_minutes" int NOT NULL,
        "estimated_route_minutes" int NOT NULL,
        "estimated_total_minutes" int NOT NULL,
        "estimated_min_minutes" int NOT NULL,
        "estimated_max_minutes" int NOT NULL,

        "pending_orders_at_creation" int NOT NULL,
        "preparing_orders_at_creation" int NOT NULL,
        "active_orders_at_creation" int NOT NULL,
        "base_prep_minutes_used" int NOT NULL,
        "queue_penalty_minutes_used" int NOT NULL,
        "route_minutes_used" int NOT NULL,
        "peak_multiplier_used" numeric(5,2) NOT NULL,
        "distance_km_used" numeric(10,3) NOT NULL,
        "distance_km" numeric(10,3) NOT NULL,
        "route_seconds" int NOT NULL,
        "items_count" int NOT NULL,
        "items_value" numeric(12,2) NOT NULL,

        "actual_prep_seconds" int NULL,
        "actual_route_seconds" int NULL,
        "actual_total_seconds" int NULL,

        "prediction_error_minutes" numeric(12,2) NULL,
        "prediction_absolute_error_minutes" numeric(12,2) NULL,
        "prediction_error_percent" numeric(12,2) NULL,

        "finalized_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT "UQ_odi_order" UNIQUE ("order_id"),
        CONSTRAINT "FK_odi_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_odi_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_odi_confidence" CHECK ("estimation_confidence" IN ('HIGH','MEDIUM','LOW')),
        CONSTRAINT "CHK_odi_route_provider" CHECK ("route_provider" IN ('OSRM','HAVERSINE','MANUAL')),
        CONSTRAINT "CHK_odi_metrics_status" CHECK ("metrics_status" IN ('VALID','INVALID_TIMESTAMPS','MISSING_DATA'))
      )
    `);
    await q.query(`CREATE INDEX IF NOT EXISTS "idx_odi_tenant_id" ON "order_delivery_intelligence" ("tenant_id")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "idx_odi_estimation_version" ON "order_delivery_intelligence" ("estimation_version")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "idx_odi_created_at" ON "order_delivery_intelligence" ("created_at")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "idx_odi_route_provider" ON "order_delivery_intelligence" ("route_provider")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "order_delivery_intelligence"`);
    await q.query(`ALTER TABLE "tenants" DROP COLUMN IF EXISTS "siod_settings"`);
    await q.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "delivered_at"`);
    await q.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "ready_at"`);
    await q.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "preparing_at"`);
  }
}
