// Modo Vitrine — lógica PURA do frontend + PARIDADE com o validador do servidor.
// Rodar: npx --yes tsx test/vitrine.test.ts   (faz parte do npm run test:logic)
import assert from 'node:assert/strict';
import { DEFAULT_IDLE_MINUTES, IDLE_MINUTES_OPTIONS, parseDeviceSettings } from '../src/lib/vitrine/deviceSettings';
import { MOUSE_MOVE_THRESHOLD_PX, WAKE_GRACE_MS, graceElapsed, movedEnough, msUntilIdle } from '../src/lib/vitrine/idle';
import { hasNewWatchedId, hasWatchedPending, snapshotAttention } from '../src/lib/vitrine/attention';
import { chooseFit } from '../src/lib/vitrine/fit';
import { logoCornerFor, nextValidIndex, validCount } from '../src/lib/vitrine/rotation';
import { addItem, fromItems, hasItem, moveItem, removeAt } from '../src/lib/vitrine/selection';
import { VITRINE_MAX_ITEMS } from '../src/types/vitrine';
import type { AttentionIds, VitrineItem, VitrineSettings, WakeOn } from '../src/types/vitrine';
import { validateVitrineSettings } from '../../backend/src/modules/tenants/vitrine-settings';

// ---------- preferências do aparelho ----------
const def = parseDeviceSettings(null);
assert.equal(def.enabled, false, 'padrão: desligada');
assert.equal(def.idleMinutes, DEFAULT_IDLE_MINUTES);
assert.deepEqual(def.wakeOn, { orders: true, calls: true, closings: true }, 'padrão: acorda em tudo (lado seguro)');
for (const bad of ['', 'x', '[]', 'null', '{"enabled":"true"}', '{"idleMinutes":7}', '{"idleMinutes":"5"}']) {
  const r = parseDeviceSettings(bad);
  assert.equal(r.enabled, false, `lixo "${bad}" → desligada`);
  assert.ok((IDLE_MINUTES_OPTIONS as readonly number[]).includes(r.idleMinutes), `lixo "${bad}" → tempo válido`);
}
const custom = parseDeviceSettings(JSON.stringify({ v: 1, enabled: true, idleMinutes: 10, wakeOn: { orders: false, calls: true } }));
assert.equal(custom.enabled, true);
assert.equal(custom.idleMinutes, 10);
assert.deepEqual(custom.wakeOn, { orders: false, calls: true, closings: true }, 'campo ausente em wakeOn = ligado');

// ---------- inatividade ----------
assert.equal(msUntilIdle(1000, 1500, 5000), 4500);
assert.equal(msUntilIdle(1000, 9000, 5000), 0, 'já passou → 0');
assert.equal(movedEnough(null, { x: 5, y: 5 }), false, 'sem referência não é movimento');
assert.equal(movedEnough({ x: 0, y: 0 }, { x: 3, y: 4 }), false, 'tremor (5px) não conta');
assert.equal(movedEnough({ x: 0, y: 0 }, { x: MOUSE_MOVE_THRESHOLD_PX, y: 0 }), true, 'limiar conta');
assert.equal(graceElapsed(0, WAKE_GRACE_MS - 1), false);
assert.equal(graceElapsed(0, WAKE_GRACE_MS), true);

// ---------- acordar por evento: só id NOVO ----------
const ids = (orders: string[], calls: string[] = [], closings: string[] = []): AttentionIds => ({ orders, calls, closings });
const all: WakeOn = { orders: true, calls: true, closings: true };
const none: WakeOn = { orders: false, calls: false, closings: false };

assert.equal(hasWatchedPending(ids([]), all), false);
assert.equal(hasWatchedPending(ids(['o1']), all), true, 'pedido pendente bloqueia a abertura');
assert.equal(hasWatchedPending(ids(['o1']), { ...all, orders: false }), false, 'categoria desligada não bloqueia');
assert.equal(hasWatchedPending(ids([], [], ['s1']), all), true, 'fechamento pendente bloqueia');
assert.equal(hasWatchedPending(ids(['o1'], ['c1'], ['s1']), none), false);

const base = snapshotAttention(ids(['o1', 'o2'], ['c1']));
assert.equal(hasNewWatchedId(base, ids(['o1', 'o2'], ['c1']), all), false, 'nada mudou');
assert.equal(hasNewWatchedId(base, ids(['o1'], ['c1']), all), false, 'REMOÇÃO de pedido não acorda');
assert.equal(hasNewWatchedId(base, ids([], []), all), false, 'tudo atendido não acorda');
assert.equal(hasNewWatchedId(base, ids(['o1', 'o2', 'o3'], ['c1']), all), true, 'pedido novo acorda');
assert.equal(hasNewWatchedId(base, ids(['o1', 'o2'], ['c1', 'c2']), all), true, 'chamado novo acorda');
assert.equal(hasNewWatchedId(base, ids(['o1', 'o2'], ['c1'], ['s9']), all), true, 'fechamento novo acorda');
assert.equal(hasNewWatchedId(base, ids(['o1', 'o3'], ['c1']), all), true, 'um saiu e outro entrou: o novo acorda');
assert.equal(hasNewWatchedId(base, ids(['o1', 'o2', 'o3']), { ...all, orders: false }), false, 'categoria desligada não acorda');
assert.equal(hasNewWatchedId(base, ids(['o1', 'o2', 'o3'], ['c1', 'c2'], ['s1']), none), false, 'tudo desligado nunca acorda');
const snap = snapshotAttention(base);
snap.orders.push('x');
assert.equal(base.orders.length, 2, 'a fotografia é cópia');

// ---------- foto na tela ----------
assert.equal(chooseFit(1920, 1080, 1920, 1080), 'cover');
assert.equal(chooseFit(1920, 1200, 1920, 1080), 'cover', '16:10 em 16:9');
assert.equal(chooseFit(1200, 1600, 1920, 1080), 'contain', 'foto vertical em monitor wide');
assert.equal(chooseFit(1600, 1200, 1920, 1080), 'contain', '4:3 em 16:9');
assert.equal(chooseFit(0, 0, 1920, 1080), 'contain', 'dimensão inválida → inteira');

// ---------- rotação ----------
assert.equal(nextValidIndex(0, 3, new Set()), 1);
assert.equal(nextValidIndex(2, 3, new Set()), 0, 'volta ao início');
assert.equal(nextValidIndex(0, 3, new Set([1])), 2, 'pula o que falhou');
assert.equal(nextValidIndex(0, 3, new Set([1, 2])), null, 'sobrou só a atual');
assert.equal(nextValidIndex(0, 1, new Set()), null, 'imagem única não gira');
assert.equal(validCount(5, new Set([1, 3, 9])), 3, 'ignora índice fora da faixa');
assert.deepEqual([0, 1, 2, 3, 4].map(logoCornerFor), ['tr', 'tl', 'br', 'tr', 'tl']);
assert.equal(logoCornerFor(-1), 'br');

// ---------- seleção ----------
const P = (n: number): VitrineItem => ({ k: 'product', id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}` });
let s: VitrineSettings | null = null;
s = addItem(s, { k: 'banner' });
s = addItem(s, P(1));
s = addItem(s, P(1));
s = addItem(s, { k: 'banner' });
assert.equal(s?.items.length, 2, 'sem duplicados');
assert.equal(hasItem(s, P(1)), true);
s = moveItem(s, 1, -1);
assert.deepEqual(s?.items[0], P(1), 'sobe');
s = moveItem(s, 0, -1);
assert.deepEqual(s?.items[0], P(1), 'não sobe além do topo');
s = removeAt(s, 0);
assert.deepEqual(s?.items, [{ k: 'banner' }]);
assert.equal(removeAt(s, 0), null, 'lista vazia → null (padrão)');
assert.equal(fromItems([]), null);

// ---------- PARIDADE com o validador do servidor ----------
let a = 20261028;
const rnd = (): number => {
  a = (a + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
let accepted = 0;
for (let i = 0; i < 3000; i++) {
  let cur: VitrineSettings | null = null;
  const steps = Math.floor(rnd() * 40);
  for (let j = 0; j < steps; j++) {
    const r = rnd();
    const len = cur?.items.length ?? 0;
    if (r < 0.55) cur = addItem(cur, rnd() < 0.15 ? { k: 'banner' } : P(1 + Math.floor(rnd() * 30)));
    else if (r < 0.75 && len > 0) cur = removeAt(cur, Math.floor(rnd() * len));
    else if (len > 1) cur = moveItem(cur, Math.floor(rnd() * len), rnd() < 0.5 ? -1 : 1);
  }
  assert.ok((cur?.items.length ?? 0) <= VITRINE_MAX_ITEMS, 'respeita o teto');
  if (cur) {
    const back = validateVitrineSettings(JSON.parse(JSON.stringify(cur)));
    assert.ok(back.ok, `o servidor aceita o que o formulário monta (rodada ${i})`);
    accepted++;
  }
}
assert.ok(accepted > 1500, 'a simulação cobriu seleções reais');
console.log(`vitrine.test.ts OK (${accepted} seleções conferidas contra o servidor)`);
