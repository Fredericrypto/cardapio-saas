// Promoções do carrinho: lógica PURA (sem React, sem API, sem storage) do P-01.
//
// Regras congeladas (decisões D1-D5 do P-01):
//  - Promoção NUNCA ativa sozinha. Só uma ação explícita do cliente ativa
//    (activate). Reload, login, troca de unidade, reabertura do navegador e
//    troca mesa/geral NUNCA ativam nada.
//  - `active` (só memória) = o que o cliente ativou NESTA sessão, com o contexto
//    em que ativou. `selectedPromotionIds` (o que as telas leem) é DERIVADO daqui.
//  - `remembered` (disco, até 10) guarda só a INTENÇÃO. Serve apenas para o aviso
//    "Promoção disponível" no carrinho; nunca alimenta `active`.
//  - Contexto = { scope: 'mesa' | 'geral', locationId }. Mesma loja: mesa != geral.
//    NÃO usa qrCodeToken.
//  - Troca de contexto: `active` é descartada da memória; `remembered` permanece.
//    Voltar ao contexto antigo só SUGERE.
//  - Poda: só remove lembradas inválidas do contexto ATUAL; lista que falhou ao
//    carregar nunca poda (validIds = null).
//  - Storage legado (`selectedPromotionIds`) vira `remembered` { scope 'geral',
//    locationId atual } e só sugere.
//  - Convidado: sem dono, nada vai a disco (quem persiste é o CartContext).

export type PromoScope = 'mesa' | 'geral';

export interface PromoContext {
  scope: PromoScope;
  locationId: string;
}

export interface PromoEntry {
  promotionId: string;
  scope: PromoScope;
  locationId: string;
}

export interface PromoState {
  // Contexto atual publicado pelas telas (null até a primeira tela publicar).
  ctx: PromoContext | null;
  // Ativas NESTA sessão (memória). Nunca vêm do disco.
  active: PromoEntry[];
  // Intenção lembrada (disco), do mais antigo para o mais novo. Máx. MAX_REMEMBERED.
  remembered: PromoEntry[];
  // ids do formato antigo ainda sem contexto; viram `remembered` na 1a publicação de contexto.
  legacy: string[];
}

export const MAX_REMEMBERED = 10;

export const EMPTY_PROMO_STATE: PromoState = { ctx: null, active: [], remembered: [], legacy: [] };

const SCOPES: readonly string[] = ['mesa', 'geral'];

export function sameContext(a: PromoContext | null, b: PromoContext | null): boolean {
  if (a == null || b == null) return a === b;
  return a.scope === b.scope && a.locationId === b.locationId;
}

function entryMatches(e: PromoEntry, ctx: PromoContext | null): boolean {
  return ctx != null && e.scope === ctx.scope && e.locationId === ctx.locationId;
}

function sameEntry(a: PromoEntry, b: PromoEntry): boolean {
  return a.promotionId === b.promotionId && a.scope === b.scope && a.locationId === b.locationId;
}

function capRemembered(list: PromoEntry[]): PromoEntry[] {
  return list.length > MAX_REMEMBERED ? list.slice(list.length - MAX_REMEMBERED) : list;
}

// ---------------------------------------------------------------- derivados

// O que as telas leem como "promoções ativas": só entradas do contexto atual,
// sem repetir, na ordem em que o cliente as ativou (a ordem importa no motor).
export function promoSelectedIds(s: PromoState): string[] {
  if (s.ctx == null) return [];
  const out: string[] = [];
  for (const e of s.active) {
    if (entryMatches(e, s.ctx) && !out.includes(e.promotionId)) out.push(e.promotionId);
  }
  return out;
}

// Sugestões (só o Carrinho usa): lembradas do contexto ATUAL, que ainda existem
// na lista carregada, não estão esgotadas para o cliente e não estão ativas.
// A elegibilidade ao carrinho atual é checada por quem chama (motor de promoções).
// Mais recente primeiro.
export function promoSuggestionIds(
  s: Pick<PromoState, 'ctx' | 'remembered'> & { active?: PromoEntry[] },
  promotions: ReadonlyArray<{ id: string; alreadyUsedUp?: boolean }>,
): string[] {
  if (s.ctx == null) return [];
  const active = new Set(promoSelectedIds({ ctx: s.ctx, active: s.active ?? [], remembered: [], legacy: [] }));
  const byId = new Map(promotions.map((p) => [p.id, p]));
  const out: string[] = [];
  for (let i = s.remembered.length - 1; i >= 0; i--) {
    const e = s.remembered[i];
    if (!entryMatches(e, s.ctx)) continue;
    const p = byId.get(e.promotionId);
    if (!p || p.alreadyUsedUp) continue;
    if (active.has(e.promotionId) || out.includes(e.promotionId)) continue;
    out.push(e.promotionId);
  }
  return out;
}

// ---------------------------------------------------------------- transições

// Ação EXPLÍCITA do cliente. Sem contexto publicado não há como ativar (no-op).
export function promoActivate(s: PromoState, promotionId: string): PromoState {
  if (s.ctx == null || !promotionId) return s;
  const entry: PromoEntry = { promotionId, scope: s.ctx.scope, locationId: s.ctx.locationId };
  const alreadyActive = s.active.some((e) => sameEntry(e, entry));
  const active = alreadyActive ? s.active : [...s.active, entry];
  const remembered = capRemembered([...s.remembered.filter((e) => !sameEntry(e, entry)), entry]);
  return { ...s, active, remembered };
}

// Desativação explícita: esquece também a lembrança (o cliente não quer mais).
export function promoDeactivate(s: PromoState, promotionId: string): PromoState {
  if (s.ctx == null) return s;
  const ctx = s.ctx;
  const isThis = (e: PromoEntry) => e.promotionId === promotionId && entryMatches(e, ctx);
  if (!s.active.some(isThis) && !s.remembered.some(isThis)) return s;
  return { ...s, active: s.active.filter((e) => !isThis(e)), remembered: s.remembered.filter((e) => !isThis(e)) };
}

export function promoToggle(s: PromoState, promotionId: string): PromoState {
  return promoSelectedIds(s).includes(promotionId) ? promoDeactivate(s, promotionId) : promoActivate(s, promotionId);
}

// Desliga tudo que está ativo agora, sem esquecer a intenção.
export function promoClearActive(s: PromoState): PromoState {
  return s.active.length === 0 ? s : { ...s, active: [] };
}

// Limpa tudo (logout, 401, pedido concluído): ativas, lembradas e legado.
export function promoClearAll(s: PromoState): PromoState {
  if (s.active.length === 0 && s.remembered.length === 0 && s.legacy.length === 0) return s;
  return { ...s, active: [], remembered: [], legacy: [] };
}

// Legado (ids do formato antigo, sem contexto): assim que existe um contexto, vira
// lembrada { scope 'geral', locationId atual }. Só sugere; nunca ativa.
function resolveLegacy(s: PromoState): PromoState {
  if (s.ctx == null || s.legacy.length === 0) return s;
  const locationId = s.ctx.locationId;
  const converted: PromoEntry[] = s.legacy.map((id) => ({ promotionId: id, scope: 'geral', locationId }));
  const kept = s.remembered.filter((e) => !converted.some((c) => sameEntry(c, e)));
  return { ...s, remembered: capRemembered([...converted, ...kept]), legacy: [] };
}

// Uma tela publicou o contexto em que está. Contexto igual: nada muda.
// Contexto diferente de um contexto anterior: ativas descartadas da memória (D2);
// lembradas intactas. Primeira publicação: resolve o legado (D-legado).
export function promoApplyContext(s: PromoState, ctx: PromoContext): PromoState {
  if (!ctx.locationId || !SCOPES.includes(ctx.scope)) return s;
  if (sameContext(s.ctx, ctx)) return s;
  let next: PromoState = { ...s, ctx: { scope: ctx.scope, locationId: ctx.locationId } };
  if (s.ctx != null) next = { ...next, active: [] };
  next = resolveLegacy(next);
  return next;
}

// Reidratação do disco (login, reload, troca de conta). NUNCA ativa: `active`
// volta vazia (D1). `loaded` null = nada salvo.
export function promoHydrate(
  s: PromoState,
  loaded: { remembered: PromoEntry[]; legacy: string[] } | null,
): PromoState {
  return resolveLegacy({
    ctx: s.ctx,
    active: [],
    remembered: loaded ? loaded.remembered : [],
    legacy: loaded ? loaded.legacy : [],
  });
}

// Poda (D4): remove SÓ do contexto `ctx` (o da lista que foi carregada) o que não
// existe mais nessa lista. validIds = null (falha/lista ainda não carregada) nunca poda.
export function promoPrune(s: PromoState, ctx: PromoContext, validIds: readonly string[] | null): PromoState {
  if (validIds == null) return s;
  const valid = new Set(validIds);
  const dead = (e: PromoEntry) => entryMatches(e, ctx) && !valid.has(e.promotionId);
  if (!s.remembered.some(dead) && !s.active.some(dead)) return s;
  return { ...s, active: s.active.filter((e) => !dead(e)), remembered: s.remembered.filter((e) => !dead(e)) };
}

// ---------------------------------------------------------------- storage

export interface ParsedCart {
  items: unknown[];
  remembered: PromoEntry[];
  legacy: string[];
}

function normalizeRemembered(raw: unknown): PromoEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: PromoEntry[] = [];
  for (const r of raw) {
    if (r == null || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    if (typeof o.promotionId !== 'string' || !o.promotionId) continue;
    if (typeof o.scope !== 'string' || !SCOPES.includes(o.scope)) continue;
    if (typeof o.locationId !== 'string' || !o.locationId) continue;
    const e: PromoEntry = { promotionId: o.promotionId, scope: o.scope as PromoScope, locationId: o.locationId };
    if (!out.some((x) => sameEntry(x, e))) out.push(e);
  }
  return capRemembered(out);
}

function normalizeLegacy(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const id of raw) if (typeof id === 'string' && id && !out.includes(id)) out.push(id);
  return out;
}

// Lê o JSON salvo. Aceita o formato antigo ({items, selectedPromotionIds}) e o
// novo ({v:2, items, remembered, legacy?}). Lixo/JSON inválido => null (carrinho
// abre vazio, sem lançar). NUNCA devolve nada como "ativo".
export function parsePersistedCart(raw: string | null): ParsedCart | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed == null || typeof parsed !== 'object') return null;
  const o = parsed as Record<string, unknown>;
  if (!Array.isArray(o.items)) return null;
  const items = o.items.filter((i) => i != null && typeof i === 'object');
  if (o.v === 2) {
    return { items, remembered: normalizeRemembered(o.remembered), legacy: normalizeLegacy(o.legacy) };
  }
  return { items, remembered: [], legacy: normalizeLegacy(o.selectedPromotionIds) };
}

export function serializeCart(items: unknown[], s: Pick<PromoState, 'remembered' | 'legacy'>): string {
  return JSON.stringify({ v: 2, items, remembered: s.remembered, legacy: s.legacy });
}
