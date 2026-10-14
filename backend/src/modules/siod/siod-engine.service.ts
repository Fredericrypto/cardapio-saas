import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Order } from '../orders/order.entity';
import { OrderDeliveryIntelligence } from './order-delivery-intelligence.entity';
import { OSRMService } from './osrm.service';
import { computeActualMetrics, resolveSiodParams, runSiodEngine } from './siod.math';
import {
  GeoPoint,
  RouteResult,
  SIOD_ENGINE_VERSION,
  SIOD_ESTIMATION_VERSION,
  SIOD_PAYLOAD_SCHEMA_VERSION,
  SiodEnginePayloadV1,
} from './siod.types';

// Status que compõem a fila da cozinha no instante do checkout:
//  PENDING   = pedido aceito, ainda não começou ('pendente' e 'confirmado');
//  PREPARING = em preparo ('preparando').
// 'aguardando_pagamento' (Pix não pago), 'pronto', 'entregue' e 'cancelado' NÃO contam.
export const SIOD_PENDING_STATUSES = ['pendente', 'confirmado'] as const;
export const SIOD_PREPARING_STATUSES = ['preparando'] as const;

export interface RecordEstimateInput {
  order: Order; // já salvo (precisa de id, tenantId, locationId, orderType)
  tenantSettings: unknown; // tenants.siod_settings cru (null/ausente = padrão)
  route: RouteResult;
  origin: GeoPoint;
  destination: GeoPoint;
  itemsCount: number;
  itemsValue: number;
}

interface QueueCountRow {
  pending: number;
  preparing: number;
}

@Injectable()
export class SIODEngineService {
  private readonly logger = new Logger(SIODEngineService.name);

  constructor(
    @InjectRepository(OrderDeliveryIntelligence)
    private readonly repo: Repository<OrderDeliveryIntelligence>,
    private readonly osrmService: OSRMService,
  ) {}

  // Chamada de rede: roda ANTES da transação do pedido (mesma regra da
  // geocodificação — nunca segurar transação aberta esperando serviço externo).
  // Nunca lança (fallback Haversine dentro do cliente de rotas).
  resolveRoute(origin: GeoPoint, destination: GeoPoint): Promise<RouteResult> {
    return this.osrmService.getRoute(origin, destination);
  }

  // Camadas 1 e 2: conta a fila, roda o motor e CONGELA tudo (coordenadas,
  // parâmetros, contexto, payload) numa linha imutável. Roda dentro da transação
  // do pedido, mas num SAVEPOINT: se algo aqui falhar, só o SIOD é desfeito e o
  // pedido segue — o checkout nunca é interrompido pelo SIOD. Retorna null se falhou.
  async recordOrderEstimate(
    manager: EntityManager,
    input: RecordEstimateInput,
  ): Promise<OrderDeliveryIntelligence | null> {
    const { order, route, origin, destination } = input;
    try {
      return await manager.transaction(async (tx) => {
        const rows: QueueCountRow[] = await tx.query(
          `SELECT
             COUNT(*) FILTER (WHERE status = ANY($3::text[]))::int AS pending,
             COUNT(*) FILTER (WHERE status = ANY($4::text[]))::int AS preparing
           FROM orders
           WHERE tenant_id = $1
             AND location_id IS NOT DISTINCT FROM $2
             AND deleted_at IS NULL
             AND id <> $5`,
          [
            order.tenantId,
            order.locationId,
            [...SIOD_PENDING_STATUSES],
            [...SIOD_PREPARING_STATUSES],
            order.id,
          ],
        );
        const pending = rows[0]?.pending ?? 0;
        const preparing = rows[0]?.preparing ?? 0;

        const params = resolveSiodParams(input.tenantSettings);
        const out = runSiodEngine({
          params,
          pendingOrders: pending,
          preparingOrders: preparing,
          routeSeconds: route.durationSeconds,
          routeProvider: route.provider,
        });

        const payload: SiodEnginePayloadV1 = {
          schemaVersion: SIOD_PAYLOAD_SCHEMA_VERSION,
          engineVersion: SIOD_ENGINE_VERSION,
          estimationVersion: SIOD_ESTIMATION_VERSION,
          frozenAt: new Date().toISOString(),
          params,
          context: {
            orderId: order.id,
            tenantId: order.tenantId,
            locationId: order.locationId,
            orderType: order.orderType,
            itemsCount: input.itemsCount,
            itemsValue: input.itemsValue,
            activeStatusesCounted: {
              pending: [...SIOD_PENDING_STATUSES],
              preparing: [...SIOD_PREPARING_STATUSES],
            },
            queueScope: 'location_all_order_types',
          },
          route: {
            provider: route.provider,
            fallbackUsed: route.fallbackUsed,
            fallbackReason: route.fallbackReason,
            rawDistanceKm: route.distanceKm,
            rawDurationSeconds: route.durationSeconds,
            straightLineKm: route.straightLineKm,
            origin,
            destination,
          },
          computation: out,
        };

        const record = tx.create(OrderDeliveryIntelligence, {
          orderId: order.id,
          tenantId: order.tenantId,
          estimationVersion: SIOD_ESTIMATION_VERSION,
          estimationConfidence: out.confidence,
          routeProvider: route.provider,
          routeFallbackUsed: route.fallbackUsed,
          metricsStatus: 'MISSING_DATA',
          enginePayloadJson: payload,
          originLatitude: origin.latitude,
          originLongitude: origin.longitude,
          destinationLatitude: destination.latitude,
          destinationLongitude: destination.longitude,
          estimatedPrepMinutes: out.estimatedPrepMinutes,
          estimatedRouteMinutes: out.estimatedRouteMinutes,
          estimatedTotalMinutes: out.estimatedTotalMinutes,
          estimatedMinMinutes: out.estimatedMinMinutes,
          estimatedMaxMinutes: out.estimatedMaxMinutes,
          pendingOrdersAtCreation: out.pendingOrders,
          preparingOrdersAtCreation: out.preparingOrders,
          activeOrdersAtCreation: out.activeOrders,
          basePrepMinutesUsed: out.basePrepMinutes,
          queuePenaltyMinutesUsed: out.queuePenaltyMinutes,
          routeMinutesUsed: out.routeMinutes,
          peakMultiplierUsed: out.peakMultiplier,
          distanceKmUsed: route.distanceKm,
          distanceKm: route.distanceKm,
          routeSeconds: route.durationSeconds,
          itemsCount: input.itemsCount,
          itemsValue: input.itemsValue,
        });
        return tx.save(record);
      });
    } catch (err) {
      this.logger.error(
        `SIOD: falha ao registrar a estimativa do pedido ${order.id} (o pedido segue normalmente): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  // Camadas 3 e 4: chamado quando o pedido vira 'entregue'. Valida a linha do
  // tempo e grava as métricas reais + o erro de previsão. Anomalia NUNCA lança:
  // vira metricsStatus (INVALID_TIMESTAMPS / MISSING_DATA) e as métricas derivadas
  // ficam nulas. Idempotente (recalcula a cada chamada). Sem linha SIOD = no-op
  // (pedido que não é de entrega, ou anterior ao SIOD).
  async finalizeOnDelivered(
    order: Pick<Order, 'id' | 'tenantId' | 'createdAt' | 'preparingAt' | 'readyAt' | 'deliveredAt'>,
  ): Promise<void> {
    try {
      const record = await this.repo.findOne({ where: { orderId: order.id, tenantId: order.tenantId } });
      if (!record) return;
      const metrics = computeActualMetrics(
        {
          createdAt: order.createdAt,
          preparingAt: order.preparingAt,
          readyAt: order.readyAt,
          deliveredAt: order.deliveredAt,
        },
        record.estimatedTotalMinutes,
      );
      record.metricsStatus = metrics.metricsStatus;
      record.actualPrepSeconds = metrics.actualPrepSeconds;
      record.actualRouteSeconds = metrics.actualRouteSeconds;
      record.actualTotalSeconds = metrics.actualTotalSeconds;
      record.predictionErrorMinutes = metrics.predictionErrorMinutes;
      record.predictionAbsoluteErrorMinutes = metrics.predictionAbsoluteErrorMinutes;
      record.predictionErrorPercent = metrics.predictionErrorPercent;
      record.finalizedAt = new Date();
      await this.repo.save(record);
    } catch (err) {
      this.logger.error(
        `SIOD: falha ao fechar as métricas do pedido ${order.id} (o pedido não é afetado): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
