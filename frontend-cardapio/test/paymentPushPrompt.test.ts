import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decidePaymentPushPrompt } from '../src/lib/paymentPushPrompt';

// Sem suporte do navegador ou sem login: não mostra nada (convidado não pede, mas defesa em profundidade).
assert.equal(decidePaymentPushPrompt({ supported: false, hasToken: true, permission: 'unsupported', isSubscribed: false }), 'hidden');
assert.equal(decidePaymentPushPrompt({ supported: true, hasToken: false, permission: 'default', isSubscribed: false }), 'hidden');
// Permissão ainda não pedida: botão (gesto do usuário; pedir sozinho é ignorado/bloqueado em vários navegadores).
assert.equal(decidePaymentPushPrompt({ supported: true, hasToken: true, permission: 'default', isSubscribed: false }), 'enable');
// Permissão já concedida mas SEM inscrição de push (o caso real do bug): inscreve sozinho, sem pedir nada.
assert.equal(decidePaymentPushPrompt({ supported: true, hasToken: true, permission: 'granted', isSubscribed: false }), 'auto_subscribe');
// Já inscrito: só confirma.
assert.equal(decidePaymentPushPrompt({ supported: true, hasToken: true, permission: 'granted', isSubscribed: true }), 'active');
// Negado no navegador: avisa que dá para liberar nas configurações.
assert.equal(decidePaymentPushPrompt({ supported: true, hasToken: true, permission: 'denied', isSubscribed: false }), 'blocked');

// Regressão: a notificação LOCAL de contagem (congela em segundo plano) não pode voltar.
const panel = readFileSync(new URL('../src/components/PixWaitingPanel.tsx', import.meta.url), 'utf8');
assert.ok(!/new Notification\(/.test(panel), 'PixWaitingPanel não cria notificação local');
assert.ok(!/pix-countdown/.test(panel), 'tag pix-countdown removida');
assert.ok(!/Notification\.requestPermission/.test(panel), 'permissão agora é pedida pelo PaymentPushPrompt (com inscrição de push)');
assert.ok(/PaymentPushPrompt/.test(panel), 'PixWaitingPanel usa o PaymentPushPrompt');
const tablePanel = readFileSync(new URL('../src/components/TableSessionPixWaitingPanel.tsx', import.meta.url), 'utf8');
assert.ok(/PaymentPushPrompt/.test(tablePanel), 'Pix de mesa usa o PaymentPushPrompt');

// O service worker precisa tratar focusOnly e renotify.
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
assert.ok(/focusOnly/.test(sw) && /renotify/.test(sw), 'sw.js trata focusOnly e renotify');

console.log('paymentPushPrompt.test.ts OK');
