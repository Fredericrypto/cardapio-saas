// Modo Vitrine — configuração do RESTAURANTE (coluna jsonb tenants.vitrine_settings).
//
// Guarda só REFERÊNCIAS às imagens, nunca cópias de nome/foto/preço:
//   { v: 1, items: [ { k: 'banner' } | { k: 'product', id: '<uuid>' } ] }
// O servidor resolve as referências na leitura (GET /tenants/me/vitrine), então
// produto removido, indisponível ou sem foto some sozinho da vitrine.
//
// Lógica PURA (sem Nest/TypeORM) de propósito: o teste do frontend-admin importa
// este arquivo direto, no mesmo padrão do SIOD (siod-settings.validation.ts).

export const VITRINE_VERSION = 1;
export const VITRINE_MAX_ITEMS = 12;
// Sem seleção salva: banner + as primeiras fotos do cardápio.
export const VITRINE_FALLBACK_PRODUCTS = 8;

export type VitrineItem = { k: 'banner' } | { k: 'product'; id: string };

export interface VitrineSettings {
  v: 1;
  items: VitrineItem[];
}

export type VitrineValidation =
  | { ok: true; value: VitrineSettings }
  | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function onlyKeys(o: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(o).every((k) => allowed.includes(k));
}

function fail(error: string): VitrineValidation {
  return { ok: false, error };
}

// Validação ESTRUTURAL (o PATCH responde 400 se falhar). Normaliza o id para
// minúsculas. Não consulta o banco: id de outro restaurante é inofensivo porque a
// leitura sempre filtra por tenant (ver TenantsService.resolveVitrine).
export function validateVitrineSettings(input: unknown): VitrineValidation {
  if (!isPlainObject(input)) return fail('vitrineSettings deve ser um objeto.');
  if (!onlyKeys(input, ['v', 'items'])) return fail('vitrineSettings tem campos desconhecidos.');
  if (input.v !== VITRINE_VERSION) return fail('Versão de vitrineSettings não suportada.');
  if (!Array.isArray(input.items)) return fail('vitrineSettings.items deve ser uma lista.');
  if (input.items.length > VITRINE_MAX_ITEMS) {
    return fail(`A vitrine aceita no máximo ${VITRINE_MAX_ITEMS} imagens.`);
  }

  const seen = new Set<string>();
  const items: VitrineItem[] = [];
  for (const raw of input.items as unknown[]) {
    if (!isPlainObject(raw)) return fail('Item da vitrine inválido.');
    if (raw.k === 'banner') {
      if (!onlyKeys(raw, ['k'])) return fail('Item "banner" da vitrine tem campos desconhecidos.');
      if (seen.has('banner')) return fail('O banner aparece mais de uma vez na vitrine.');
      seen.add('banner');
      items.push({ k: 'banner' });
      continue;
    }
    if (raw.k === 'product') {
      if (!onlyKeys(raw, ['k', 'id'])) return fail('Item "product" da vitrine tem campos desconhecidos.');
      if (typeof raw.id !== 'string' || !UUID_RE.test(raw.id)) {
        return fail('Item "product" da vitrine precisa de um id (UUID) válido.');
      }
      const id = raw.id.toLowerCase();
      if (seen.has(`p:${id}`)) return fail('Há produto repetido na vitrine.');
      seen.add(`p:${id}`);
      items.push({ k: 'product', id });
      continue;
    }
    return fail('Item da vitrine com tipo inválido.');
  }
  return { ok: true, value: { v: 1, items } };
}

// Leitura tolerante do que está no banco: inválido, corrompido ou vazio = null
// (cai no padrão). Nunca lança.
export function parseStoredVitrine(raw: unknown): VitrineSettings | null {
  const r = validateVitrineSettings(raw);
  return r.ok && r.value.items.length > 0 ? r.value : null;
}

// ---- resolução das referências em slides (pura, testável sem banco) ----

export interface VitrineSlide {
  id: string;
  kind: 'banner' | 'product';
  imageUrl: string;
  name: string | null;
}

export interface VitrineProductRow {
  id: string;
  name: string;
  imageUrl: string | null;
  images: string[] | null;
  isAvailable: boolean;
}

// Capa do item = imageUrl (o service de produtos a mantém igual a images[0]).
export function productCover(row: Pick<VitrineProductRow, 'imageUrl' | 'images'>): string | null {
  return row.imageUrl || row.images?.[0] || null;
}

// `rows` já vem filtrado por tenant e sem soft delete (a consulta garante). Aqui:
//  - com seleção salva: respeita a ORDEM escolhida e descarta o que não resolve
//    (produto removido/indisponível/sem foto; banner sem capa). Se nada resolver,
//    devolve [] — a vitrine simplesmente não abre (não mostra o que não foi escolhido);
//  - sem seleção (null): banner + os produtos recebidos, na ordem recebida.
export function buildVitrineSlides(
  settings: VitrineSettings | null,
  coverImageUrl: string | null,
  rows: VitrineProductRow[],
): VitrineSlide[] {
  const bannerSlide = (): VitrineSlide[] =>
    coverImageUrl ? [{ id: 'banner', kind: 'banner', imageUrl: coverImageUrl, name: null }] : [];

  if (settings && settings.items.length > 0) {
    const byId = new Map(rows.map((r) => [r.id.toLowerCase(), r]));
    const out: VitrineSlide[] = [];
    for (const item of settings.items) {
      if (item.k === 'banner') {
        out.push(...bannerSlide());
        continue;
      }
      const row = byId.get(item.id);
      if (!row || !row.isAvailable) continue;
      const url = productCover(row);
      if (!url) continue;
      out.push({ id: row.id, kind: 'product', imageUrl: url, name: row.name });
    }
    return out;
  }

  const out = bannerSlide();
  for (const row of rows) {
    if (out.length >= VITRINE_FALLBACK_PRODUCTS + 1) break;
    if (!row.isAvailable) continue;
    const url = productCover(row);
    if (!url) continue;
    out.push({ id: row.id, kind: 'product', imageUrl: url, name: row.name });
  }
  return out;
}
