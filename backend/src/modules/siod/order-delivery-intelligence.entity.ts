import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Order } from '../orders/order.entity';
import { numericTransformer } from '../../common/utils/numeric-transformer';
import type {
  EstimationConfidence,
  MetricsStatus,
  RouteProvider,
  SiodEnginePayloadV1,
} from './siod.types';

// Uma linha por pedido de ENTREGA: evidência operacional imutável (Camadas 1 e
// 2 congeladas no checkout) + realidade (Camada 3) + feedback (Camada 4).
// Fica fora de `orders` de propósito (isolamento de domínio). Nunca é exposta
// ao cliente final.
@Entity('order_delivery_intelligence')
@Index('idx_odi_tenant_id', ['tenantId'])
@Index('idx_odi_estimation_version', ['estimationVersion'])
@Index('idx_odi_created_at', ['createdAt'])
@Index('idx_odi_route_provider', ['routeProvider'])
export class OrderDeliveryIntelligence {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_id', type: 'uuid', unique: true })
  orderId: string;

  @OneToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  // Desnormalizado para análises diretas sem JOIN.
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  // ---- A. Proveniência ----
  @Column({ name: 'estimation_version', type: 'varchar', length: 40 })
  estimationVersion: string;

  @Column({ name: 'estimation_confidence', type: 'varchar', length: 10 })
  estimationConfidence: EstimationConfidence;

  @Column({ name: 'route_provider', type: 'varchar', length: 12 })
  routeProvider: RouteProvider;

  @Column({ name: 'route_fallback_used', type: 'boolean', default: false })
  routeFallbackUsed: boolean;

  @Column({ name: 'metrics_status', type: 'varchar', length: 20, default: 'MISSING_DATA' })
  metricsStatus: MetricsStatus;

  @Column({ name: 'engine_payload_json', type: 'jsonb' })
  enginePayloadJson: SiodEnginePayloadV1;

  // ---- B. Coordenadas congeladas ----
  @Column({ name: 'origin_latitude', type: 'numeric', precision: 10, scale: 7, transformer: numericTransformer })
  originLatitude: number;

  @Column({ name: 'origin_longitude', type: 'numeric', precision: 10, scale: 7, transformer: numericTransformer })
  originLongitude: number;

  @Column({ name: 'destination_latitude', type: 'numeric', precision: 10, scale: 7, transformer: numericTransformer })
  destinationLatitude: number;

  @Column({ name: 'destination_longitude', type: 'numeric', precision: 10, scale: 7, transformer: numericTransformer })
  destinationLongitude: number;

  // ---- C. Camada 1: estimativa prometida ----
  @Column({ name: 'estimated_prep_minutes', type: 'int' })
  estimatedPrepMinutes: number;

  @Column({ name: 'estimated_route_minutes', type: 'int' })
  estimatedRouteMinutes: number;

  @Column({ name: 'estimated_total_minutes', type: 'int' })
  estimatedTotalMinutes: number;

  @Column({ name: 'estimated_min_minutes', type: 'int' })
  estimatedMinMinutes: number;

  @Column({ name: 'estimated_max_minutes', type: 'int' })
  estimatedMaxMinutes: number;

  // ---- D. Camada 2: snapshots do checkout ----
  @Column({ name: 'pending_orders_at_creation', type: 'int' })
  pendingOrdersAtCreation: number;

  @Column({ name: 'preparing_orders_at_creation', type: 'int' })
  preparingOrdersAtCreation: number;

  // pending + preparing no instante do checkout.
  @Column({ name: 'active_orders_at_creation', type: 'int' })
  activeOrdersAtCreation: number;

  @Column({ name: 'base_prep_minutes_used', type: 'int' })
  basePrepMinutesUsed: number;

  @Column({ name: 'queue_penalty_minutes_used', type: 'int' })
  queuePenaltyMinutesUsed: number;

  @Column({ name: 'route_minutes_used', type: 'int' })
  routeMinutesUsed: number;

  @Column({ name: 'peak_multiplier_used', type: 'numeric', precision: 5, scale: 2, transformer: numericTransformer })
  peakMultiplierUsed: number;

  // Distância efetivamente usada pelo motor.
  @Column({ name: 'distance_km_used', type: 'numeric', precision: 10, scale: 3, transformer: numericTransformer })
  distanceKmUsed: number;

  // Métricas brutas do provedor de rota.
  @Column({ name: 'distance_km', type: 'numeric', precision: 10, scale: 3, transformer: numericTransformer })
  distanceKm: number;

  @Column({ name: 'route_seconds', type: 'int' })
  routeSeconds: number;

  @Column({ name: 'items_count', type: 'int' })
  itemsCount: number;

  @Column({ name: 'items_value', type: 'numeric', precision: 12, scale: 2, transformer: numericTransformer })
  itemsValue: number;

  // ---- E. Camada 3: realidade (só quando metricsStatus = VALID) ----
  @Column({ name: 'actual_prep_seconds', type: 'int', nullable: true })
  actualPrepSeconds: number | null;

  @Column({ name: 'actual_route_seconds', type: 'int', nullable: true })
  actualRouteSeconds: number | null;

  @Column({ name: 'actual_total_seconds', type: 'int', nullable: true })
  actualTotalSeconds: number | null;

  // ---- F. Camada 4: feedback (positivo = demorou mais que o estimado) ----
  @Column({ name: 'prediction_error_minutes', type: 'numeric', precision: 12, scale: 2, nullable: true, transformer: numericTransformer })
  predictionErrorMinutes: number | null;

  @Column({ name: 'prediction_absolute_error_minutes', type: 'numeric', precision: 12, scale: 2, nullable: true, transformer: numericTransformer })
  predictionAbsoluteErrorMinutes: number | null;

  @Column({ name: 'prediction_error_percent', type: 'numeric', precision: 12, scale: 2, nullable: true, transformer: numericTransformer })
  predictionErrorPercent: number | null;

  // Última vez que o encerramento (DELIVERED) processou as métricas.
  @Column({ name: 'finalized_at', type: 'timestamptz', nullable: true })
  finalizedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
