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
}

export type CacheSource = 'hit' | 'revalidated' | 'miss' | 'coalesced';

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

export interface ScopeStats {
  hits: number;
  revalidated: number;
  misses: number;
  coalesced: number;
  loads: number;
  invalidations: number;
  fingerprintQueries: number;
  discardedStale: number;
  errors: number;
  bytesServedFromCache: number;
  bytesLoaded: number;
  loadMsTotal: number;
}

const emptyStats = (): ScopeStats => ({
  hits: 0,
  revalidated: 0,
  misses: 0,
  coalesced: 0,
  loads: 0,
  invalidations: 0,
  fingerprintQueries: 0,
  discardedStale: 0,
  errors: 0,
  bytesServedFromCache: 0,
  bytesLoaded: 0,
  loadMsTotal: 0,
});

const SCOPES: CacheScope[] = ['orders', 'tables', 'products'];

export class TenantCache {
  private readonly entries = new Map<string, Entry<unknown>>();
  private readonly inflight = new Map<string, Inflight>();
  private readonly tenantGen = new Map<string, number>();
  private readonly allGen = new Map<CacheScope, number>();
  private readonly stats = new Map<CacheScope, ScopeStats>();
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
    const key = this.keyOf(scope, tenantId, opts.variant);
    const stats = this.statsFor(scope);
    const generation = this.generationOf(scope, tenantId);
    const now = this.now();
    const entry = this.entries.get(key) as Entry<T> | undefined;

    if (entry && entry.generation === generation && now - entry.loadedAt < opts.maxAgeMs) {
      const every = opts.fingerprintEveryMs ?? 0;
      if (!opts.fingerprint || now - entry.checkedAt < every) {
        return this.serve(entry, stats, 'hit');
      }
      try {
        stats.fingerprintQueries += 1;
        const current = await opts.fingerprint();
        if (
          current === entry.fingerprint &&
          this.entries.get(key) === entry &&
          entry.generation === this.generationOf(scope, tenantId)
        ) {
          entry.checkedAt = this.now();
          return this.serve(entry, stats, 'revalidated');
        }
      } catch {
        // Conferência falhou: na dúvida, recarrega de verdade (nunca serve às cegas).
        stats.errors += 1;
      }
    }

    return this.load(key, scope, tenantId, generation, loader, opts, stats);
  }

  private serve<T>(entry: Entry<T>, stats: ScopeStats, source: 'hit' | 'revalidated'): CacheResult<T> {
    if (source === 'hit') stats.hits += 1;
    else stats.revalidated += 1;
    stats.bytesServedFromCache += entry.bytes;
    return { value: entry.value, etag: entry.etag, source };
  }

  private async load<T>(
    key: string,
    scope: CacheScope,
    tenantId: string,
    generation: string,
    loader: () => Promise<T>,
    opts: CacheOptions,
    stats: ScopeStats,
  ): Promise<CacheResult<T>> {
    const running = this.inflight.get(key);
    if (running && running.generation === generation) {
      stats.coalesced += 1;
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
          stats.fingerprintQueries += 1;
          fingerprint = await opts.fingerprint();
        } catch {
          stats.errors += 1;
        }
      }
      const value = await loader();
      const { etag, bytes } = this.describe(value);
      const loadedAt = this.now();
      stats.misses += 1;
      stats.loads += 1;
      stats.bytesLoaded += bytes;
      stats.loadMsTotal += loadedAt - startedAt;

      // Se houve invalidação enquanto carregava, o dado pode já estar velho:
      // devolve a quem pediu, mas NÃO guarda.
      if (this.generationOf(scope, tenantId) === generation) {
        this.store(key, { value, etag, bytes, fingerprint, loadedAt, checkedAt: loadedAt, generation });
      } else {
        stats.discardedStale += 1;
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

  invalidate(tenantId: string, scopes: CacheScope | CacheScope[]): void {
    for (const scope of Array.isArray(scopes) ? scopes : [scopes]) {
      const gk = `${scope}|${tenantId}`;
      this.tenantGen.set(gk, (this.tenantGen.get(gk) ?? 0) + 1);
      this.statsFor(scope).invalidations += 1;
      const prefix = `${gk}|`;
      for (const key of [...this.entries.keys()]) {
        if (key.startsWith(prefix)) this.entries.delete(key);
      }
    }
  }

  invalidateAll(scopes: CacheScope | CacheScope[] = SCOPES): void {
    for (const scope of Array.isArray(scopes) ? scopes : [scopes]) {
      this.allGen.set(scope, (this.allGen.get(scope) ?? 0) + 1);
      this.statsFor(scope).invalidations += 1;
      const prefix = `${scope}|`;
      for (const key of [...this.entries.keys()]) {
        if (key.startsWith(prefix)) this.entries.delete(key);
      }
    }
  }

  // ------------------------------------------------------------ observação

  snapshot() {
    const scopes: Record<string, ScopeStats & { hitRate: number | null }> = {};
    const total = emptyStats();
    for (const scope of SCOPES) {
      const s = this.statsFor(scope);
      const served = s.hits + s.revalidated;
      const requests = served + s.misses + s.coalesced;
      scopes[scope] = { ...s, hitRate: requests > 0 ? Math.round(((served + s.coalesced) / requests) * 1000) / 10 : null };
      for (const k of Object.keys(total) as Array<keyof ScopeStats>) total[k] += s[k];
    }
    const served = total.hits + total.revalidated;
    const requests = served + total.misses + total.coalesced;
    return {
      uptimeSeconds: Math.round((this.now() - this.startedAt) / 1000),
      entries: this.entries.size,
      total: {
        ...total,
        requests,
        hitRate: requests > 0 ? Math.round(((served + total.coalesced) / requests) * 1000) / 10 : null,
        // Bytes de JSON que NÃO precisaram sair do banco. É um piso: o egress real
        // do Postgres é maior (linhas de JOIN repetem colunas do pedido).
        estimatedBytesAvoided: total.bytesServedFromCache,
      },
      scopes,
    };
  }

  resetStats(): void {
    this.stats.clear();
    this.startedAt = this.now();
  }

  // -------------------------------------------------------------- internos

  private keyOf(scope: CacheScope, tenantId: string, variant?: string): string {
    return `${scope}|${tenantId}|${variant ?? ''}`;
  }

  private generationOf(scope: CacheScope, tenantId: string): string {
    return `${this.allGen.get(scope) ?? 0}.${this.tenantGen.get(`${scope}|${tenantId}`) ?? 0}`;
  }

  private statsFor(scope: CacheScope): ScopeStats {
    let s = this.stats.get(scope);
    if (!s) {
      s = emptyStats();
      this.stats.set(scope, s);
    }
    return s;
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
      return { etag: `W/"${hash}"`, bytes: Buffer.byteLength(json) };
    } catch {
      // Não serializável (não deveria acontecer): ETag único, nunca casa com o anterior.
      this.etagCounter += 1;
      return { etag: `W/"u${this.now()}-${this.etagCounter}"`, bytes: 0 };
    }
  }
}
