// Auditoria (sem banco) do push de pagamento Pix: "Pague até HH:MM" -> "Pagamento confirmado".
// Garante: horário-limite fixo em America/Sao_Paulo, texto nos 3 idiomas, e que a notificação de
// "aguardando" e a de "confirmado" compartilham o MESMO groupTag (é isso que faz uma substituir a outra).
import {
  formatPaymentDeadline,
  orderPaymentGroupTag,
  tablePaymentGroupTag,
  buildPaymentPendingPush,
  buildPaymentExpiredPush,
  PAYMENT_CONFIRMED_FLAGS,
} from '../src/common/utils/payment-push';
import { renderPushMessage } from '../src/common/i18n/push-messages';
import { SUPPORTED_LANGUAGES } from '../src/common/i18n/languages';
import { createChecker } from './helpers';

const { ok, finish } = createChecker();

// 1) Horário-limite: sempre America/Sao_Paulo (UTC-3, sem horário de verão), 2 dígitos, 24h.
ok(formatPaymentDeadline(new Date('2026-10-27T17:30:00Z')) === '14:30', '17:30Z vira 14:30 em Sao Paulo');
ok(formatPaymentDeadline(new Date('2026-10-27T03:05:00Z')) === '00:05', 'meia-noite é 00:05, nunca 24:05');
ok(formatPaymentDeadline(new Date('2026-10-27T12:09:59Z')) === '09:09', 'minuto e hora com zero à esquerda');

// 2) Chaves de mensagem existem nos 3 idiomas e carregam valor e horário.
for (const key of ['payment_pending_order', 'payment_pending_table'] as const) {
  for (const lang of SUPPORTED_LANGUAGES) {
    const copy = renderPushMessage(key, lang, { amount: 'R$ 12,50', time: '14:30' });
    ok(copy.title.length > 0 && copy.body.includes('R$ 12,50') && copy.body.includes('14:30') && !/\{\w+\}/.test(copy.title + copy.body), `${key}/${lang}: valor e horário, sem placeholder sobrando`);
  }
}
ok(renderPushMessage('payment_pending_order', 'en', { amount: 'R$ 1,00', time: '09:00' }).body.includes('R$ 1,00'), 'moeda continua em Reais em inglês');

// 3) groupTag: pedido avulso e mesa compartilham a forma da notificação de "confirmado".
ok(orderPaymentGroupTag('abc') === 'payment-abc', 'groupTag do pedido avulso (mesmo valor que o push de confirmado já usava)');
ok(tablePaymentGroupTag('s1', 'c1') === 'payment-session-s1-c1', 'groupTag da mesa (mesmo valor que o push de confirmado já usava)');

// 4) Payload de "aguardando": categoria payment_completed, groupTag igual, toque só foca, não navega.
const pending = buildPaymentPendingPush({
  kind: 'order',
  amountCents: 1250,
  expiresAt: new Date('2026-10-27T17:30:00Z'),
  url: '/loja/conta-cliente/pedidos/avulso/abc',
  groupTag: orderPaymentGroupTag('abc'),
  icon: 'https://x/logo.png',
});
ok(pending.tag === 'payment_completed', 'reutiliza a categoria payment_completed (uma preferência só)');
ok(pending.groupTag === 'payment-abc', 'mesmo groupTag do push de confirmado');
ok(pending.focusOnly === true, 'toque na notificação de aguardando só foca o app (não navega e perde o QR)');
ok(pending.i18n?.key === 'payment_pending_order' && pending.i18n?.params?.time === '14:30' && pending.i18n?.params?.amount === 'R$ 12,50', 'i18n com valor e horário');
ok(pending.body.includes('14:30') && pending.body.includes('R$ 12,50'), 'fallback pt-BR traz horário e valor');
const pendingTable = buildPaymentPendingPush({ kind: 'table', amountCents: 5000, expiresAt: new Date('2026-10-27T17:45:00Z'), url: '/loja/x', groupTag: tablePaymentGroupTag('s1', 'c1') });
ok(pendingTable.i18n?.key === 'payment_pending_table' && pendingTable.i18n?.params?.time === '14:45', 'mesa usa a chave de mesa e o horário de 15 min');

// 5) Confirmado: renotify (senão a substituição é silenciosa no Android).
ok(PAYMENT_CONFIRMED_FLAGS.renotify === true, 'confirmado substitui E avisa (renotify)');

// 6) Expirado: só chega se o Pix NÃO foi pago (a trava é atômica no banco); aqui se garante o
// payload: substitui o "Pague até" (mesmo groupTag) e avisa de novo (renotify).
for (const key of ['payment_expired_order', 'payment_expired_table'] as const) {
  for (const lang of SUPPORTED_LANGUAGES) {
    const copy = renderPushMessage(key, lang, {});
    ok(copy.title.length > 0 && copy.body.length > 0 && !/\{\w+\}/.test(copy.title + copy.body), `${key}/${lang}: completo, sem placeholder`);
  }
}
const expired = buildPaymentExpiredPush({ kind: 'order', url: '/loja/conta-cliente/pedidos/avulso/abc', groupTag: orderPaymentGroupTag('abc') });
ok(expired.groupTag === pending.groupTag, 'expirado usa o MESMO groupTag do aguardando (substitui, não empilha)');
ok(expired.tag === 'payment_completed' && expired.renotify === true && !expired.focusOnly, 'expirado: mesma categoria, avisa de novo, toque abre o pedido');
ok(expired.i18n?.key === 'payment_expired_order', 'chave de pedido');
const expiredTable = buildPaymentExpiredPush({ kind: 'table', url: '/loja/x', groupTag: tablePaymentGroupTag('s1', 'c1') });
ok(expiredTable.groupTag === pendingTable.groupTag && expiredTable.i18n?.key === 'payment_expired_table', 'mesa: mesmo groupTag do aguardando e chave de mesa');

process.exit(finish());

