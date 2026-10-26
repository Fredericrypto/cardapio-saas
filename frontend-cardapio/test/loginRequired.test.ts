// Decisão B (fase 3): pedido de login, erros de criação de pedido e expiração de sessão.
//   Rodar:  npx tsx test/loginRequired.test.ts   (também em `npm run test:logic`)
//
//  1) classifyOrderError: só 401 vira login; timeout/rede/5xx nunca viram login nem reenvio.
//  2) planSessionExpiry: nunca derruba um token mais novo.
//  3) resolveLoginPromptView: sem condição de corrida com a sessão ainda carregando.
//  4) Carrinho preservado em 401 (convidado e conta), usando as regras reais de transição.
//  5) buildLoginUrl / textos i18n nos 3 idiomas.
//  6) GUARDAS ESTÁTICAS da fiação no código real (CartPage, CustomerAuthContext, CartContext,
//     modal, shell, PromotionDetailPage, api.ts).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { classifyOrderError, type OrderFailure } from '../src/lib/orderErrors';
import { planSessionExpiry } from '../src/lib/sessionExpiry';
import {
  buildLoginUrl,
  loginPromptCopy,
  resolveLoginPromptView,
  type LoginPromptReason,
  type LoginPromptState,
} from '../src/lib/loginPrompt';
import { resolveCartOwner, resolveOwnerTransition, type CartOwner } from '../src/lib/cartOwner';
import { mergeCartItems } from '../src/lib/guestCart';
import { ptBR } from '../src/i18n/dictionaries/pt-BR';
import { en } from '../src/i18n/dictionaries/en';
import { es } from '../src/i18n/dictionaries/es';
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

// ---------------------------------------------------------------- erros de pedido
const http = (status: number, data?: unknown) => ({ isAxiosError: true, response: { status, data } });
const noResponse = (code: string) => ({ isAxiosError: true, code, message: code });
const kind = (e: unknown): OrderFailure['kind'] => classifyOrderError(e).kind;

console.log('[pedido] classificação de erro');
test('401 (com ou sem code) = login', () => {
  assert.equal(kind(http(401, { code: 'LOGIN_REQUIRED', message: 'x' })), 'login_required');
  assert.equal(kind(http(401, { message: 'Unauthorized' })), 'login_required');
  assert.equal(kind(http(401)), 'login_required');
});
test('403, 404, 409, 422 e outros 4xx NUNCA viram login (servidor recusou de propósito)', () => {
  for (const s of [400, 402, 403, 404, 405, 409, 410, 413, 422, 451]) assert.equal(kind(http(s, { message: 'm' })), 'rejected', String(s));
});
test('4xx mantém a mensagem do servidor (string, lista de validação ou ausente)', () => {
  assert.deepEqual(classifyOrderError(http(409, { message: 'Loja fechada' })), { kind: 'rejected', message: 'Loja fechada' });
  assert.deepEqual(classifyOrderError(http(400, { message: ['a inválido', 'b obrigatório'] })), { kind: 'rejected', message: 'a inválido b obrigatório' });
  assert.deepEqual(classifyOrderError(http(400, { message: '   ' })), { kind: 'rejected', message: null });
  assert.deepEqual(classifyOrderError(http(400, { message: 42 })), { kind: 'rejected', message: null });
  assert.deepEqual(classifyOrderError(http(400, 'texto cru')), { kind: 'rejected', message: null });
  assert.deepEqual(classifyOrderError(http(404)), { kind: 'rejected', message: null });
});
test('429 = muitas tentativas (não é login nem falha de servidor)', () => assert.equal(kind(http(429)), 'rate_limited'));
test('timeout, queda de rede e CORS (sem resposta) = não confirmado, NUNCA login', () => {
  for (const c of ['ECONNABORTED', 'ETIMEDOUT', 'ERR_NETWORK', 'ECONNRESET', 'ERR_BAD_RESPONSE']) assert.equal(kind(noResponse(c)), 'unconfirmed', c);
});
test('408 e todo 5xx = não confirmado, NUNCA login', () => {
  for (const s of [408, 500, 501, 502, 503, 504, 507, 520, 522, 524, 599]) assert.equal(kind(http(s, { message: 'Internal error' })), 'unconfirmed', String(s));
});
test('não confirmado nunca expõe texto cru do servidor', () => {
  assert.deepEqual(classifyOrderError(http(500, { message: 'stack trace secreto' })), { kind: 'unconfirmed' });
});
test('cancelamento e erros que não são de HTTP = desconhecido', () => {
  assert.equal(kind({ isAxiosError: true, code: 'ERR_CANCELED' }), 'unknown');
  assert.equal(kind(new TypeError('x is undefined')), 'unknown');
  assert.equal(kind(new Error('boom')), 'unknown');
  for (const v of [null, undefined, 'texto', 5, true, [], {}]) assert.equal(kind(v), 'unknown');
});
test('status estranho (não numérico, 2xx/3xx) = desconhecido, nunca login', () => {
  for (const s of ['401', 401.5, 200, 204, 302, Number.NaN, null]) assert.equal(kind({ isAxiosError: true, response: { status: s } }), 'unknown', String(s));
});
test('objeto parecido com erro mas sem isAxiosError não é tratado como HTTP', () => {
  assert.equal(kind({ response: { status: 401 } }), 'unknown');
});

// ---------------------------------------------------------------- expiração de sessão
console.log('\n[sessão] planSessionExpiry');
test('nada mais no storage: encerra a sessão local', () => assert.deepEqual(planSessionExpiry('T1', null), { kind: 'clear' }));
test('token mais novo de outra aba/login: adota, não desloga', () => assert.deepEqual(planSessionExpiry('T1', 'T2'), { kind: 'adopt', token: 'T2' }));
test('o token atual é o mesmo rejeitado (remoção falhou): encerra, sem laço de adoção', () => assert.deepEqual(planSessionExpiry('T1', 'T1'), { kind: 'clear' }));
test('idempotente: repetir depois de limpo continua limpando', () => {
  assert.deepEqual(planSessionExpiry('T1', null), planSessionExpiry('T1', null));
});
test('qualquer token diferente do rejeitado é sempre preservado (nunca vira clear)', () => {
  for (const cur of ['T2', 'x', 'T1 ', 't1']) assert.equal(planSessionExpiry('T1', cur).kind, 'adopt', cur);
});

// ---------------------------------------------------------------- modal x sessão
console.log('\n[modal] resolveLoginPromptView (sem corrida com a sessão)');
const base: LoginPromptState = { reason: 'order', isLoading: false, hasToken: false, hasCustomer: false, authError: false };
const view = (o: Partial<LoginPromptState>) => resolveLoginPromptView({ ...base, ...o });
test('sem pedido pendente: none', () => assert.equal(view({ reason: null }), 'none'));
test('convidado de verdade (sem token, sem conta, sem carregar): login', () => assert.equal(view({}), 'login'));
test('sessão ainda carregando: espera, nunca login', () => {
  assert.equal(view({ isLoading: true }), 'wait');
  assert.equal(view({ isLoading: true, hasToken: true }), 'wait');
});
test('já existe conta: obsoleto (descarta em silêncio), mesmo carregando', () => {
  assert.equal(view({ hasCustomer: true }), 'obsolete');
  assert.equal(view({ hasCustomer: true, isLoading: true }), 'obsolete');
});
test('tem token, perfil não confirmado e erro do servidor: unconfirmed (NÃO é login)', () => assert.equal(view({ hasToken: true, authError: true }), 'unconfirmed'));
test('tem token, sem erro, sem conta ainda: espera (nunca login)', () => assert.equal(view({ hasToken: true }), 'wait'));
test('invariantes em TODAS as combinações', () => {
  const reasons: (LoginPromptReason | null)[] = [null, 'order', 'promotion', 'session'];
  for (const reason of reasons)
    for (const isLoading of [false, true])
      for (const hasToken of [false, true])
        for (const hasCustomer of [false, true])
          for (const authError of [false, true]) {
            const s: LoginPromptState = { reason, isLoading, hasToken, hasCustomer, authError };
            const v = resolveLoginPromptView(s);
            const tag = JSON.stringify(s);
            if (v === 'login') assert.ok(reason && !isLoading && !hasToken && !hasCustomer, 'login indevido ' + tag);
            if (v === 'unconfirmed') assert.ok(reason && !isLoading && hasToken && !hasCustomer && authError, 'unconfirmed indevido ' + tag);
            if (!reason) assert.equal(v, 'none', tag);
            if (hasToken) assert.notEqual(v, 'login', 'quem tem token nunca vê login ' + tag);
            if (isLoading && !hasCustomer && reason) assert.equal(v, 'wait', tag);
          }
});

// ---------------------------------------------------------------- carrinho em 401
console.log('\n[carrinho] preservação em 401 (regras reais de transição de dono)');
const line = (productId: string, quantity = 1): CartItem => ({
  lineKey: `${productId}::`,
  product: { id: productId, name: 'P' + productId, price: 10 },
  quantity,
  selectedOptions: [],
});
const ids = (items: CartItem[]) => items.map((i) => `${i.product.id}x${i.quantity}`);
type Disk = { account: Record<string, CartItem[]>; guest: Record<string, CartItem[]> };
function step(prev: CartOwner, next: CartOwner, memory: CartItem[], disk: Disk) {
  const nextKey = next.kind === 'account' ? next.customerId : null;
  const r = resolveOwnerTransition(prev, next, {
    memoryItems: memory,
    loadAccountItems: () => (nextKey ? disk.account[nextKey] ?? [] : []),
    loadGuestItems: (t) => disk.guest[t] ?? [],
  });
  if (r.discardGuestCartOf) delete disk.guest[r.discardGuestCartOf];
  return r.items;
}
test('convidado + 401 LOGIN_REQUIRED: nada muda no carrinho; depois do login soma ao da conta', () => {
  const disk: Disk = { account: { A: [line('salvo', 1)] }, guest: {} };
  const guestOwner = resolveCartOwner('t1', null);
  const memory = [line('novo', 2)];
  // o 401 não toca em estado nenhum (nem expireSession: não havia token) — o dono continua convidado
  assert.deepEqual(ids(memory), ['novox2']);
  const afterLogin = step(guestOwner, resolveCartOwner('t1', 'A'), memory, disk);
  assert.deepEqual(ids(afterLogin), ['salvox1', 'novox2']);
  assert.equal('t1' in disk.guest, false);
});
test('conta + 401 (sessão vencida): o carrinho SALVO da conta sobrevive e volta no novo login', () => {
  const disk: Disk = { account: { A: [line('a', 3), line('b', 1)] }, guest: {} };
  const accountA = resolveCartOwner('t1', 'A');
  // expireSession: conta -> convidado. A memória da conta NÃO passa para o convidado.
  const asGuest = step(accountA, resolveCartOwner('t1', null), [line('a', 3), line('b', 1)], disk);
  assert.deepEqual(asGuest, []);
  assert.deepEqual(ids(disk.account.A), ['ax3', 'bx1'], 'o salvo da conta não foi apagado');
  // login na MESMA conta: volta tudo
  const back = step(resolveCartOwner('t1', null), accountA, asGuest, disk);
  assert.deepEqual(ids(back), ['ax3', 'bx1']);
});
test('conta A expira e a conta B entra no mesmo aparelho: B nunca recebe itens de A', () => {
  const disk: Disk = { account: { A: [line('segredo', 5)], B: [line('b', 1)] }, guest: {} };
  const asGuest = step(resolveCartOwner('t1', 'A'), resolveCartOwner('t1', null), [line('segredo', 5)], disk);
  const asB = step(resolveCartOwner('t1', null), resolveCartOwner('t1', 'B'), asGuest, disk);
  assert.deepEqual(ids(asB), ['bx1']);
  assert.deepEqual(ids(disk.account.A), ['segredox5'], 'A continua guardado só para A');
});
test('conta expira, convidado monta itens e entra na mesma conta: soma, sem sobrescrever', () => {
  const disk: Disk = { account: { A: [line('a', 1)] }, guest: {} };
  const asGuest = step(resolveCartOwner('t1', 'A'), resolveCartOwner('t1', null), [line('a', 1)], disk);
  const guestPicks = mergeCartItems(asGuest, [line('a', 2), line('c', 1)]);
  const back = step(resolveCartOwner('t1', null), resolveCartOwner('t1', 'A'), guestPicks, disk);
  assert.deepEqual(ids(back), ['ax3', 'cx1']);
});

// ---------------------------------------------------------------- login e i18n
console.log('\n[login] rota de retorno e textos');
test('buildLoginUrl usa a rota de login existente e saneia o retorno', () => {
  assert.equal(buildLoginUrl('cafe', '/cafe/mesa/abc/carrinho'), '/cafe/conta-cliente/entrar?redirect=%2Fcafe%2Fmesa%2Fabc%2Fcarrinho');
  assert.equal(buildLoginUrl('cafe', '/cafe/promocoes/p1?x=1'), '/cafe/conta-cliente/entrar?redirect=%2Fcafe%2Fpromocoes%2Fp1%3Fx%3D1');
  for (const evil of ['https://evil.com', '//evil.com', '/outro/x', '/cafe/../outro', 'javascript:alert(1)']) {
    assert.equal(buildLoginUrl('cafe', evil), '/cafe/conta-cliente/entrar?redirect=%2Fcafe', evil);
  }
});
const KEYS = [
  'loginRequired.title.order', 'loginRequired.title.promotion', 'loginRequired.title.session',
  'loginRequired.message.order', 'loginRequired.message.promotion', 'loginRequired.message.session',
  'loginRequired.confirm', 'loginRequired.dismiss',
  'loginRequired.unconfirmed.title', 'loginRequired.unconfirmed.message', 'loginRequired.unconfirmed.retry',
  'cartPage.entrar_para_pedir', 'cartPage.pedido_nao_confirmado', 'cartPage.muitas_tentativas',
] as const;
test('todas as chaves novas existem e não estão vazias em pt-BR, en e es', () => {
  const dicts: Record<string, Record<string, string>> = { 'pt-BR': ptBR as Record<string, string>, en, es };
  for (const [lang, d] of Object.entries(dicts)) for (const k of KEYS) assert.ok(typeof d[k] === 'string' && d[k].trim().length > 0, `${lang} sem ${k}`);
});
test('cada motivo de login aponta para chaves que existem', () => {
  for (const reason of ['order', 'promotion', 'session'] as const) {
    const copy = loginPromptCopy(reason);
    for (const lang of [ptBR as Record<string, string>, en, es]) {
      assert.ok(lang[copy.title], reason + ' título');
      assert.ok(lang[copy.message], reason + ' mensagem');
    }
  }
});
test('mensagem de pedido não confirmado não promete proteção contra duplicação (P-16 segue aberto)', () => {
  for (const lang of [ptBR as Record<string, string>, en, es]) {
    const m = lang['cartPage.pedido_nao_confirmado'].toLowerCase();
    assert.equal(/(sem risco|sem duplicar|n[ãa]o duplic|won't duplicate|will not duplicate|no se duplic|safe to retry|seguro tentar)/.test(m), false, m);
  }
});

// ---------------------------------------------------------------- guardas estáticas
console.log('\n[fiação] guardas estáticas (código real)');
const src = (rel: string) => readFileSync(fileURLToPath(new URL('../src/' + rel, import.meta.url)), 'utf8');
const code = (rel: string) => src(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

test('CustomerAuthContext.expireSession: compare-and-delete, plano de expiração e NUNCA limpa o carrinho', () => {
  const s = code('contexts/CustomerAuthContext.tsx');
  const m = s.match(/function expireSession\(rejectedToken: string\) \{[\s\S]*?\n  \}\n/);
  assert.ok(m, 'expireSession não encontrada');
  assert.match(m![0], /clearStoredTokenIfMatches\(tenantId, rejectedToken\)/);
  assert.match(m![0], /memoryTokenRef\.current\?\.token === rejectedToken/);
  assert.match(m![0], /planSessionExpiry\(rejectedToken,/);
  assert.equal(/clearStoredTokens\(|clearCart|logout\(/.test(m![0]), false, 'expireSession não pode limpar carrinho nem apagar tokens incondicionalmente');
  assert.match(s, /expireSession,\s*\n?\s*(retry|\}|[a-z])/s, 'expireSession precisa estar no value do provider');
});
test('CartPage: pedido só sai por ação explícita e nunca é reenviado sozinho', () => {
  const raw = code('pages/CartPage.tsx');
  assert.equal(count(raw, /createOrder\(/g), 1, 'createOrder deve ser chamado num único ponto');
  assert.equal(count(raw, /async function handleSubmit\(\)/g), 1, 'uma única definição de handleSubmit');
  assert.equal(count(raw, /handleSubmit\(\);/g), 2, 'handleSubmit só é chamado dentro de handlePrimaryAction (mesa e revisão)');
  const outsidePrimary = raw.replace(/function handlePrimaryAction\(\) \{[\s\S]*?\n  \}\n/, '');
  assert.equal(/handleSubmit\(\);/.test(outsidePrimary), false, 'handleSubmit chamado fora de handlePrimaryAction');
  // Os temporizadores que já existem (polling de chamada de garçom, volta ao cardápio) nunca podem
  // enviar nem reenviar pedido.
  const timers = raw.match(/set(?:Interval|Timeout)\([\s\S]*?\},\s*\d+\s*\)/g) ?? [];
  assert.ok(timers.length >= 1, 'o teste precisa enxergar os temporizadores existentes');
  for (const t of timers) assert.equal(/handleSubmit|handlePrimaryAction|createOrder/.test(t), false, 'reenvio por timer: ' + t.slice(0, 60));
});
test('CartPage: só 401 chama o login; falha de servidor segue a classificação', () => {
  const raw = code('pages/CartPage.tsx');
  assert.match(raw, /classifyOrderError\(err\)/);
  assert.equal(count(raw, /requestLogin\(/g), 2, 'requestLogin: guarda do botão + ramo 401');
  const branch = raw.match(/if \(failure\.kind === 'login_required'\) \{[\s\S]*?\n      \}\n/);
  assert.ok(branch, 'ramo login_required não encontrado');
  assert.match(branch![0], /if \(customerToken\) expireSession\(customerToken\)/);
  assert.match(branch![0], /requestLogin\(customerToken \? 'session' : 'order'\)/);
  assert.match(raw, /failure\.kind === 'unconfirmed'[\s\S]*?cartPage\.pedido_nao_confirmado/);
  assert.match(raw, /failure\.kind === 'rate_limited'[\s\S]*?cartPage\.muitas_tentativas/);
});
test('CartPage: convidado cai no login ANTES de qualquer envio; sessão carregando não conta como convidado', () => {
  const raw = code('pages/CartPage.tsx');
  const fn = raw.match(/function handlePrimaryAction\(\) \{[\s\S]*?\n  \}\n/);
  assert.ok(fn, 'handlePrimaryAction não encontrada');
  const guard = fn![0].indexOf("requestLogin('order')");
  const submit = fn![0].indexOf('handleSubmit()');
  assert.ok(guard >= 0 && submit > guard, 'a guarda de login precisa vir antes do envio');
  assert.match(fn![0], /if \(!customerToken\) \{\s*if \(!isAuthLoading\) requestLogin\('order'\);\s*return;\s*\}/);
  assert.match(raw, /const needsLogin = !customerToken && !isAuthLoading;/);
  assert.match(raw, /\(!customerToken && isAuthLoading\) \|\|/);
});
test('CartPage: o nome de convidado deixou de existir (campo, regra e mensagem)', () => {
  const raw = code('pages/CartPage.tsx');
  assert.equal(/guestNameError|validateGuestName/.test(raw), false);
  assert.match(raw, /\{customerToken && !hasSavedName && \(/, 'campo de nome só para conta logada sem nome salvo');
});
test('CartPage mantém as guardas do P-01 (promoção) intactas', () => {
  const raw = code('pages/CartPage.tsx');
  assert.equal(count(raw, /prunePromotions\(/g), 1);
  assert.match(raw, /useCartPromotionContext\(/);
  assert.match(raw, /promoSuggestionIds\(/);
});
test('CartContext: selectPromotion/togglePromotion devolvem se aplicaram (a tela não navega quando foi bloqueado)', () => {
  const s = code('contexts/CartContext.tsx');
  assert.match(s, /togglePromotion: \(id: string\) => boolean;/);
  assert.match(s, /selectPromotion: \(id: string\) => boolean;/);
  for (const fn of ['togglePromotion', 'selectPromotion']) {
    const m = s.match(new RegExp('const ' + fn + ' = useCallback\\(\\(id: string\\) => \\{[\\s\\S]*?\\n  \\}, \\[\\]\\);'));
    assert.ok(m, fn);
    assert.match(m![0], /setLoginIntent\(\{ reason: 'promotion' \}\);\s*return false;/);
    assert.match(m![0], /return true;/);
  }
  assert.match(s, /export type LoginIntentReason = LoginPromptReason;/);
});
test('PromotionDetailPage só navega se a promoção foi realmente ativada', () => {
  const m = code('pages/PromotionDetailPage.tsx').match(/function handleApply\(\) \{[\s\S]*?\n  \}/);
  assert.ok(m, 'handleApply não encontrada');
  assert.match(m![0], /if \(!selectPromotion\(promotion!\.id\)\) return;/);
  assert.equal(/togglePromotion/.test(m![0]), false);
  assert.ok(m![0].indexOf('selectPromotion(') < m![0].indexOf('navigate('), 'ativar antes de navegar');
});
test('PromotionExplorePage continua com a ativação explícita original (guarda do P-01)', () => {
  const s = code('pages/PromotionExplorePage.tsx');
  assert.equal(count(s, /selectPromotion\(/g), 1);
  assert.match(s, /onActivate=\{\(\) => selectPromotion\(promotion\.id\)\}/);
});
test('Modal global: montado uma vez no shell, dentro do CustomerAuthProvider', () => {
  const s = code('components/CustomerAppShell.tsx');
  assert.equal(count(s, /<LoginRequiredModal \/>/g), 1);
  assert.ok(s.indexOf('<CustomerAuthProvider>') < s.indexOf('<LoginRequiredModal />'));
  assert.ok(s.indexOf('<LoginRequiredModal />') < s.indexOf('</CustomerAuthProvider>'));
});
test('Modal global: sem autenticação paralela, com trava de rolagem e acessível', () => {
  const s = code('components/LoginRequiredModal.tsx');
  assert.match(s, /useScrollLock\(true\)/);
  assert.match(s, /createPortal\(/);
  assert.match(s, /role="dialog"/);
  assert.match(s, /aria-modal="true"/);
  assert.match(s, /buildLoginUrl\(slug,/);
  assert.match(s, /retry\(\)/);
  assert.equal(/localStorage|sessionStorage|fetch\(|axios|api\.(get|post)|loginCustomer|setToken|storeToken|expireSession/.test(s), false, 'o modal não pode tocar em token/API');
  assert.equal(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(src('components/LoginRequiredModal.tsx')), false, 'sem emoji');
  assert.equal(/backdrop-blur/.test(s.replace(/md:backdrop-blur-sm/g, '')), false, 'blur só em md+ (performance no celular)');
});
test('lib/api.ts nunca refaz POST sozinho (retry só para GET/HEAD)', () => {
  assert.match(code('lib/api.ts'), /method !== 'get' && method !== 'head'/);
});

console.log('\nResultado: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail === 0 ? 0 : 1);
