import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { imageTelemetry } from '../../common/utils/image-optimizer';
import { TenantCache } from './tenant-cache';

// Instância única (o módulo é singleton). Render grátis roda UMA instância do
// backend, então o cache em memória é consistente; se um dia houver mais de
// uma instância, a conferência por fingerprint continua protegendo os pedidos
// e produtos, mas a invalidação explícita só vale dentro do próprio processo.
@Injectable()
export class TenantCacheService extends TenantCache implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('CacheSummary');
  private readonly imageLogger = new Logger('ImageUpload');
  private timer: NodeJS.Timeout | null = null;
  private lastLoggedRequests = -1;
  private readonly activeAlerts = new Set<string>();

  constructor() {
    super();
  }

  onModuleInit(): void {
    // Cada upload de imagem vira uma linha de log (original -> final).
    imageTelemetry.setSink((line) => this.imageLogger.log(line));
    const every = Number(process.env.CACHE_STATS_LOG_MS ?? 600_000);
    if (!Number.isFinite(every) || every <= 0) return;
    this.timer = setInterval(() => this.logSummary(), every);
    this.timer.unref();
  }

  // Resumo final ao desligar (deploy ou Render dormindo): os contadores vivem só
  // na memória, então o log é o histórico que sobra.
  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    imageTelemetry.setSink(null);
    this.logSummary(true);
  }

  // Um bloco agregado por período (padrão 10 min), só quando houve atividade.
  // Alertas saem em WARN uma vez quando aparecem e uma vez quando somem.
  logSummary(force = false): void {
    const snap = this.snapshot();
    const { summary } = snap;

    const current = new Set(snap.alerts.map((a) => a.id));
    for (const alert of snap.alerts) {
      if (!this.activeAlerts.has(alert.id)) this.logger.warn(`ALERTA ${alert.id}: ${alert.message}`);
    }
    for (const id of this.activeAlerts) {
      if (!current.has(id)) this.logger.log(`Alerta resolvido: ${id}`);
    }
    this.activeAlerts.clear();
    for (const id of current) this.activeAlerts.add(id);

    if (!force && summary.requests === this.lastLoggedRequests) return; // sem atividade desde o último log
    if (summary.requests === 0 && !force) return;
    this.lastLoggedRequests = summary.requests;

    const rate = (n: number | null) => (n === null ? '-' : `${n}%`);
    const lines = [
      `Hit rate global: ${rate(summary.hitRate)} (${summary.cacheHits} acertos / ${summary.cacheMisses} cargas no banco)`,
      ...Object.entries(snap.scopes)
        .filter(([, s]) => s.requests > 0)
        .map(
          ([name, s]) =>
            `${name}: hit ${rate(s.hitRate)} | cargas ${s.dbLoads} | invalidações ${s.invalidations} | payload evitado ${s.estimatedPayloadPreventedMB} MB`,
        ),
      `Execuções do loader evitadas: ${summary.loaderRunsAvoided} | conferências baratas: ${summary.fingerprintQueries}`,
      `Payload evitado (JSON): ${summary.estimatedPayloadPreventedMB} MB | lido do banco: ${summary.payloadLoadedFromDbMB} MB | redução: ${rate(summary.payloadReductionPercent)}`,
      `304: ${summary.notModifiedResponses} respostas (~${summary.estimatedBandwidthSavedMB} MB de banda)`,
      `Bypass: ${summary.bypasses} | alertas ativos: ${snap.alerts.length}`,
    ];
    const images = imageTelemetry.snapshot().total;
    if (images.uploads > 0) {
      lines.push(
        `Imagens: ${images.uploads} uploads, ${images.optimized} otimizados, economia ${images.savedPercent ?? 0}% (${(images.savedBytes / 1024 / 1024).toFixed(1)} MB)`,
      );
    }
    this.logger.log(`\n  ${lines.join('\n  ')}`);
  }
}
