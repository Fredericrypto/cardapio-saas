import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TenantCache } from './tenant-cache';

// Instância única (o módulo é singleton). Render grátis roda UMA instância do
// backend, então o cache em memória é consistente; se um dia houver mais de
// uma instância, a conferência por fingerprint continua protegendo os pedidos
// e produtos, mas a invalidação explícita só vale dentro do próprio processo.
@Injectable()
export class TenantCacheService extends TenantCache implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TenantCacheService.name);
  private timer: NodeJS.Timeout | null = null;
  private lastLoggedRequests = 0;

  constructor() {
    super();
  }

  onModuleInit(): void {
    const every = Number(process.env.CACHE_STATS_LOG_MS ?? 600_000);
    if (!Number.isFinite(every) || every <= 0) return;
    this.timer = setInterval(() => this.logSummary(), every);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private logSummary(): void {
    const { total, scopes } = this.snapshot();
    if (total.requests === this.lastLoggedRequests) return; // sem atividade desde o último log
    this.lastLoggedRequests = total.requests;
    const parts = Object.entries(scopes)
      .filter(([, s]) => s.hits + s.revalidated + s.misses + s.coalesced > 0)
      .map(([name, s]) => `${name}: hit ${s.hits + s.revalidated} / miss ${s.misses} (${s.hitRate ?? 0}%)`);
    const mb = (total.estimatedBytesAvoided / 1024 / 1024).toFixed(1);
    this.logger.log(
      `cache ${parts.join(' | ')} | cargas no banco ${total.loads} | conferências ${total.fingerprintQueries} | JSON evitado ~${mb} MB`,
    );
  }
}
