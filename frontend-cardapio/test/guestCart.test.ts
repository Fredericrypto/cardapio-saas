// Decisão B (fase 2): carrinho do convidado, dono do carrinho e redirect seguro.
//   Rodar:  npx tsx test/guestCart.test.ts   (também em `npm run test:logic`)
//
// Camadas:
//  1) LÓGICA PURA: merge, validação, armazenamento (com storage falso, inclusive que lança).
//  2) MATRIZ DE TRANSIÇÃO de dono do carrinho (convidado, conta, nenhum).
//  3) REDIRECT seguro (open redirect).
//  4) GUARDAS ESTÁTICAS da fiação no CartContext e na CustomerAuthPage.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  MAX_GUEST_LINES,
  MAX_LINE_QUANTITY,
  clearGuestCart,
  guestCartKey,
  isValidCartLine,
  mergeCartItems,
  parseGuestCart,
  readGuestCart,
  sanitizeCartItems,
  serializeGuestCart,
  writeGuestCart,
  type StorageLike,
} from '../src/lib/guestCart';
import { resolveCartOwner, resolveOwnerTransition, sameCartOwner, type CartOwner } from '../src/lib/cartOwner';
import { safeRedirectPath } from '../src/lib/safeRedirect';
import type { CartItem } from '../src/types';

let pass = 0;
let fail = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    pass++;
    console.log('  OK    ' + name);
  } catch (e) {
    fail++;
    console.log('  FALHA ' + name + '\n        ' + (e as Error).message.split('\n').join('\n        '));
  }
}

const line = (productId: string, quantity = 1, optionIds: string[] = [], price = 10): CartItem => ({
  lineKey: `${productId}::${[...optionIds].sort().join(',')}`,
  product: { id: productId, name: 'P' + productId, price },
  quantity,
  selectedOptions: optionIds.map((id) => ({ valueId: id, groupName: 'g', label: id, priceDelta: 0 })),
});
const qtyOf = (items: CartItem[], key: string) => items.find((i) => i.lineKey === key)?.quantity;
function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    Object.freeze(o);
    for (const v of Object.values(o as object)) deepFreeze(v);
  }
  return o;
}
function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}
const throwingStorage: StorageLike = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
  removeItem: () => {
    throw new Error('SecurityError');
  },
};

console.log('[lógica] validação de linha');
test('linha válida', () => assert.equal(isValidCartLine(line('a', 2)), true));
test('linhas inválidas: quantidade, chave, produto, opções', () => {
  const ok = line('a');
  for (const bad of [
    { ...ok, quantity: 0 },
    { ...ok, quantity: -1 },
    { ...ok, quantity: 1.5 },
    { ...ok, quantity: Number.NaN },
    { ...ok, quantity: Number.POSITIVE_INFINITY },
    { ...ok, quantity: '2' },
    { ...ok, quantity: MAX_LINE_QUANTITY + 1 },
    { ...ok, lineKey: '' },
    { ...ok, lineKey: 5 },
    { ...ok, product: null },
    { ...ok, product: { id: '' } },
    { ...ok, product: { name: 'sem id' } },
    { ...ok, selectedOptions: null },
    { ...ok, selectedOptions: {} },
    null,
    undefined,
    'x',
    5,
    [],
  ]) {
    assert.equal(isValidCartLine(bad), false, JSON.stringify(bad));
  }
});
test('quantidade no limite (999) é válida', () => assert.equal(isValidCartLine(line('a', MAX_LINE_QUANTITY)), true));
test('sanitizeCartItems descarta só o inválido e preserva a ordem', () => {
  const out = sanitizeCartItems([line('a'), null, { ...line('b'), quantity: 0 }, line('c')]);
  assert.deepEqual(out.map((i) => i.lineKey), ['a::', 'c::']);
});

console.log('\n[lógica] merge do carrinho (P-20: nunca sobrescrever)');
test('vazio + vazio = vazio', () => assert.deepEqual(mergeCartItems([], []), []));
test('só base: devolve a base', () => assert.deepEqual(mergeCartItems([line('a', 2)], []), [line('a', 2)]));
test('só convidado: devolve os do convidado', () => assert.deepEqual(mergeCartItems([], [line('a', 3)]), [line('a', 3)]));
test('linhas diferentes: base primeiro, convidado depois, ordem preservada', () => {
  const out = mergeCartItems([line('a'), line('b')], [line('c'), line('d')]);
  assert.deepEqual(out.map((i) => i.product.id), ['a', 'b', 'c', 'd']);
});
test('mesma linha soma a quantidade e mantém a posição da base', () => {
  const out = mergeCartItems([line('a', 2), line('b', 1)], [line('b', 4), line('a', 1)]);
  assert.deepEqual(out.map((i) => [i.product.id, i.quantity]), [['a', 3], ['b', 5]]);
});
test('mesma linha usa o produto/opções mais recentes (do convidado)', () => {
  const old = line('a', 1, ['x'], 10);
  const fresh = line('a', 1, ['x'], 12);
  const out = mergeCartItems([old], [fresh]);
  assert.equal(out[0].product.price, 12);
  assert.equal(out[0].quantity, 2);
});
test('mesmo produto com opções diferentes = linhas separadas', () => {
  const out = mergeCartItems([line('a', 1, ['x'])], [line('a', 1, ['y'])]);
  assert.equal(out.length, 2);
});
test('ordem das opções não cria linha duplicada (chave canônica)', () => {
  const out = mergeCartItems([line('a', 1, ['x', 'y'])], [line('a', 2, ['y', 'x'])]);
  assert.equal(out.length, 1);
  assert.equal(out[0].quantity, 3);
});
test('quantidade somada é limitada a 999', () => {
  const out = mergeCartItems([line('a', 600)], [line('a', 600)]);
  assert.equal(out[0].quantity, MAX_LINE_QUANTITY);
});
test('linha repetida dentro do próprio lado também é unida', () => {
  const out = mergeCartItems([line('a', 1), line('a', 2)], [line('b', 1), line('b', 1)]);
  assert.deepEqual(out.map((i) => [i.product.id, i.quantity]), [['a', 3], ['b', 2]]);
});
test('linhas inválidas dos dois lados são descartadas', () => {
  const out = mergeCartItems([{ ok: 1 }, line('a')], [null, { ...line('b'), quantity: 0 }, line('c')]);
  assert.deepEqual(out.map((i) => i.product.id), ['a', 'c']);
});
test('não muta as entradas (entradas congeladas) e devolve cópias', () => {
  const base = deepFreeze([line('a', 1)]);
  const incoming = deepFreeze([line('a', 1), line('b', 1)]);
  const out = mergeCartItems(base, incoming);
  assert.equal(base[0].quantity, 1);
  assert.equal(incoming[0].quantity, 1);
  assert.notEqual(out[0], base[0]);
});
test('merge é determinístico (mesma entrada, mesma saída)', () => {
  const a = [line('a', 2), line('b')];
  const b = [line('b', 2), line('c')];
  assert.deepEqual(mergeCartItems(a, b), mergeCartItems(a, b));
});
test('carrinho grande (500 linhas) funciona', () => {
  const base = Array.from({ length: 500 }, (_, i) => line('p' + i, 1));
  const incoming = Array.from({ length: 500 }, (_, i) => line('p' + (i + 250), 1));
  const out = mergeCartItems(base, incoming);
  assert.equal(out.length, 750);
  assert.equal(qtyOf(out, 'p300::'), 2);
  assert.equal(qtyOf(out, 'p0::'), 1);
});

console.log('\n[lógica] armazenamento do convidado');
test('chave isola restaurantes e não colide com a chave da conta', () => {
  assert.notEqual(guestCartKey('t1'), guestCartKey('t2'));
  assert.equal(guestCartKey('t1').startsWith('cardapio_cart_'), false);
});
test('ida e volta', () => {
  const items = [line('a', 2, ['x']), line('b')];
  assert.deepEqual(parseGuestCart(serializeGuestCart(items)), items);
});
test('parse tolerante: nulo, vazio, quebrado, não-objeto, versão errada, items inválido', () => {
  for (const raw of [null, undefined, '', '{oops', '42', 'null', '[]', '"x"', JSON.stringify({ v: 99, items: [line('a')] }), JSON.stringify({ v: 1 }), JSON.stringify({ v: 1, items: 'x' })]) {
    assert.deepEqual(parseGuestCart(raw as string | null | undefined), [], String(raw));
  }
});
test('parse descarta linhas inválidas e limita o total de linhas', () => {
  const many = Array.from({ length: MAX_GUEST_LINES + 50 }, (_, i) => line('p' + i));
  const parsed = parseGuestCart(JSON.stringify({ v: 1, items: [null, { x: 1 }, ...many] }));
  assert.equal(parsed.length <= MAX_GUEST_LINES, true);
  assert.equal(parsed.every((i) => i.lineKey.endsWith('::')), true);
});
test('write/read/clear com storage em memória', () => {
  const st = memoryStorage();
  writeGuestCart(st, 't1', [line('a', 2)]);
  assert.equal(st.data.has(guestCartKey('t1')), true);
  assert.deepEqual(readGuestCart(st, 't1'), [line('a', 2)]);
  clearGuestCart(st, 't1');
  assert.equal(st.data.size, 0);
});
test('carrinho vazio remove a chave (não deixa lixo)', () => {
  const st = memoryStorage();
  writeGuestCart(st, 't1', [line('a')]);
  writeGuestCart(st, 't1', []);
  assert.equal(st.data.size, 0);
});
test('isolamento entre restaurantes no storage', () => {
  const st = memoryStorage();
  writeGuestCart(st, 't1', [line('a')]);
  assert.deepEqual(readGuestCart(st, 't2'), []);
});
test('storage que lança (cota, bloqueado) nunca derruba o app', () => {
  assert.doesNotThrow(() => writeGuestCart(throwingStorage, 't1', [line('a')]));
  assert.doesNotThrow(() => clearGuestCart(throwingStorage, 't1'));
  assert.deepEqual(readGuestCart(throwingStorage, 't1'), []);
});
test('sem storage (null): tudo é no-op', () => {
  assert.doesNotThrow(() => writeGuestCart(null, 't1', [line('a')]));
  assert.doesNotThrow(() => clearGuestCart(null, 't1'));
  assert.deepEqual(readGuestCart(null, 't1'), []);
});

console.log('\n[lógica] dono do carrinho');
test('resolveCartOwner', () => {
  assert.deepEqual(resolveCartOwner(null, null), { kind: 'none' });
  assert.deepEqual(resolveCartOwner(null, 'c1'), { kind: 'none' });
  assert.deepEqual(resolveCartOwner('t1', null), { kind: 'guest', tenantId: 't1' });
  assert.deepEqual(resolveCartOwner('t1', 'c1'), { kind: 'account', tenantId: 't1', customerId: 'c1' });
});
test('sameCartOwner', () => {
  const g1 = resolveCartOwner('t1', null);
  assert.equal(sameCartOwner(g1, resolveCartOwner('t1', null)), true);
  assert.equal(sameCartOwner(g1, resolveCartOwner('t2', null)), false);
  assert.equal(sameCartOwner(g1, resolveCartOwner('t1', 'c1')), false);
  assert.equal(sameCartOwner(resolveCartOwner('t1', 'c1'), resolveCartOwner('t1', 'c2')), false);
  assert.equal(sameCartOwner(resolveCartOwner('t1', 'c1'), resolveCartOwner('t2', 'c1')), false);
  assert.equal(sameCartOwner({ kind: 'none' }, resolveCartOwner(null, null)), true);
});

console.log('\n[lógica] matriz de transição de dono');
const NONE: CartOwner = { kind: 'none' };
const guest = (t: string): CartOwner => ({ kind: 'guest', tenantId: t });
const acct = (t: string, c: string): CartOwner => ({ kind: 'account', tenantId: t, customerId: c });
function transition(prev: CartOwner, next: CartOwner, o: { memory?: CartItem[]; account?: CartItem[]; guestStore?: Record<string, CartItem[]> }) {
  let accountLoads = 0;
  const r = resolveOwnerTransition(prev, next, {
    memoryItems: o.memory ?? [],
    loadAccountItems: () => {
      accountLoads++;
      return o.account ?? [];
    },
    loadGuestItems: (t) => o.guestStore?.[t] ?? [],
  });
  return { ...r, accountLoads };
}
test('convidado → conta: soma ao carrinho da conta e apaga o do convidado (P-20)', () => {
  const r = transition(guest('t1'), acct('t1', 'c1'), { memory: [line('b', 2)], account: [line('a', 1), line('b', 1)] });
  assert.deepEqual(r.items.map((i) => [i.product.id, i.quantity]), [['a', 1], ['b', 3]]);
  assert.equal(r.discardGuestCartOf, 't1');
});
test('convidado → conta, conta sem nada salvo: mantém o do convidado (caso do primeiro login)', () => {
  const r = transition(guest('t1'), acct('t1', 'c1'), { memory: [line('a', 2)] });
  assert.deepEqual(r.items.map((i) => [i.product.id, i.quantity]), [['a', 2]]);
});
test('convidado → conta, convidado vazio: carrinho da conta intacto', () => {
  const r = transition(guest('t1'), acct('t1', 'c1'), { account: [line('a', 3)] });
  assert.deepEqual(r.items.map((i) => [i.product.id, i.quantity]), [['a', 3]]);
});
test('convidado → conta após reload (memória vazia): usa o carrinho salvo na aba', () => {
  const r = transition(guest('t1'), acct('t1', 'c1'), { guestStore: { t1: [line('z', 2)] }, account: [line('a', 1)] });
  assert.deepEqual(r.items.map((i) => i.product.id), ['a', 'z']);
  assert.equal(r.discardGuestCartOf, 't1');
});
test('não conta em dobro: memória cheia ignora o salvo na aba (mesmos itens)', () => {
  const same = [line('a', 2)];
  const r = transition(guest('t1'), acct('t1', 'c1'), { memory: same, guestStore: { t1: same } });
  assert.equal(qtyOf(r.items, 'a::'), 2);
});
test('nada → conta (login direto): mesma regra de soma', () => {
  const r = transition(NONE, acct('t1', 'c1'), { memory: [line('b')], account: [line('a')] });
  assert.deepEqual(r.items.map((i) => i.product.id), ['a', 'b']);
  assert.equal(r.discardGuestCartOf, 't1');
});
test('conta → conta (troca de identidade): NUNCA leva itens da conta anterior', () => {
  const r = transition(acct('t1', 'c1'), acct('t1', 'c2'), { memory: [line('segredo', 5)], account: [line('b')], guestStore: { t1: [line('g')] } });
  assert.deepEqual(r.items.map((i) => i.product.id), ['b']);
  assert.equal(r.discardGuestCartOf, null);
});
test('conta → convidado (logout): itens da conta somem; volta só o salvo de convidado', () => {
  const r = transition(acct('t1', 'c1'), guest('t1'), { memory: [line('da-conta', 5)], guestStore: { t1: [line('g', 1)] } });
  assert.deepEqual(r.items.map((i) => i.product.id), ['g']);
});
test('conta → convidado sem salvo: carrinho vazio', () => {
  assert.deepEqual(transition(acct('t1', 'c1'), guest('t1'), { memory: [line('x')] }).items, []);
});
test('conta → nenhum: vazio', () => {
  assert.deepEqual(transition(acct('t1', 'c1'), NONE, { memory: [line('x')] }).items, []);
});
test('nada → convidado: junta o salvo na aba com a memória', () => {
  const r = transition(NONE, guest('t1'), { memory: [line('a')], guestStore: { t1: [line('b')] } });
  assert.deepEqual(r.items.map((i) => i.product.id), ['b', 'a']);
});
test('nada → convidado, memória vazia: carrega o salvo (reload do convidado)', () => {
  const r = transition(NONE, guest('t1'), { guestStore: { t1: [line('b', 3)] } });
  assert.deepEqual(r.items.map((i) => [i.product.id, i.quantity]), [[ 'b', 3]]);
});
test('convidado de outro restaurante → conta: não carrega nada dele', () => {
  const r = transition(guest('t2'), acct('t1', 'c1'), { memory: [line('de-t2')], account: [line('a')], guestStore: { t2: [line('de-t2')] } });
  assert.deepEqual(r.items.map((i) => i.product.id), ['a']);
  assert.equal(r.discardGuestCartOf, null);
});
test('convidado de um restaurante → convidado de outro: carrega o salvo do novo, sem levar a memória', () => {
  const r = transition(guest('t1'), guest('t2'), { memory: [line('de-t1')], guestStore: { t2: [line('b')] } });
  assert.deepEqual(r.items.map((i) => i.product.id), ['b']);
});
test('qualquer → nenhum: vazio e sem apagar nada', () => {
  const r = transition(guest('t1'), NONE, { memory: [line('x')] });
  assert.deepEqual(r, { items: [], discardGuestCartOf: null, accountLoads: 0 });
});
test('carrinho salvo corrompido da conta não derruba o merge', () => {
  const r = transition(guest('t1'), acct('t1', 'c1'), { memory: [line('b')], account: [{ lixo: true } as unknown as CartItem, line('a')] });
  assert.deepEqual(r.items.map((i) => i.product.id), ['a', 'b']);
});

console.log('\n[redirect] só caminho interno do mesmo restaurante');
const S = 'cafe-do-ze';
test('caminhos internos do restaurante passam intactos', () => {
  for (const ok of [`/${S}`, `/${S}/`, `/${S}/mesa/abc123/carrinho`, `/${S}/mesa/abc?fechar=1`, `/${S}/promocoes/p1#topo`, `/${S}/mesa/abc/carrinho?a=1&b=2#x`]) {
    assert.equal(safeRedirectPath(ok, S), ok);
  }
});
test('sem valor, vazio, tipo errado: início do restaurante', () => {
  for (const v of [null, undefined, '', 5 as unknown as string]) assert.equal(safeRedirectPath(v, S), `/${S}`);
});
test('URL absoluta e protocolos: bloqueados', () => {
  for (const bad of ['https://evil.com', 'http://evil.com/x', 'javascript:alert(1)', 'data:text/html,x', 'ftp://x', 'evil.com', `https://evil.com/${S}`]) {
    assert.equal(safeRedirectPath(bad, S), `/${S}`, bad);
  }
});
test('protocol-relative e barras invertidas: bloqueados', () => {
  for (const bad of ['//evil.com', '//evil.com/' + S, '/\\evil.com', '\\\\evil.com', `/${S}/\\evil.com`, '///evil.com']) {
    assert.equal(safeRedirectPath(bad, S), `/${S}`, bad);
  }
});
test('outro restaurante e colisão de prefixo: bloqueados', () => {
  for (const bad of ['/outro-restaurante/mesa/1', `/${S}x`, `/${S}x/mesa`, '/', '/admin']) {
    assert.equal(safeRedirectPath(bad, S), `/${S}`, bad);
  }
});
test('traversal (..) e variações codificadas: bloqueados', () => {
  for (const bad of [`/${S}/../outro`, `/${S}/%2e%2e/outro`, `/${S}/%2E%2E/outro`, `/${S}/./../../x`, `/${S}%2F..%2Foutro`]) {
    assert.equal(safeRedirectPath(bad, S), `/${S}`, bad);
  }
});
test('traversal que fica dentro do restaurante é normalizado', () => {
  assert.equal(safeRedirectPath(`/${S}/a/../mesa/x`, S), `/${S}/mesa/x`);
});
test('caracteres de controle e quebras de linha: bloqueados', () => {
  for (const bad of [`/${S}\n/x`, `/${S}\t//evil.com`, `/${S}\r\nSet-Cookie:x`, `/${S}\u0000`, `/\t/evil.com`]) {
    assert.equal(safeRedirectPath(bad, S), `/${S}`, JSON.stringify(bad));
  }
});
test('valor enorme: bloqueado', () => assert.equal(safeRedirectPath(`/${S}/` + 'a'.repeat(5000), S), `/${S}`));
test('sem slug: início do app, nunca um caminho vindo da URL', () => {
  assert.equal(safeRedirectPath('/qualquer', ''), '/');
  assert.equal(safeRedirectPath('/qualquer', undefined), '/');
});
test('slug com caracteres especiais é tratado como literal', () => {
  assert.equal(safeRedirectPath('/a.b/x', 'a.b'), '/a.b/x');
  assert.equal(safeRedirectPath('/axb/x', 'a.b'), '/a.b');
});

// ------------------------------------------------------------ guardas estáticas
console.log('\n[fiação] guardas estáticas (código-fonte)');
const src = (rel: string) => readFileSync(fileURLToPath(new URL('../src/' + rel, import.meta.url)), 'utf8');
const code = (rel: string) => src(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('guestCart/cartOwner nunca tocam localStorage (convidado é só sessionStorage)', () => {
  for (const f of ['lib/guestCart.ts', 'lib/cartOwner.ts']) assert.equal(/localStorage/.test(code(f)), false, f);
  assert.match(code('lib/guestCart.ts'), /sessionStorage/);
});
test('CartContext usa o merge/transição e não tem mais o atalho que sobrescrevia a conta', () => {
  const s = code('contexts/CartContext.tsx');
  assert.match(s, /from '\.\.\/lib\/guestCart'/);
  assert.match(s, /from '\.\.\/lib\/cartOwner'/);
  assert.equal((s.match(/resolveOwnerTransition\(/g) ?? []).length, 1, 'transição deve ser calculada num ponto só');
  assert.equal(/wasGuestWithItems/.test(s), false, 'o atalho antigo (P-20) voltou');
});
test('CartContext: convidado persiste só itens (sessionStorage), conta persiste v2 em localStorage', () => {
  const s = code('contexts/CartContext.tsx');
  assert.match(s, /writeGuestCart\(getGuestStorage\(\), owner\.tenantId, items\)/);
  assert.match(s, /localStorage\.setItem\(ownerKeyRef\.current, serializeCart\(items, promo\)\)/);
  assert.equal(/writeGuestCart\([^)]*promo/.test(s), false, 'promoção nunca vai para o carrinho do convidado');
});
test('CartContext: logout/limpeza também apaga o carrinho de convidado da aba', () => {
  const m = code('contexts/CartContext.tsx').match(/const clearCart = useCallback\(\(\) => \{[\s\S]*?\n  \}, \[\]\);/);
  assert.ok(m, 'clearCart não encontrada');
  assert.match(m![0], /clearGuestCart\(/);
});
test('CartContext: ativar/alternar promoção exige conta; convidado vira pedido de login, sem mudar o estado', () => {
  const s = code('contexts/CartContext.tsx');
  for (const fn of ['togglePromotion', 'selectPromotion']) {
    const m = s.match(new RegExp('const ' + fn + ' = useCallback\\(\\(id: string\\) => \\{[\\s\\S]*?\\n  \\}, \\[\\]\\);'));
    assert.ok(m, fn + ' não encontrada');
    assert.match(m![0], /ownerRef\.current\.kind !== 'account'/, fn + ' sem a trava de conta');
    assert.match(m![0], /setLoginIntent\(\{ reason: 'promotion' \}\)/, fn + ' não pede login');
    const gate = m![0].indexOf("ownerRef.current.kind !== 'account'");
    const change = m![0].indexOf('setPromo(');
    assert.ok(gate >= 0 && change > gate, fn + ': a trava precisa vir antes de mudar o estado');
  }
});
test('CartContext expõe o pedido de login (usado pelo modal da fase 3)', () => {
  const s = code('contexts/CartContext.tsx');
  for (const k of ['loginIntent', 'requestLogin', 'dismissLoginIntent']) assert.match(s, new RegExp(k), k);
});
test('CustomerAuthPage valida o redirect e não confia no parâmetro cru', () => {
  const s = code('pages/CustomerAuthPage.tsx');
  assert.match(s, /safeRedirectPath\(searchParams\.get\('redirect'\), slug\)/);
  assert.equal(/searchParams\.get\('redirect'\) \|\|/.test(s), false, 'redirect cru voltou');
});

console.log('\nResultado: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail === 0 ? 0 : 1);
