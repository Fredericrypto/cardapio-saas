import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { resolveRange } from '../analytics/analytics.range';
import { resolveSiodParams } from './siod.math';
import { SIOD_STRUCTURAL_FLOOR_MINUTES } from './siod.types';
import {
  SiodInputError,
  loadOrders,
  loadOverview,
  parseLocationId,
  parseOrdersFilters,
} from './siod-insights.queries';
import type { QueryFn } from './siod-insights.queries';
import type { SiodOrdersPage, SiodOverview } from './siod-insights.types';
import { buildSettingsView, validateSiodSettingsInput } from './siod-settings.validation';
import type { SiodSettingsView } from './siod-settings.validation';

// Aba "Entregas" (SIOD): configuração dos parâmetros do motor + visualização do
// estimado x real. Sempre escopado ao tenant do token.
@Injectable()
export class SiodInsightsService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  private readonly query: QueryFn = (sql, params) => this.ds.query(sql, params);

  private async readStored(tenantId: string): Promise<unknown> {
    const rows: Array<{ siod_settings: unknown }> = await this.ds.query(
      `SELECT siod_settings FROM tenants WHERE id = $1`,
      [tenantId],
    );
    if (rows.length === 0) throw new NotFoundException('Estabelecimento não encontrado.');
    return rows[0].siod_settings;
  }

  async getSettings(tenantId: string): Promise<SiodSettingsView> {
    return buildSettingsView(await this.readStored(tenantId), resolveSiodParams, SIOD_STRUCTURAL_FLOOR_MINUTES);
  }

  // Salva o conjunto COMPLETO, já validado campo a campo (nada é corrigido em
  // silêncio). Vale só para pedidos NOVOS: os já feitos têm o contexto congelado.
  async saveSettings(tenantId: string, body: unknown): Promise<SiodSettingsView> {
    const result = validateSiodSettingsInput(body);
    if (!result.ok) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: result.errors.map((e) => e.message),
        errors: result.errors,
      });
    }
    const updated: unknown[] = await this.ds.query(
      `UPDATE tenants SET siod_settings = $1::jsonb, updated_at = now() WHERE id = $2 RETURNING id`,
      [JSON.stringify(result.params), tenantId],
    );
    if (updated.length === 0) throw new NotFoundException('Estabelecimento não encontrado.');
    return this.getSettings(tenantId);
  }

  async resetSettings(tenantId: string): Promise<SiodSettingsView> {
    const updated: unknown[] = await this.ds.query(
      `UPDATE tenants SET siod_settings = NULL, updated_at = now() WHERE id = $1 RETURNING id`,
      [tenantId],
    );
    if (updated.length === 0) throw new NotFoundException('Estabelecimento não encontrado.');
    return this.getSettings(tenantId);
  }

  async overview(
    tenantId: string,
    period?: string,
    from?: string,
    to?: string,
    locationId?: string,
  ): Promise<SiodOverview> {
    try {
      const range = resolveRange(period, from, to);
      const loc = parseLocationId(locationId);
      const params = resolveSiodParams(await this.readStored(tenantId));
      return await loadOverview(this.query, tenantId, range, loc, params);
    } catch (err) {
      if (err instanceof SiodInputError) throw new BadRequestException(err.message);
      throw err;
    }
  }

  async orders(
    tenantId: string,
    q: {
      period?: string;
      from?: string;
      to?: string;
      locationId?: string;
      recordClass?: string;
      confidence?: string;
      provider?: string;
      page?: string;
      pageSize?: string;
    },
  ): Promise<SiodOrdersPage> {
    try {
      const range = resolveRange(q.period, q.from, q.to);
      const loc = parseLocationId(q.locationId);
      const filters = parseOrdersFilters(q);
      return await loadOrders(this.query, tenantId, range, loc, filters);
    } catch (err) {
      if (err instanceof SiodInputError) throw new BadRequestException(err.message);
      throw err;
    }
  }
}
