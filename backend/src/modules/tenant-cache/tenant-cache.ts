import { createHash } from 'crypto';

// Cache em memória por restaurante, baseado em INVALIDAÇÃO (não só em prazo).
//
// Por que existe: o painel faz polling a cada 5 s e o app do cliente a cada
// 4–20 s. Cada ciclo rodava consultas pesadas (pedidos + itens + cliente) no
// Supabase, e o egress do plano free estourou. Aqui, enquanto nada mudou, a
// resposta sai da memória do backend e o banco não é tocado.
//
// Três camadas de segurança contra dado velho, da mais forte à mais fraca:
//  1. Invalidação explícita: toda escrita feita por este processo chama
//     `invalidate` (ver InvalidatesTenantCache) — o próximo poll já recarrega.
//  2. Impressão digital (fingerprint): consulta de 1 linha (contagem +
//     max(updated_at)) que pega escritas feitas por qualquer outro caminho
//     (outro módulo, SQL manual) — se mudou, recarrega.
//  3. Idade máxima (`maxAgeMs`): teto duro; passou disso, recarrega de qualquer jeito.
//
// Os valores guardados são COMPARTILHADOS entre requisições: quem recebe deve
// tratá-los como somente-leitura (serializar/ler, nunca mutar).
//
// OBSERVABILIDADE: cada chamada é contada por `label` (um rótulo por endpoint,
// ex.: 'admin-orders'). Os números são medidos, não estimados — exceto onde o
// próprio nome diz "estimated". As limitações estão em `snapshot().notes`.

export type CacheScope = 'orders' | 'tables' | 'products';
export const ALL_TENANTS = '*' as const;

export interface CacheOptions {
  // Idade máxima de uma entrada antes de recarregar, aconteça o que acontecer.
  maxAgeMs: number;
  // Consulta BARATA que resume o estado dos dados (ex.: "12|2026-10-15 10:00:00.123456+00").
  // Se devolver o mesmo texto da última carga, a entrada continua válida.
  fingerprint?: () => Promise<string>;
  // Intervalo mínimo entre duas conferências de fingerprint (0 = toda chamada).
  fingerprintEveryMs?: number;
  // Separa várias entradas do mesmo restaurante/escopo (ex.: `summary:<sessionId>`).
  // `invalidate(tenant, scope)` derruba todas as variantes de uma vez.
  variant?: string;
  // Nome do endpoint/uso nas métricas (padrão: o próprio escopo).
  label?: string;
}

export type CacheSource = 'hit' | 'revalidated' | 'miss' | 'coalesced';
export type LoadReason = 'cold' | 'expired' | 'fingerprint' | 'invalidated' | 'error';

export interface CacheResult<T> {
  value: T;
  // ETag fraco derivado do CONTEÚDO — igual enquanto os dados forem iguais.
  etag: string;
  source: CacheSource;
}

interface Entry<T> {
  value: T;
  etag: string;
  bytes: number;
  fingerprint: string | null;
  loadedAt: number;
  checkedAt: number;
  generation: string;
}

interface Inflight {
  generation: string;
  promise: Promise<CacheResult<unknown>>;
}

// ------------------------------------------------------------------ métricas

export interface LabelCounters {
  hits: number; // servido da memória sem conferir o banco
  revalidated: number; // servido da memória após conferência barata (fingerprint igual)
  coalesced: number; // pegou carona numa carga já em andamento
  loads: number; // cargas REAIS do banco (o loader rodou)
  discardedStale: number;
  fingerprintQueries: number;
  fingerprintBytes: number; // só o texto devolvido (sem overhead de protocolo)
  errors: number;
  bypasses: number; // caminhos que consultaram o banco SEM passar pelo cache
  bytesServedFromCache: number;
  bytesLoaded: number;
  loadMsTotal: number;
  loadReasons: Record<LoadReason, number>;
  lastLoadBytes: number;
  maxLoadBytes: number;
  lastLoadItems: number | null;
}

const emptyCounters = (): LabelCounters => ({
  hits: 0,
  revalidated: 0,
  coalesced: 0,
  loads: 0,
  discardedStale: 0,
  fingerprintQueries: 0,
  fingerprintBytes: 0,
  errors: 0,
  bypasses: 0,
  bytesServedFromCache: 0,
  bytesLoaded: 0,
  loadMsTotal: 0,
  loadReasons: { cold: 0, expired: 0, fingerprint: 0, invalidated: 0, error: 0 },
  lastLoadBytes: 0,
  maxLoadBytes: 0,
  lastLoadItems: null,
});

const SCOPES: CacheScope[] = ['orders', 'tables', 'products'];
const MINUTE_MS = 60_000;
const KEEP_MINUTES = 90;

export interface Alert {
  id: string;
  severity: 'warn' | 'info';
  label: string;
  message: string;
  value: number;
  threshold: number;
}

// Limites dos alertas (exportados para os testes e para ajuste consciente).
export const ALERT_LIMITS = {
  windowMinutes: 10,
  minRequestsForHitRate: 30,
  minHitRatePercent: 70,
  maxLoadsPerMinute: 12, // média dos últimos 5 min: 1 carga a cada 5 s = o cache não está segurando
  maxInvalidationsPerMinute: 6, // média dos últimos 5 min, por escopo
  riseMinLoads: 20, // cargas dos últimos 5 min, e pelo menos o dobro dos 5 min anteriores
  adminOrdersPayloadBytes: 2 * 1024 * 1024, // lista do painel passou de 2 MB: histórico crescendo
  minHttpRequestsForEtagCheck: 50,
} as const;

interface MinuteBucket {
  requests: number;
  served: number; // hits + revalidated + coalesced
  loads: number;
}

// Contadores HTTP de revalidação (ETag/304). Singleton de módulo porque quem
// registra é o helper de cabeçalhos, usado nos controllers sem injeção.
interface HttpCounters {
  responses: number;
  conditional: number; // chegou com If-None-Match
  notModified: number; // If-None-Match casou -> o Express responde 304 sem corpo
  bytesNotModified: number;
}

class HttpCacheMetrics {
  private readonly byLabel = new Map<string, HttpCounters>();

  record(label: string, conditional: boolean, notModified: boolean, bytes: number): void {
    let c = this.byLabel.get(label);
    if (!c) {
      c = { responses: 0, conditional: 0, notModified: 0, bytesNotModified: 0 };
      this.byLabel.set(label, c);
    }
    c.responses += 1;
    if (conditional) c.conditional += 1;
    if (notModified) {
      c.notModified += 1;
      c.bytesNotModified += bytes;
    }
  }

  snapshot(): Record<string, HttpCounters> {
    const out: Record<string, HttpCounters> = {};
    for (const [label, c] of this.byLabel) out[label] = { ...c };
    return out;
  }

  reset(): void {
    this.byLabel.clear();
  }
}

export const httpCacheMetrics = new HttpCacheMetrics();

// Tamanho (bytes de JSON) conhecido por ETag — para o helper HTTP saber quanto
// um 304 deixou de trafegar. Limitado para não crescer sem fim.
const etagBytes = new Map<string, number>();
function rememberEtag(etag: string, bytes: number): void {
  etagBytes.delete(etag);
  while (etagBytes.size >= 500) {
    const oldest = etagBytes.keys().next().value;
    if (oldest === undefined) break;
    etagBytes.delete(oldest);
  }
  etagBytes.set(etag, bytes);
}
export function bytesForEtag(etag: string): number {
  return etagBytes.get(etag) ?? 0;
}

export class TenantCache {
  private readonly entries = new Map<string, Entry<unknown>>();
  private readonly inflight = new Map<string, Inflight>();
  private readonly tenantGen = new Map<string, number>();
  private readonly allGen = new Map<CacheScope, number>();
  // Chaves cujas entradas foram derrubadas por invalidação (para classificar a
  // próxima carga como 'invalidated' e não como 'cold'). Limitado.
  private readonly invalidatedKeys = new Set<string>();
  private readonly counters = new Map<string, LabelCounters>();
  private readonly labelScope = new Map<string, CacheScope>();
  private readonly scopeInvalidations = new Map<CacheScope, number>();
  // Quem derrubou o cache (nome do método ou ponto explícito) — mostra a CAUSA de invalidação em excesso.
  private readonly invalidationSources = new Map<string, number>();
  private readonly labelMinutes = new Map<string, Map<number, MinuteBucket>>();
  private readonly invalidationMinutes = new Map<CacheScope, Map<number, number>>();
  private startedAt: number;
  private etagCounter = 0;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly maxEntries = 400,
  ) {
    this.startedAt = this.now();
  }

  // ---------------------------------------------------------------- leitura

  async getOrLoad<T>(
    tenantId: string,
    scope: CacheScope,
    loader: () => Promise<T>,
    opts: CacheOptions,
  ): Promise<CacheResult<T>> {
    const label = opts.label ?? scope;
    const key = this.keyOf(scope, tenantId, opts.variant);
    const c = this.countersFor(label, scope);
    const generation = this.generationOf(scope, tenantId);
    const now = this.now();
    const entry = this.entries.get(key) as Entry<T> | undefined;
    let reason: LoadReason = 'cold';

    if (entry && entry.generation === generation) {
      if (now - entry.loadedAt >= opts.maxAgeMs) {
        reason = 'expired';
      } else {
        const every = opts.fingerprintEveryMs ?? 0;
        if (!opts.fingerprint || now - entry.checkedAt < every) {
          return this.serve(entry, c, label, 'hit');
        }
        try {
          const current = await this.runFingerprint(opts.fingerprint, c);
          if (
            current === entry.fingerprint &&
            this.entries.get(key) === entry &&
            entry.generation === this.generationOf(scope, tenantId)
          ) {
            entry.checkedAt = this.now();
            return this.serve(entry, c, label, 'revalidated');
          }
          reason = 'fingerprint';
        } catch {
          // Conferência falhou: na dúvida, recarrega de verdade (nunca serve às cegas).
          c.errors += 1;
          reason = 'error';
        }
      }
    } else if (this.invalidatedKeys.delete(key)) {
      reason = 'invalidated';
    }

    return this.load(key, scope, tenantId, generation, loader, opts, label, c, reason);
  }

  private async runFingerprint(fn: () => Promise<string>, c: LabelCounters): Promise<string> {
    c.fingerprintQueries += 1;
    const value = await fn();
    c.fingerprintBytes += value.length;
    return value;
  }

  private serve<T>(entry: Entry<T>, c: LabelCounters, label: string, source: 'hit' | 'revalidated'): CacheResult<T> {
    if (source === 'hit') c.hits += 1;
    else c.revalidated += 1;
    c.bytesServedFromCache += entry.bytes;
    const b = this.bucket(label);
    b.requests += 1;
    b.served += 1;
    return { value: entry.value, etag: entry.etag, source };
  }

  private async load<T>(
    key: string,
    scope: CacheScope,
    tenantId: string,
    generation: string,
    loader: () => Promise<T>,
    opts: CacheOptions,
    label: string,
    c: LabelCounters,
    reason: LoadReason,
  ): Promise<CacheResult<T>> {
    const running = this.inflight.get(key);
    if (running && running.generation === generation) {
      c.coalesced += 1;
      const b = this.bucket(label);
      b.requests += 1;
      b.served += 1;
      const shared = (await running.promise) as CacheResult<T>;
      return { ...shared, source: 'coalesced' };
    }

    const promise = (async (): Promise<CacheResult<T>> => {
      const startedAt = this.now();
      // A impressão digital é lida ANTES da carga: se algo mudar durante a
      // leitura, a próxima conferência vê diferença e recarrega (direção segura).
      let fingerprint: string | null = null;
      if (opts.fingerprint) {
        try {
          fingerprint = await this.runFingerprint(opts.fingerprint, c);
        } catch {
          c.errors += 1;
        }
      }
      const value = await loader();
      const { etag, bytes } = this.describe(value);
      const loadedAt = this.now();
      c.loads += 1;
      c.loadReasons[reason] += 1;
      c.bytesLoaded += bytes;
      c.loadMsTotal += loadedAt - startedAt;
      c.lastLoadBytes = bytes;
      c.maxLoadBytes = Math.max(c.maxLoadBytes, bytes);
      c.lastLoadItems = Array.isArray(value) ? value.length : null;
      const b = this.bucket(label);
      b.requests += 1;
      b.loads += 1;

      // Se houve invalidação enquanto carregava, o dado pode já estar velho:
      // devolve a quem pediu, mas NÃO guarda.
      if (this.generationOf(scope, tenantId) === generation) {
        this.store(key, { value, etag, bytes, fingerprint, loadedAt, checkedAt: loadedAt, generation });
      } else {
        c.discardedStale += 1;
      }
      return { value, etag, source: 'miss' };
    })();

    this.inflight.set(key, { generation, promise: promise as Promise<CacheResult<unknown>> });
    try {
      return await promise;
    } finally {
      if (this.inflight.get(key)?.promise === (promise as Promise<CacheResult<unknown>>)) {
        this.inflight.delete(key);
      }
    }
  }

  // ------------------------------------------------------------ invalidação

  invalidate(tenantId: string, scopes: CacheScope | CacheScope[], source = 'unknown'): void {
    this.countSource(source, Array.isArray(scopes) ? scopes.length : 1);
    for (const scope of Array.isArray(scopes) ? scopes : [scopes]) {
      const gk = `${scope}|${tenantId}`;
      this.tenantGen.set(gk, (this.tenantGen.get(gk) ?? 0) + 1);
      this.countInvalidation(scope);
      this.dropEntries(`${gk}|`);
    }
  }

  invalidateAll(scopes: CacheScope | CacheScope[] = SCOPES, source = 'unknown'): void {
    this.countSource(source, Array.isArray(scopes) ? scopes.length : 1);
    for (const scope of Array.isArray(scopes) ? scopes : [scopes]) {
      this.allGen.set(scope, (this.allGen.get(scope) ?? 0) + 1);
      this.countInvalidation(scope);
      this.dropEntries(`${scope}|`);
    }
  }

  private dropEntries(prefix: string): void {
    for (const key of [...this.entries.keys()]) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
        this.invalidatedKeys.add(key);
      }
    }
    while (this.invalidatedKeys.size > 1000) {
      const oldest = this.invalidatedKeys.values().next().value;
      if (oldest === undefined) break;
      this.invalidatedKeys.delete(oldest);
    }
  }

  private countSource(source: string, times: number): void {
    this.invalidationSources.set(source, (this.invalidationSources.get(source) ?? 0) + times);
  }

  private countInvalidation(scope: CacheScope): void {
    this.scopeInvalidations.set(scope, (this.scopeInvalidations.get(scope) ?? 0) + 1);
    const minute = Math.floor(this.now() / MINUTE_MS);
    let m = this.invalidationMinutes.get(scope);
    if (!m) {
      m = new Map();
      this.invalidationMinutes.set(scope, m);
    }
    m.set(minute, (m.get(minute) ?? 0) + 1);
    this.prune(m, minute);
  }

  // Um caminho que consultou o banco SEM passar pelo cache (ex.: método
  // antigo chamado por outro módulo). Aparece em `bypasses` e vira alerta.
  recordBypass(label: string, scope?: CacheScope): void {
    this.countersFor(label, scope ?? this.labelScope.get(label) ?? 'orders').bypasses += 1;
  }

  // ------------------------------------------------------------ observação

  snapshot() {
    const nowMs = this.now();
    const labels: Record<string, ReturnType<TenantCache['labelReport']>> = {};
    for (const label of [...this.counters.keys()].sort()) labels[label] = this.labelReport(label);

    const scopes: Record<string, ReturnType<TenantCache['scopeReport']>> = {};
    for (const scope of SCOPES) scopes[scope] = this.scopeReport(scope);

    const sum = emptyCounters();
    for (const c of this.counters.values()) {
      sum.hits += c.hits;
      sum.revalidated += c.revalidated;
      sum.coalesced += c.coalesced;
      sum.loads += c.loads;
      sum.fingerprintQueries += c.fingerprintQueries;
      sum.fingerprintBytes += c.fingerprintBytes;
      sum.bypasses += c.bypasses;
      sum.errors += c.errors;
      sum.bytesServedFromCache += c.bytesServedFromCache;
      sum.bytesLoaded += c.bytesLoaded;
    }
    const http = httpCacheMetrics.snapshot();
    let notModified = 0;
    let bytesNotModified = 0;
    for (const h of Object.values(http)) {
      notModified += h.notModified;
      bytesNotModified += h.bytesNotModified;
    }
    const served = sum.hits + sum.revalidated + sum.coalesced;
    const requests = served + sum.loads;
    const mb = (b: number) => Math.round((b / 1024 / 1024) * 100) / 100;
    const counterfactual = sum.bytesServedFromCache + sum.bytesLoaded;

    return {
      generatedAt: new Date(nowMs).toISOString(),
      uptimeSeconds: Math.round((nowMs - this.startedAt) / 1000),
      entries: this.entries.size,
      summary: {
        cacheHits: served,
        cacheMisses: sum.loads,
        requests,
        hitRate: requests > 0 ? this.pct(served, requests) : null,
        // Execuções da consulta pesada que NÃO aconteceram (não é contagem de SQL:
        // um loader pode rodar mais de uma instrução).
        loaderRunsAvoided: served,
        loaderRunsExecuted: sum.loads,
        fingerprintQueries: sum.fingerprintQueries,
        fingerprintMB: mb(sum.fingerprintBytes),
        bypasses: sum.bypasses,
        // Payload (JSON) que deixou de sair do banco porque a resposta veio do cache.
        estimatedPayloadPreventedMB: mb(sum.bytesServedFromCache),
        payloadLoadedFromDbMB: mb(sum.bytesLoaded),
        // Sem cache, cada requisição carregaria o payload do banco: reduction = evitado / (evitado + carregado).
        payloadReductionPercent: counterfactual > 0 ? this.pct(sum.bytesServedFromCache, counterfactual) : null,
        // Respostas 304 (sem corpo): banda Render -> navegador que não trafegou.
        notModifiedResponses: notModified,
        estimatedBandwidthSavedMB: mb(bytesNotModified),
      },
      scopes,
      invalidationsBySource: Object.fromEntries([...this.invalidationSources.entries()].sort((a, b) => b[1] - a[1])),
      endpoints: labels,
      http,
      alerts: this.computeAlerts(nowMs),
      notes: [
        'Contadores zeram quando o processo reinicia (deploy ou Render dormindo): use os logs [CacheSummary] para o histórico.',
        'Bytes são de JSON (o que o backend leu do banco e entregou). O egress real do Postgres é MAIOR (JOIN repete colunas): a razão é confiável, o valor absoluto é um piso.',
        'loaderRunsAvoided conta execuções do loader evitadas, não instruções SQL individuais.',
        'Prova final do egress: página Usage do Supabase e pg_stat_statements (ver protocolo de medição).',
      ],
    };
  }

  private pct(a: number, b: number): number {
    return Math.round((a / b) * 1000) / 10;
  }

  private labelReport(label: string) {
    const c = this.countersFor(label, this.labelScope.get(label) ?? 'orders');
    const served = c.hits + c.revalidated + c.coalesced;
    const requests = served + c.loads;
    const w = this.windowTotals(label, ALERT_LIMITS.windowMinutes, 0);
    return {
      scope: this.labelScope.get(label) ?? null,
      requests,
      hits: c.hits,
      revalidated: c.revalidated,
      coalesced: c.coalesced,
      misses: c.loads,
      hitRate: requests > 0 ? this.pct(served, requests) : null,
      dbLoads: c.loads,
      loadReasons: { ...c.loadReasons },
      discardedStale: c.discardedStale,
      avgLoadMs: c.loads > 0 ? Math.round(c.loadMsTotal / c.loads) : null,
      fingerprintQueries: c.fingerprintQueries,
      bypasses: c.bypasses,
      errors: c.errors,
      payload: {
        lastLoadBytes: c.lastLoadBytes,
        maxLoadBytes: c.maxLoadBytes,
        lastLoadItems: c.lastLoadItems,
        servedFromCacheMB: Math.round((c.bytesServedFromCache / 1024 / 1024) * 100) / 100,
        loadedFromDbMB: Math.round((c.bytesLoaded / 1024 / 1024) * 100) / 100,
      },
      lastWindow: {
        minutes: ALERT_LIMITS.windowMinutes,
        requests: w.requests,
        loads: w.loads,
        hitRate: w.requests > 0 ? this.pct(w.served, w.requests) : null,
      },
    };
  }

  private scopeReport(scope: CacheScope) {
    let hits = 0;
    let revalidated = 0;
    let coalesced = 0;
    let loads = 0;
    let bytesServed = 0;
    let bytesLoaded = 0;
    for (const [label, s] of this.labelScope) {
      if (s !== scope) continue;
      const c = this.counters.get(label);
      if (!c) continue;
      hits += c.hits;
      revalidated += c.revalidated;
      coalesced += c.coalesced;
      loads += c.loads;
      bytesServed += c.bytesServedFromCache;
      bytesLoaded += c.bytesLoaded;
    }
    const served = hits + revalidated + coalesced;
    const requests = served + loads;
    return {
      requests,
      hits: hits + revalidated + coalesced,
      misses: loads,
      hitRate: requests > 0 ? this.pct(served, requests) : null,
      invalidations: this.scopeInvalidations.get(scope) ?? 0,
      dbLoads: loads,
      estimatedPayloadPreventedMB: Math.round((bytesServed / 1024 / 1024) * 100) / 100,
      payloadLoadedFromDbMB: Math.round((bytesLoaded / 1024 / 1024) * 100) / 100,
    };
  }

  resetStats(): void {
    this.counters.clear();
    this.labelScope.clear();
    this.scopeInvalidations.clear();
    this.invalidationSources.clear();
    this.labelMinutes.clear();
    this.invalidationMinutes.clear();
    httpCacheMetrics.reset();
    this.startedAt = this.now();
  }

  // ----------------------------------------------------------------- alertas

  // Janela [fromMinutesAgo .. fromMinutesAgo+minutes) contada de agora para trás.
  private windowTotals(label: string, minutes: number, offsetMinutes: number): MinuteBucket {
    const out: MinuteBucket = { requests: 0, served: 0, loads: 0 };
    const m = this.labelMinutes.get(label);
    if (!m) return out;
    const nowMin = Math.floor(this.now() / MINUTE_MS) - offsetMinutes;
    for (let i = 0; i < minutes; i += 1) {
      const b = m.get(nowMin - i);
      if (b) {
        out.requests += b.requests;
        out.served += b.served;
        out.loads += b.loads;
      }
    }
    return out;
  }

  private invalidationsIn(scope: CacheScope, minutes: number): number {
    const m = this.invalidationMinutes.get(scope);
    if (!m) return 0;
    const nowMin = Math.floor(this.now() / MINUTE_MS);
    let total = 0;
    for (let i = 0; i < minutes; i += 1) total += m.get(nowMin - i) ?? 0;
    return total;
  }

  private computeAlerts(nowMs: number): Alert[] {
    void nowMs;
    const L = ALERT_LIMITS;
    const alerts: Alert[] = [];

    for (const label of this.counters.keys()) {
      const c = this.counters.get(label)!;
      const w10 = this.windowTotals(label, L.windowMinutes, 0);
      if (w10.requests >= L.minRequestsForHitRate) {
        const rate = (w10.served / w10.requests) * 100;
        if (rate < L.minHitRatePercent) {
          alerts.push({
            id: `low_hit_rate:${label}`,
            severity: 'warn',
            label,
            message: `Taxa de acerto de ${label} nos últimos ${L.windowMinutes} min está em ${rate.toFixed(1)}% (mínimo ${L.minHitRatePercent}%).`,
            value: Math.round(rate * 10) / 10,
            threshold: L.minHitRatePercent,
          });
        }
      }

      const loads5 = this.windowTotals(label, 5, 0).loads;
      const prev5 = this.windowTotals(label, 5, 5).loads;
      if (loads5 / 5 >= L.maxLoadsPerMinute) {
        alerts.push({
          id: `cache_not_holding:${label}`,
          severity: 'warn',
          label,
          message: `${label} carregou do banco ${loads5} vezes em 5 min (≥ 1 a cada 5 s): o cache não está segurando.`,
          value: loads5,
          threshold: L.maxLoadsPerMinute * 5,
        });
      } else if (loads5 >= L.riseMinLoads && loads5 >= prev5 * 2) {
        alerts.push({
          id: `misses_rising:${label}`,
          severity: 'warn',
          label,
          message: `Cargas do banco de ${label} subindo: ${loads5} nos últimos 5 min contra ${prev5} nos 5 anteriores.`,
          value: loads5,
          threshold: Math.max(L.riseMinLoads, prev5 * 2),
        });
      }

      if (c.bypasses > 0) {
        alerts.push({
          id: `bypass:${label}`,
          severity: 'warn',
          label,
          message: `${c.bypasses} chamada(s) a ${label} consultaram o banco SEM passar pelo cache.`,
          value: c.bypasses,
          threshold: 0,
        });
      }

      if (label === 'admin-orders' && c.lastLoadBytes > L.adminOrdersPayloadBytes) {
        alerts.push({
          id: `payload_growth:${label}`,
          severity: 'warn',
          label,
          message: `A lista de pedidos do painel já pesa ${(c.lastLoadBytes / 1024 / 1024).toFixed(1)} MB por carga: o histórico está crescendo sem limite.`,
          value: c.lastLoadBytes,
          threshold: L.adminOrdersPayloadBytes,
        });
      }
    }

    for (const scope of SCOPES) {
      const inv5 = this.invalidationsIn(scope, 5);
      if (inv5 / 5 >= L.maxInvalidationsPerMinute) {
        alerts.push({
          id: `excessive_invalidation:${scope}`,
          severity: 'warn',
          label: scope,
          message: `Escopo ${scope} foi invalidado ${inv5} vezes em 5 min: algo está derrubando o cache em excesso.`,
          value: inv5,
          threshold: L.maxInvalidationsPerMinute * 5,
        });
      }
    }

    for (const [label, h] of Object.entries(httpCacheMetrics.snapshot())) {
      if (h.responses >= L.minHttpRequestsForEtagCheck && h.conditional === 0) {
        alerts.push({
          id: `etag_not_used:${label}`,
          severity: 'info',
          label,
          message: `Nenhuma requisição a ${label} chegou com If-None-Match (${h.responses} respostas): o navegador não está revalidando, então o 304 não economiza banda (o cache do banco continua funcionando).`,
          value: h.conditional,
          threshold: 1,
        });
      }
    }
    return alerts;
  }

  // -------------------------------------------------------------- internos

  private bucket(label: string): MinuteBucket {
    const minute = Math.floor(this.now() / MINUTE_MS);
    let m = this.labelMinutes.get(label);
    if (!m) {
      m = new Map();
      this.labelMinutes.set(label, m);
    }
    let b = m.get(minute);
    if (!b) {
      b = { requests: 0, served: 0, loads: 0 };
      m.set(minute, b);
      this.prune(m, minute);
    }
    return b;
  }

  private prune<V>(m: Map<number, V>, nowMinute: number): void {
    if (m.size <= KEEP_MINUTES) return;
    for (const minute of [...m.keys()]) if (minute < nowMinute - KEEP_MINUTES) m.delete(minute);
  }

  private countersFor(label: string, scope: CacheScope): LabelCounters {
    let c = this.counters.get(label);
    if (!c) {
      c = emptyCounters();
      this.counters.set(label, c);
      this.labelScope.set(label, scope);
    }
    return c;
  }

  private keyOf(scope: CacheScope, tenantId: string, variant?: string): string {
    return `${scope}|${tenantId}|${variant ?? ''}`;
  }

  private generationOf(scope: CacheScope, tenantId: string): string {
    return `${this.allGen.get(scope) ?? 0}.${this.tenantGen.get(`${scope}|${tenantId}`) ?? 0}`;
  }

  private store(key: string, entry: Entry<unknown>): void {
    this.entries.delete(key);
    while (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    this.entries.set(key, entry);
  }

  private describe(value: unknown): { etag: string; bytes: number } {
    try {
      const json = JSON.stringify(value) ?? '';
      const hash = createHash('sha1').update(json).digest('hex').slice(0, 20);
      const etag = `W/"${hash}"`;
      const bytes = Buffer.byteLength(json);
      rememberEtag(etag, bytes);
      return { etag, bytes };
    } catch {
      // Não serializável (não deveria acontecer): ETag único, nunca casa com o anterior.
      this.etagCounter += 1;
      return { etag: `W/"u${this.now()}-${this.etagCounter}"`, bytes: 0 };
    }
  }
}
