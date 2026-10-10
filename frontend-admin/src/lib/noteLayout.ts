import type { LayoutItem, Note } from '../types/notes';

// Motor de layout das anotações — funções PURAS (testadas em
// test/noteLayout.test.ts), sem React nem DOM.
//
// REGRAS
//  1. Zero sobreposição: depois de qualquer gesto (arrastar, fixar, desafixar,
//     reordenar) nenhum retângulo cobre outro.
//  2. Fixadas formam uma "prateleira" no topo, da esquerda para a direita
//     (Pin 1, Pin 2, ... Pin N), na ordem de `sortOrder`. As posições dos Pins
//     são DERIVADAS dessa ordem — nunca dependem de x/y salvos.
//  3. Notas soltas ficam onde o usuário largou; quem estiver no caminho é
//     empurrado (para o lado ou para baixo), em cascata, como no Trello/tela
//     inicial do iOS. O Pin e a nota arrastada nunca cedem lugar.
//  4. Desafixar tira a nota da prateleira (os Pins seguintes andam para a
//     esquerda) e a devolve à área comum, no primeiro espaço livre.

export const GAP = 20;
export const HEADER_H = 44; // altura da nota minimizada (só o cabeçalho)

export interface Rect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

type Layoutable = Pick<Note, 'id' | 'posX' | 'posY' | 'width' | 'height' | 'isMinimized'>;

export const displayHeight = (n: Pick<Note, 'isMinimized' | 'height'>): number => (n.isMinimized ? HEADER_H : n.height);

export function toRect(n: Layoutable): Rect {
  return { id: n.id, x: n.posX, y: n.posY, w: n.width, h: displayHeight(n) };
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function hasOverlap(rects: Rect[]): boolean {
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) if (overlaps(rects[i], rects[j])) return true;
  }
  return false;
}

// ---- prateleira de Pins ----------------------------------------------------

const byOrder = (a: Note, b: Note) =>
  a.sortOrder - b.sortOrder || +new Date(b.createdAt) - +new Date(a.createdAt) || a.id.localeCompare(b.id);

export const orderedPinned = (notes: Note[]): Note[] => notes.filter((n) => n.isPinned).sort(byOrder);
export const orderedLoose = (notes: Note[]): Note[] => notes.filter((n) => !n.isPinned).sort(byOrder);

// Slots da prateleira: esquerda -> direita, quebrando de linha quando não cabe.
export function layoutShelf(pinned: Rect[], boardW: number): { rects: Rect[]; bottom: number } {
  const rects: Rect[] = [];
  let x = GAP;
  let y = GAP;
  let rowH = 0;
  for (const r of pinned) {
    if (x > GAP && x + r.w > boardW - GAP) {
      x = GAP;
      y += rowH + GAP;
      rowH = 0;
    }
    rects.push({ ...r, x, y });
    x += r.w + GAP;
    rowH = Math.max(rowH, r.h);
  }
  return { rects, bottom: pinned.length > 0 ? y + rowH : 0 };
}

// ---- resolução de colisões -------------------------------------------------

function pushAway(mover: Rect, victim: Rect, boardW: number, hint: 'x' | 'y' | 'auto'): void {
  const overlapX = Math.min(mover.x + mover.w, victim.x + victim.w) - Math.max(mover.x, victim.x);
  const overlapY = Math.min(mover.y + mover.h, victim.y + victim.h) - Math.max(mover.y, victim.y);
  const horizontal = hint === 'x' ? true : hint === 'y' ? false : overlapX <= overlapY;
  if (horizontal) {
    const toRight = victim.x + victim.w / 2 >= mover.x + mover.w / 2;
    const nx = toRight ? mover.x + mover.w + GAP : mover.x - GAP - victim.w;
    if (nx >= 0 && nx + victim.w <= boardW) {
      victim.x = nx;
      return;
    }
  }
  const below = victim.y + victim.h / 2 >= mover.y + mover.h / 2;
  const ny = below ? mover.y + mover.h + GAP : mover.y - GAP - victim.h;
  victim.y = !below && ny >= 0 ? ny : mover.y + mover.h + GAP;
}

// Garantia final: tudo que ainda colide desce até achar vão livre. Só move
// para baixo, então sempre termina e o resultado nunca tem sobreposição.
function sweepDown(rects: Rect[], anchors: ReadonlySet<string>): void {
  const placed: Rect[] = rects.filter((r) => anchors.has(r.id));
  const rest = rects.filter((r) => !anchors.has(r.id)).sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
  for (const r of rest) {
    for (;;) {
      const hit = placed.find((p) => overlaps(p, r));
      if (!hit) break;
      r.y = hit.y + hit.h + GAP;
    }
    placed.push(r);
  }
}

// `anchors` não se mexem e empurram quem cruzar o caminho (em cascata).
export function resolveOverlaps(
  input: Rect[],
  anchors: ReadonlySet<string>,
  boardW: number,
  hint: 'x' | 'y' | 'auto' = 'auto',
): Rect[] {
  const items = input.map((r) => ({ ...r }));
  const queue = items.filter((r) => anchors.has(r.id));
  let guard = 0;
  while (queue.length > 0 && guard++ < 4000) {
    const mover = queue.shift()!;
    for (const other of items) {
      if (other.id === mover.id || anchors.has(other.id) || !overlaps(mover, other)) continue;
      pushAway(mover, other, boardW, hint);
      queue.push(other);
    }
  }
  if (hasOverlap(items)) sweepDown(items, anchors);
  return items;
}

// ---- layout exibido no quadro ---------------------------------------------

// Posições a DESENHAR: Pins nos slots da prateleira; soltas onde estão, mas
// empurradas para fora de qualquer colisão (inclusive dados antigos que já
// estavam sobrepostos). Determinístico: o mesmo dado dá sempre o mesmo desenho.
export function computeBoardLayout(notes: Note[], boardW: number): Map<string, Rect> {
  const pinned = orderedPinned(notes).map(toRect);
  const shelf = layoutShelf(pinned, boardW);
  const loose = orderedLoose(notes).map(toRect);
  const resolved = resolveOverlaps([...shelf.rects, ...loose], new Set(shelf.rects.map((r) => r.id)), boardW);
  // soltas não podem ficar acima da base da prateleira se a cruzam — já tratado
  // pelo resolveOverlaps; garante também que nenhuma ocupe a faixa dos Pins.
  return new Map(resolved.map((r) => [r.id, r]));
}

// Diferença entre o desenho e o que está salvo -> itens a enviar ao servidor.
function diffItems(notes: Note[], layout: Map<string, Rect>, extra: Map<string, Partial<LayoutItem>> = new Map()): LayoutItem[] {
  const items: LayoutItem[] = [];
  for (const n of notes) {
    const r = layout.get(n.id);
    const more = extra.get(n.id);
    const moved = r && (Math.round(r.x) !== n.posX || Math.round(r.y) !== n.posY);
    if (!moved && !more) continue;
    const item: LayoutItem = { id: n.id, ...more };
    if (r && moved) {
      item.posX = Math.max(0, Math.round(r.x));
      item.posY = Math.max(0, Math.round(r.y));
    }
    items.push(item);
  }
  return items;
}

// ---- gestos ----------------------------------------------------------------

export interface DropPoint {
  x: number;
  y: number;
}

// Largou uma nota SOLTA em `drop` (canto superior esquerdo). Quem estava ali é
// empurrado; se cair em cima da prateleira, a nota desliza para logo abaixo.
export function previewLooseDrop(
  notes: Note[],
  movedId: string,
  drop: DropPoint,
  boardW: number,
  hint: 'x' | 'y' | 'auto' = 'auto',
): Map<string, Rect> {
  const base = computeBoardLayout(notes, boardW);
  const pins = orderedPinned(notes).map((n) => base.get(n.id)!);
  const moved = { ...base.get(movedId)! };
  moved.x = Math.min(Math.max(0, drop.x), Math.max(0, boardW - moved.w));
  moved.y = Math.max(0, drop.y);
  const shelfBottom = pins.length ? Math.max(...pins.map((p) => p.y + p.h)) : 0;
  if (pins.some((p) => overlaps(p, moved))) moved.y = shelfBottom + GAP;
  const anchors = new Set([movedId, ...pins.map((p) => p.id)]);
  const others = [...base.values()].filter((r) => r.id !== movedId);
  const resolved = resolveOverlaps([...others, moved], anchors, boardW, hint);
  return new Map(resolved.map((r) => [r.id, r]));
}

export function dropLoose(notes: Note[], movedId: string, drop: DropPoint, boardW: number, hint: 'x' | 'y' | 'auto' = 'auto'): LayoutItem[] {
  return diffItems(notes, previewLooseDrop(notes, movedId, drop, boardW, hint));
}

// Arrastou um PIN: ele só troca de slot (os demais Pins deslizam). Vence o slot
// cujo retângulo fica mais perto do ponto de soltura.
export function pinInsertIndex(notes: Note[], movedId: string, drop: DropPoint, boardW: number): number {
  const pinned = orderedPinned(notes);
  const moved = pinned.find((n) => n.id === movedId);
  if (!moved) return 0;
  const rest = pinned.filter((n) => n.id !== movedId);
  const cx = drop.x + moved.width / 2;
  const cy = drop.y + displayHeight(moved) / 2;
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i <= rest.length; i++) {
    const order = [...rest.slice(0, i), moved, ...rest.slice(i)];
    const slot = layoutShelf(order.map(toRect), boardW).rects[i];
    const d = (slot.x + slot.w / 2 - cx) ** 2 + (slot.y + slot.h / 2 - cy) ** 2;
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  return best;
}

function withPinOrder(notes: Note[], order: Note[]): { notes: Note[]; extra: Map<string, Partial<LayoutItem>> } {
  const extra = new Map<string, Partial<LayoutItem>>();
  const rank = new Map(order.map((n, i) => [n.id, i]));
  const next = notes.map((n) => {
    const i = rank.get(n.id);
    if (i === undefined) return n;
    if (n.sortOrder !== i || !n.isPinned) extra.set(n.id, { sortOrder: i, isPinned: true });
    return { ...n, sortOrder: i, isPinned: true };
  });
  return { notes: next, extra };
}

// Pin arrastado para outro slot.
export function reorderPin(notes: Note[], movedId: string, drop: DropPoint, boardW: number): LayoutItem[] {
  const pinned = orderedPinned(notes);
  const moved = pinned.find((n) => n.id === movedId);
  if (!moved) return [];
  const rest = pinned.filter((n) => n.id !== movedId);
  const index = pinInsertIndex(notes, movedId, drop, boardW);
  const order = [...rest.slice(0, index), moved, ...rest.slice(index)];
  const { notes: next, extra } = withPinOrder(notes, order);
  // só envia sortOrder se mudou de fato
  for (const [id, e] of [...extra]) if (notes.find((n) => n.id === id)?.isPinned) delete e.isPinned;
  return diffItems(notes, computeBoardLayout(next, boardW), extra);
}

// Clique no Pin de uma nota solta: vai para o primeiro slot livre da
// prateleira (depois do último Pin). Quem estava no lugar é empurrado.
export function pinNote(notes: Note[], id: string, boardW: number): LayoutItem[] {
  const target = notes.find((n) => n.id === id);
  if (!target || target.isPinned) return [];
  const order = [...orderedPinned(notes), target];
  const { notes: next, extra } = withPinOrder(notes, order);
  return diffItems(notes, computeBoardLayout(next, boardW), extra);
}

// Clique no PinOff: sai da prateleira (Pins seguintes avançam um slot) e volta
// à área comum, no primeiro espaço livre abaixo da prateleira, como a PRIMEIRA
// das soltas na ordem do modo Cards.
export function unpinNote(notes: Note[], id: string, boardW: number): LayoutItem[] {
  const target = notes.find((n) => n.id === id);
  if (!target || !target.isPinned) return [];
  const remaining = orderedPinned(notes).filter((n) => n.id !== id);
  const extra = new Map<string, Partial<LayoutItem>>();
  remaining.forEach((n, i) => {
    if (n.sortOrder !== i) extra.set(n.id, { sortOrder: i });
  });
  const minLoose = orderedLoose(notes).reduce((m, n) => Math.min(m, n.sortOrder), 1);
  const sortOrder = minLoose - 1;
  extra.set(id, { isPinned: false, sortOrder });

  const next = notes.map((n) => {
    if (n.id === id) return { ...n, isPinned: false, sortOrder };
    const e = extra.get(n.id);
    return e?.sortOrder !== undefined ? { ...n, sortOrder: e.sortOrder } : n;
  });
  const shelf = layoutShelf(orderedPinned(next).map(toRect), boardW);
  const others = orderedLoose(next).filter((n) => n.id !== id).map(toRect);
  const placedOthers = resolveOverlaps(
    [...shelf.rects, ...others],
    new Set(shelf.rects.map((r) => r.id)),
    boardW,
  ).filter((r) => !shelf.rects.some((s) => s.id === r.id));
  const size = toRect(next.find((n) => n.id === id)!);
  const spot = findFreeSpot([...shelf.rects, ...placedOthers], size.w, size.h, boardW, shelf.bottom > 0 ? shelf.bottom + GAP : GAP);
  const layout = new Map<string, Rect>([...shelf.rects, ...placedOthers, { ...size, ...spot }].map((r) => [r.id, r]));
  return diffItems(notes, layout, extra);
}

// Primeiro espaço livre, varrendo da esquerda para a direita e de cima para baixo.
export function findFreeSpot(rects: Rect[], w: number, h: number, boardW: number, startY: number): { x: number; y: number } {
  const stepX = 20;
  const stepY = 20;
  const maxX = Math.max(GAP, boardW - w);
  for (let y = startY; y < startY + 20000; y += stepY) {
    for (let x = GAP; x <= maxX; x += stepX) {
      const probe: Rect = { id: '__probe__', x, y, w, h };
      if (!rects.some((r) => overlaps(r, probe))) return { x, y };
    }
  }
  return { x: GAP, y: Math.max(startY, ...rects.map((r) => r.y + r.h + GAP)) };
}

// ---- modo Cards (lista) ----------------------------------------------------

// Ordem exibida no modo Cards: Pins primeiro (Pin 1..N), depois as soltas.
export function cardsOrder(notes: Note[]): Note[] {
  return [...orderedPinned(notes), ...orderedLoose(notes)];
}

// Move `activeId` para a posição de `overId`, DENTRO do mesmo grupo (Pin com
// Pin, solta com solta). Quem está no meio desliza. Devolve só os sortOrder
// que mudaram.
export function reorderCards(notes: Note[], activeId: string, overId: string): LayoutItem[] {
  const active = notes.find((n) => n.id === activeId);
  const over = notes.find((n) => n.id === overId);
  if (!active || !over || active.id === over.id || active.isPinned !== over.isPinned) return [];
  const group = active.isPinned ? orderedPinned(notes) : orderedLoose(notes);
  const from = group.findIndex((n) => n.id === activeId);
  const to = group.findIndex((n) => n.id === overId);
  const next = [...group];
  next.splice(from, 1);
  next.splice(to, 0, active);
  const items: LayoutItem[] = [];
  next.forEach((n, i) => {
    if (n.sortOrder !== i) items.push({ id: n.id, sortOrder: i });
  });
  return items;
}

// Aplica itens de layout localmente (atualização otimista).
export function applyLayoutItems(notes: Note[], items: LayoutItem[]): Note[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  return notes.map((n) => {
    const i = byId.get(n.id);
    if (!i) return n;
    return {
      ...n,
      ...(i.posX !== undefined && { posX: i.posX }),
      ...(i.posY !== undefined && { posY: i.posY }),
      ...(i.width !== undefined && { width: i.width }),
      ...(i.height !== undefined && { height: i.height }),
      ...(i.isPinned !== undefined && { isPinned: i.isPinned }),
      ...(i.sortOrder !== undefined && { sortOrder: i.sortOrder }),
    };
  });
}

// ---- redimensionar ---------------------------------------------------------

// Prévia ao redimensionar: a nota em redimensionamento não cede; as vizinhas
// deslizam. (Pin redimensionado muda o tamanho do slot: a prateleira se refaz.)
export function previewResize(notes: Note[], id: string, size: { w: number; h: number }, boardW: number): Map<string, Rect> {
  const target = notes.find((n) => n.id === id);
  if (!target) return computeBoardLayout(notes, boardW);
  const resized = notes.map((n) => (n.id === id ? { ...n, width: size.w, height: size.h } : n));
  if (target.isPinned) return computeBoardLayout(resized, boardW);
  const base = computeBoardLayout(resized, boardW);
  const pins = orderedPinned(resized).map((n) => base.get(n.id)!);
  const mover = { ...base.get(id)!, w: size.w, h: target.isMinimized ? HEADER_H : size.h };
  mover.x = Math.min(mover.x, Math.max(0, boardW - mover.w));
  const anchors = new Set([id, ...pins.map((p) => p.id)]);
  const resolved = resolveOverlaps([...[...base.values()].filter((r) => r.id !== id), mover], anchors, boardW);
  return new Map(resolved.map((r) => [r.id, r]));
}

export function resizeItems(notes: Note[], id: string, size: { w: number; h: number }, boardW: number): LayoutItem[] {
  const layout = previewResize(notes, id, size, boardW);
  const items = diffItems(notes, layout, new Map([[id, { width: Math.round(size.w), height: Math.round(size.h) }]]));
  return items;
}

// ---- prévia ao arrastar um Pin / organizar --------------------------------

// Durante o arraste de um Pin: os outros Pins já deslizam para a nova ordem.
export function previewPinReorder(notes: Note[], movedId: string, drop: DropPoint, boardW: number): Map<string, Rect> {
  const pinned = orderedPinned(notes);
  const moved = pinned.find((n) => n.id === movedId);
  if (!moved) return computeBoardLayout(notes, boardW);
  const rest = pinned.filter((n) => n.id !== movedId);
  const index = pinInsertIndex(notes, movedId, drop, boardW);
  const order = [...rest.slice(0, index), moved, ...rest.slice(index)];
  const rank = new Map(order.map((n, i) => [n.id, i]));
  return computeBoardLayout(
    notes.map((n) => (rank.has(n.id) ? { ...n, sortOrder: rank.get(n.id)! } : n)),
    boardW,
  );
}

// "Organizar": Pins ficam na prateleira; as soltas são alinhadas em grade logo
// abaixo, na ordem do modo Cards, como ícones da área de trabalho.
export function arrangeItems(notes: Note[], boardW: number): LayoutItem[] {
  const shelf = layoutShelf(orderedPinned(notes).map(toRect), boardW);
  const loose = orderedLoose(notes).map(toRect);
  const layout = new Map<string, Rect>(shelf.rects.map((r) => [r.id, r]));
  if (loose.length > 0) {
    const cellW = Math.max(...loose.map((r) => r.w)) + GAP;
    const cols = Math.max(1, Math.floor((boardW - GAP) / cellW));
    let y = shelf.bottom > 0 ? shelf.bottom + GAP : GAP;
    for (let i = 0; i < loose.length; i += cols) {
      const row = loose.slice(i, i + cols);
      row.forEach((r, c) => layout.set(r.id, { ...r, x: GAP + c * cellW, y }));
      y += Math.max(...row.map((r) => r.h)) + GAP;
    }
  }
  return diffItems(notes, layout);
}

// Ordem do modo Cards DURANTE o arraste (prévia): o card ativo já aparece na
// posição do alvo e os do meio deslizam. Mesmo grupo apenas.
export function previewCardsOrder(notes: Note[], activeId: string, overId: string | null): Note[] {
  const full = cardsOrder(notes);
  const active = full.find((n) => n.id === activeId);
  const over = overId ? full.find((n) => n.id === overId) : undefined;
  if (!active || !over || active.id === over.id || active.isPinned !== over.isPinned) return full;
  const group = full.filter((n) => n.isPinned === active.isPinned);
  const from = group.findIndex((n) => n.id === activeId);
  const to = group.findIndex((n) => n.id === overId);
  const moved = [...group];
  moved.splice(from, 1);
  moved.splice(to, 0, active);
  return active.isPinned ? [...moved, ...full.filter((n) => !n.isPinned)] : [...full.filter((n) => n.isPinned), ...moved];
}
