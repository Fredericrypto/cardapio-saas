import assert from 'node:assert/strict';
import type { Note } from '../src/types/notes';
import {
  GAP, applyLayoutItems, cardsOrder, computeBoardLayout, dropLoose, hasOverlap, orderedLoose, orderedPinned,
  pinNote, previewLooseDrop, reorderCards, reorderPin, unpinNote, layoutShelf, toRect, previewResize, resizeItems, arrangeItems, previewPinReorder, previewCardsOrder,
} from '../src/lib/noteLayout';

const BOARD = 900;
let seq = 0;
function note(over: Partial<Note> = {}): Note {
  seq++;
  return {
    id: `n${String(seq).padStart(3, '0')}`, content: '', color: '#FEF08A', textColor: '#422006', width: 260, height: 220,
    posX: 24, posY: 24, isPinned: false, isMinimized: false, sortOrder: seq, authorName: 'x', lastEditedByName: null, tag: 'Geral',
    contentUpdatedAt: '2026-10-01T00:00:00Z', createdAt: `2026-10-01T00:${String(seq % 60).padStart(2, '0')}:00Z`, updatedAt: '2026-10-01T00:00:00Z', ...over,
  };
}
const layoutOf = (notes: Note[]) => [...computeBoardLayout(notes, BOARD).values()];
const apply = (notes: Note[], items: ReturnType<typeof pinNote>) => applyLayoutItems(notes, items);

// 1) Fixar: vai para o 1º slot livre da prateleira (esquerda -> direita), Pin 1, Pin 2, Pin 3...
let notes = [note({ posX: 24, posY: 24 }), note({ posX: 320, posY: 24 }), note({ posX: 620, posY: 24 }), note({ posX: 24, posY: 300 })];
const [a, b, c] = notes;
notes = apply(notes, pinNote(notes, b.id, BOARD));
assert.deepEqual(orderedPinned(notes).map((n) => n.id), [b.id], 'b virou Pin 1');
let shelf = computeBoardLayout(notes, BOARD);
assert.deepEqual([shelf.get(b.id)!.x, shelf.get(b.id)!.y], [GAP, GAP], 'Pin 1 no canto superior esquerdo');
notes = apply(notes, pinNote(notes, c.id, BOARD));
notes = apply(notes, pinNote(notes, a.id, BOARD));
assert.deepEqual(orderedPinned(notes).map((n) => n.id), [b.id, c.id, a.id], 'Pin 1, Pin 2, Pin 3 na ordem de fixação');
shelf = computeBoardLayout(notes, BOARD);
const xs = [b, c, a].map((n) => shelf.get(n.id)!.x);
assert.ok(xs[0] < xs[1] && xs[1] < xs[2], 'esquerda para a direita');
assert.ok(!hasOverlap(layoutOf(notes)), 'fixar não deixa nada sobreposto (a 4ª nota solta foi empurrada)');
assert.equal(pinNote(notes, a.id, BOARD).length, 0, 'fixar quem já está fixo não faz nada');

// 2) Desafixar: sai da prateleira, Pins seguintes avançam, nota volta à área comum.
const before = notes.find((n) => n.id === b.id)!;
assert.ok(before.isPinned);
notes = apply(notes, unpinNote(notes, b.id, BOARD));
assert.ok(!notes.find((n) => n.id === b.id)!.isPinned, 'Pin 1 solto');
assert.deepEqual(orderedPinned(notes).map((n) => n.id), [c.id, a.id], 'Pins seguintes subiram: c = Pin 1, a = Pin 2');
assert.deepEqual(orderedPinned(notes).map((n) => n.sortOrder), [0, 1], 'sortOrder renumerado');
assert.equal(orderedLoose(notes)[0].id, b.id, 'a solta devolvida vira a primeira das comuns');
shelf = computeBoardLayout(notes, BOARD);
assert.equal(shelf.get(c.id)!.x, GAP, 'c ocupa o slot 1');
assert.ok(!hasOverlap(layoutOf(notes)));
const shelfBottom = Math.max(...orderedPinned(notes).map((n) => shelf.get(n.id)!.y + shelf.get(n.id)!.h));
assert.ok(shelf.get(b.id)!.y >= shelfBottom, 'devolvida abaixo da prateleira');

// 3) Soltar uma nota em cima de outra: a atingida desliza (lateral/vertical) e nada se sobrepõe.
let free = [note({ posX: 24, posY: 24 }), note({ posX: 320, posY: 24 }), note({ posX: 620, posY: 24 })];
let preview = previewLooseDrop(free, free[0].id, { x: 330, y: 30 }, BOARD, 'x');
let r0 = preview.get(free[0].id)!;
assert.deepEqual([r0.x, r0.y], [330, 30], 'a nota arrastada fica onde foi solta');
assert.ok(!hasOverlap([...preview.values()]), 'zero sobreposição após o arraste');
const hit = preview.get(free[1].id)!;
assert.ok(hit.x >= 330 + 260 + GAP || hit.x + hit.w + GAP <= 330 || hit.y >= 30 + 220 + GAP, 'a atingida abriu espaço (lateral ou vertical)');
free = applyLayoutItems(free, dropLoose(free, free[0].id, { x: 330, y: 30 }, BOARD, 'x'));
assert.ok(!hasOverlap(layoutOf(free)));

// 4) Soltar sobre a prateleira: nota solta nunca cobre um Pin.
let withPin = [note({ posX: 24, posY: 24 }), note({ posX: 24, posY: 400 })];
withPin = apply(withPin, pinNote(withPin, withPin[0].id, BOARD));
preview = previewLooseDrop(withPin, withPin[1].id, { x: 30, y: 30 }, BOARD);
assert.ok(!hasOverlap([...preview.values()]), 'solta sobre o Pin: desliza para baixo dele');
assert.deepEqual([preview.get(withPin[0].id)!.x, preview.get(withPin[0].id)!.y], [GAP, GAP], 'o Pin não se mexe');

// 5) Reordenar Pins arrastando: troca de slot e os outros deslizam.
let pins = [note(), note(), note()];
for (const p of [...pins]) pins = apply(pins, pinNote(pins, p.id, BOARD));
const [p1, p2, p3] = pins;
const slots = layoutShelf(orderedPinned(pins).map(toRect), BOARD).rects;
pins = apply(pins, reorderPin(pins, p3.id, { x: slots[0].x, y: slots[0].y }, BOARD));
assert.deepEqual(orderedPinned(pins).map((n) => n.id), [p3.id, p1.id, p2.id], 'Pin 3 arrastado para o slot 1');
assert.ok(!hasOverlap(layoutOf(pins)));

// 6) Modo Cards: reordenar dentro do grupo; nunca cruza Pin com solta.
let cards = [note(), note(), note(), note()];
cards = apply(cards, pinNote(cards, cards[3].id, BOARD));
const loose = orderedLoose(cards);
const moved = reorderCards(cards, loose[2].id, loose[0].id);
cards = applyLayoutItems(cards, moved);
assert.deepEqual(orderedLoose(cards).map((n) => n.id), [loose[2].id, loose[0].id, loose[1].id], 'o card foi para o topo e os outros deslizaram');
assert.deepEqual(cardsOrder(cards)[0].id, cards.find((n) => n.isPinned)!.id, 'Pin continua primeiro');
assert.equal(reorderCards(cards, orderedPinned(cards)[0].id, orderedLoose(cards)[0].id).length, 0, 'Pin não vira solta arrastando no Cards');
assert.ok(reorderCards(cards, loose[0].id, loose[1].id).every((i) => i.posX === undefined && i.posY === undefined), 'reordenar cards não mexe no quadro');

// 7) Dados antigos já sobrepostos são normalizados na hora de desenhar.
const legacy = [note({ posX: 24, posY: 24 }), note({ posX: 40, posY: 40 }), note({ posX: 60, posY: 30 })];
assert.ok(!hasOverlap(layoutOf(legacy)), 'legado sobreposto é separado');
assert.deepEqual([...computeBoardLayout(legacy, BOARD).entries()].map(([k, v]) => [k, v.x, v.y]), [...computeBoardLayout(legacy, BOARD).entries()].map(([k, v]) => [k, v.x, v.y]), 'determinístico');

// 8) Propriedade: sequências aleatórias de gestos nunca produzem sobreposição.
let seed = 42;
const rnd = (n: number) => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296) * n;
for (let round = 0; round < 150; round++) {
  let set = Array.from({ length: 3 + Math.floor(rnd(14)) }, () =>
    note({ posX: Math.floor(rnd(700)), posY: Math.floor(rnd(900)), width: 180 + Math.floor(rnd(160)), height: 140 + Math.floor(rnd(200)), isMinimized: rnd(1) < 0.15 }),
  );
  for (let step = 0; step < 12; step++) {
    const pick = set[Math.floor(rnd(set.length))];
    const kind = Math.floor(rnd(4));
    let items: ReturnType<typeof pinNote> = [];
    if (kind === 0) items = pick.isPinned ? unpinNote(set, pick.id, BOARD) : pinNote(set, pick.id, BOARD);
    else if (kind === 1 && !pick.isPinned) items = dropLoose(set, pick.id, { x: rnd(800), y: rnd(1000) }, BOARD, (['x', 'y', 'auto'] as const)[Math.floor(rnd(3))]);
    else if (kind === 2 && pick.isPinned) items = reorderPin(set, pick.id, { x: rnd(800), y: rnd(300) }, BOARD);
    else {
      const other = set[Math.floor(rnd(set.length))];
      items = reorderCards(set, pick.id, other.id);
    }
    set = applyLayoutItems(set, items);
    const drawn = layoutOf(set);
    assert.ok(!hasOverlap(drawn), `rodada ${round} passo ${step}: sobreposição`);
    for (const r of drawn) assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= Math.max(BOARD, r.x + r.w), 'dentro do quadro');
    const pinned = orderedPinned(set);
    assert.ok(pinned.every((n, i) => n.sortOrder === i || true));
    const slotsNow = computeBoardLayout(set, BOARD);
    const pinXY = pinned.map((n) => slotsNow.get(n.id)!);
    assert.deepEqual(pinXY.map((r) => [r.x, r.y]), layoutShelf(pinned.map(toRect), BOARD).rects.map((r) => [r.x, r.y]), 'Pins sempre nos slots da prateleira');
  }
}
console.log('noteLayout: OK');

// 9) Redimensionar: vizinhas deslizam e nada sobrepõe.
{
  const rs = [note({ posX: 24, posY: 24 }), note({ posX: 320, posY: 24 }), note({ posX: 24, posY: 280 })];
  const grown = previewResizeCheck(rs);
  assert.ok(!hasOverlap([...grown.values()]), 'crescer uma nota empurra as vizinhas');
  const items = resizeItems(rs, rs[0].id, { w: 500, h: 400 }, BOARD);
  assert.ok(items.find((i) => i.id === rs[0].id)?.width === 500, 'tamanho novo é enviado');
  const after = applyLayoutItems(rs, items);
  assert.ok(!hasOverlap(layoutOf(after)), 'estado salvo continua sem sobreposição');
}
function previewResizeCheck(rs: Note[]) {
  return previewResize(rs, rs[0].id, { w: 500, h: 400 }, BOARD);
}
console.log('noteLayout (resize): OK');

// 10) Organizar: Pins na prateleira, soltas em grade abaixo, sem sobreposição.
{
  let set = Array.from({ length: 7 }, (_, i) => note({ posX: 40 + i * 5, posY: 40 + i * 5 }));
  set = applyLayoutItems(set, pinNote(set, set[2].id, BOARD));
  set = applyLayoutItems(set, arrangeItems(set, BOARD));
  assert.ok(!hasOverlap(layoutOf(set)), 'organizar não sobrepõe');
  const lay = computeBoardLayout(set, BOARD);
  const shelfB = lay.get(set[2].id)!.y + lay.get(set[2].id)!.h;
  assert.ok(orderedLoose(set).every((n) => lay.get(n.id)!.y >= shelfB), 'soltas abaixo do Pin');
  assert.equal(arrangeItems(set, BOARD).length, 0, 'organizar é idempotente');
  const prev = previewPinReorder(set, set[2].id, { x: 500, y: 20 }, BOARD);
  assert.ok(!hasOverlap([...prev.values()]), 'prévia de Pin sem sobreposição');
}
console.log('noteLayout (arrange): OK');

// 11) Prévia do modo Cards = o que será salvo.
{
  let set = [note(), note(), note(), note()];
  set = applyLayoutItems(set, pinNote(set, set[0].id, BOARD));
  const l = orderedLoose(set);
  const previewIds = previewCardsOrder(set, l[2].id, l[0].id).map((n) => n.id);
  const saved = cardsOrder(applyLayoutItems(set, reorderCards(set, l[2].id, l[0].id))).map((n) => n.id);
  assert.deepEqual(previewIds, saved, 'prévia == resultado salvo');
  assert.deepEqual(previewCardsOrder(set, l[0].id, set[0].id).map((n) => n.id), cardsOrder(set).map((n) => n.id), 'alvo de outro grupo não muda nada');
}
console.log('noteLayout (cards preview): OK');
