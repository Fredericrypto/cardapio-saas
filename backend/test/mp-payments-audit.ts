// Auditoria PURA dos pagamentos online (Mercado Pago): dinheiro em centavos,
// status, idempotência e máquina de estados. Não usa banco nem rede.
// Rodar:  npm run test:payments
import { createChecker } from './helpers';
import { centsToMpAmount, chargeCents } from '../src/modules/payments/mp-money';
import { classifyMpStatus, classifyRejection, rejectionMessage } from '../src/modules/payments/mp-status';
import { cardIdempotencyKey, pixOrderIdempotencyKey, refundIdempotencyKey } from '../src/modules/payments/mp-idempotency';
import { isCardOnlineActive, isPixOnlineActive, mpConfigError } from '../src/modules/payments/mp-activation';
import {
  CARD_PAYMENT_WINDOW_MS,
  MAX_CARD_ATTEMPTS,
  decideAfterExistingPayment,
  decideCardAttempt,
  planPaymentEvent,
  type OrderPaymentSnapshot,
  type PaymentEffect,
} from '../src/modules/payments/mp-order-state';

const c = createChecker();
const throws = (fn: () => unknown) => {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
};

// ---- 1) Centavos -> valor do Mercado Pago ---------------------------------
console.log('\n[1] centsToMpAmount');
c.ok(centsToMpAmount(1490) === 14.9, '1490 -> 14.9');
c.ok(centsToMpAmount(1) === 0.01, '1 -> 0.01');
c.ok(centsToMpAmount(100) === 1, '100 -> 1');
c.ok(centsToMpAmount(10) === 0.1, '10 -> 0.1');
c.ok(centsToMpAmount(19999) === 199.99, '19999 -> 199.99');
c.ok(centsToMpAmount(123456789) === 1234567.89, '123456789 -> 1234567.89');
// Exaustivo: para TODO valor de 1 centavo a R$ 5.000,00 o decimal serializado
// bate exatamente com reais.centavos e volta ao mesmo inteiro.
let exhaustiveOk = true;
for (let cents = 1; cents <= 500000; cents += 1) {
  const amount = centsToMpAmount(cents);
  const expected = `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
  const serialized = JSON.stringify(amount);
  if (Number(serialized) !== Number(expected) || Math.round(amount * 100) !== cents || amount.toFixed(2) !== expected) {
    exhaustiveOk = false;
    console.log('   divergência em', cents, amount, expected);
    break;
  }
}
c.ok(exhaustiveOk, 'exaustivo 1..500000 centavos: sem nenhuma divergência');
// Os clássicos que quebram com float: 0.1+0.2, 1.005, 4.35*100, 1.15*100.
c.ok(centsToMpAmount(10 + 20) === 0.3, 'soma em centavos (10+20) -> 0.30 exato (e não 0.30000000000000004)');
c.ok(centsToMpAmount(Math.round(4.35 * 100)) === 4.35, '4.35 (435 centavos)');
c.ok(centsToMpAmount(Math.round(1.15 * 100)) === 1.15, '1.15 (115 centavos)');
c.ok(throws(() => centsToMpAmount(0)), 'recusa 0');
c.ok(throws(() => centsToMpAmount(-1)), 'recusa negativo');
c.ok(throws(() => centsToMpAmount(14.9)), 'recusa fracionário (reais passados por engano)');
c.ok(throws(() => centsToMpAmount(NaN)), 'recusa NaN');
c.ok(throws(() => centsToMpAmount(Infinity)), 'recusa Infinity');
c.ok(throws(() => centsToMpAmount(Number.MAX_SAFE_INTEGER + 1)), 'recusa acima do inteiro seguro');

console.log('\n[1b] chargeCents');
c.ok(chargeCents(4470, 500) === 4970, 'total + gorjeta em inteiros');
c.ok(chargeCents(1990, 0) === 1990, 'sem gorjeta');
c.ok(throws(() => chargeCents(10.5, 0)), 'recusa total fracionário');
c.ok(throws(() => chargeCents(-1, 0)), 'recusa total negativo');
c.ok(throws(() => chargeCents(100, -5)), 'recusa gorjeta negativa');

// ---- 2) Status e recusas ----------------------------------------------------
console.log('\n[2] status do Mercado Pago');
c.ok(classifyMpStatus('approved') === 'paid', 'approved -> paid');
c.ok(classifyMpStatus('authorized') === 'paid', 'authorized -> paid');
c.ok(classifyMpStatus('pending') === 'processing', 'pending -> processing');
c.ok(classifyMpStatus('in_process') === 'processing', 'in_process -> processing');
c.ok(classifyMpStatus('in_mediation') === 'processing', 'in_mediation -> processing');
c.ok(classifyMpStatus('rejected') === 'failed', 'rejected -> failed');
c.ok(classifyMpStatus('cancelled') === 'failed', 'cancelled -> failed');
c.ok(classifyMpStatus('refunded') === 'reversed', 'refunded -> reversed');
c.ok(classifyMpStatus('charged_back') === 'reversed', 'charged_back -> reversed');
c.ok(classifyMpStatus('qualquer_coisa_nova') === 'processing', 'status desconhecido NUNCA vira pago');
c.ok(classifyMpStatus(null) === 'processing' && classifyMpStatus(undefined) === 'processing', 'null/undefined -> processing');

console.log('\n[2b] recusas de cartão');
c.ok(classifyRejection('cc_rejected_insufficient_amount') === 'insufficient_funds', 'falta de saldo');
c.ok(classifyRejection('cc_rejected_bad_filled_security_code') === 'bad_card_data', 'dados errados (cvv)');
c.ok(classifyRejection('cc_rejected_bad_filled_card_number') === 'bad_card_data', 'dados errados (número)');
c.ok(classifyRejection('cc_rejected_bad_filled_date') === 'bad_card_data', 'dados errados (validade)');
c.ok(classifyRejection('cc_rejected_call_for_authorize') === 'call_issuer', 'ligar para o emissor');
c.ok(classifyRejection('cc_rejected_card_disabled') === 'card_disabled', 'cartão desativado');
c.ok(classifyRejection('cc_rejected_max_attempts') === 'max_attempts', 'limite de tentativas');
c.ok(classifyRejection('cc_rejected_duplicated_payment') === 'duplicated', 'pagamento duplicado');
c.ok(classifyRejection('cc_rejected_high_risk') === 'high_risk', 'FRAUDE: alto risco');
c.ok(classifyRejection('rejected_by_regulations') === 'high_risk', 'FRAUDE: regulatório');
c.ok(classifyRejection('cc_rejected_blacklist') === 'high_risk', 'FRAUDE: lista negra');
c.ok(classifyRejection('cc_rejected_other_reason') === 'other', 'outro motivo');
c.ok(classifyRejection(null) === 'other', 'sem detalhe');
c.ok(
  !/fraude|risco|blacklist|lista negra/i.test(rejectionMessage('high_risk')),
  'mensagem de fraude NÃO revela o motivo ao cliente',
);

// ---- 3) Idempotência ------------------------------------------------------------
console.log('\n[3] chaves de idempotência');
c.ok(pixOrderIdempotencyKey('o1') === pixOrderIdempotencyKey('o1'), 'Pix: mesma chave para o mesmo pedido');
c.ok(pixOrderIdempotencyKey('o1') !== pixOrderIdempotencyKey('o2'), 'Pix: pedidos diferentes, chaves diferentes');
c.ok(cardIdempotencyKey('o1', 'tok_A') === cardIdempotencyKey('o1', 'tok_A'), 'Cartão: mesmo pedido + mesmo token = mesma chave (retry/duplo clique não cobra 2x)');
c.ok(cardIdempotencyKey('o1', 'tok_A') !== cardIdempotencyKey('o1', 'tok_B'), 'Cartão: token novo = chave nova (nova tentativa legítima)');
c.ok(cardIdempotencyKey('o1', 'tok_A') !== cardIdempotencyKey('o2', 'tok_A'), 'Cartão: pedidos diferentes, chaves diferentes');
c.ok(!cardIdempotencyKey('o1', 'tok_SECRETO_123').includes('tok_SECRETO_123'), 'o card token NÃO aparece na chave');
c.ok(cardIdempotencyKey('o1', 'tok_A').length <= 100, 'chave cabe no limite do header');
c.ok(refundIdempotencyKey('99') === refundIdempotencyKey('99'), 'Estorno: determinístico por pagamento');

// ---- 3b) Ativação do pagamento online -----------------------------------------
console.log('\n[3b] ativação (token + segredo do webhook [+ chave pública])');
const cfg = (hasAccessToken: boolean, hasWebhookSecret: boolean, hasPublicKey: boolean) => ({ hasAccessToken, hasWebhookSecret, hasPublicKey });
c.ok(isPixOnlineActive(cfg(true, true, false)), 'Pix online: token + segredo');
c.ok(!isPixOnlineActive(cfg(true, false, true)), 'Pix online NÃO liga sem segredo do webhook');
c.ok(!isPixOnlineActive(cfg(false, true, true)), 'Pix online NÃO liga sem token');
c.ok(isCardOnlineActive(cfg(true, true, true)), 'Cartão online: token + segredo + chave pública');
c.ok(!isCardOnlineActive(cfg(true, true, false)), 'Cartão online NÃO liga sem chave pública');
c.ok(!isCardOnlineActive(cfg(true, false, true)), 'Cartão online NÃO liga sem segredo');
c.ok(mpConfigError(cfg(true, false, false)) !== null, 'salvar token sem segredo é erro');
c.ok(mpConfigError(cfg(true, true, false)) === null, 'token + segredo é válido (sem chave pública = só Pix)');
c.ok(mpConfigError(cfg(false, false, true)) !== null, 'chave pública sem token é erro');
c.ok(mpConfigError(cfg(false, false, false)) === null, 'nada configurado é válido (online desligado)');

// ---- 4) Tentativa de cartão -----------------------------------------------------
console.log('\n[4] decideCardAttempt');
const now = new Date('2026-10-13T12:00:00Z');
const future = new Date(now.getTime() + CARD_PAYMENT_WINDOW_MS);
const base: OrderPaymentSnapshot = {
  orderStatus: 'aguardando_pagamento',
  paymentMethod: 'cartao',
  paymentStatus: 'pendente',
  mpPaymentId: null,
  expiresAt: future,
  cardAttempts: 0,
};
const d = (over: Partial<OrderPaymentSnapshot>) => decideCardAttempt({ ...base, ...over }, now);
c.ok(d({}).action === 'proceed', 'pedido novo: pode tentar');
c.ok(d({ paymentStatus: 'recusado', cardAttempts: 1 }).action === 'proceed', 'após recusa: pode tentar de novo');
c.ok(JSON.stringify(d({ paymentMethod: 'pix' })) === JSON.stringify({ action: 'blocked', reason: 'not_card' }), 'pedido Pix: bloqueado');
c.ok(JSON.stringify(d({ paymentMethod: null })) === JSON.stringify({ action: 'blocked', reason: 'not_card' }), 'sem método: bloqueado');
c.ok(JSON.stringify(d({ paymentStatus: 'pago', orderStatus: 'pendente' })) === JSON.stringify({ action: 'blocked', reason: 'already_paid' }), 'já pago: bloqueado (não cobra 2x)');
c.ok(JSON.stringify(d({ orderStatus: 'cancelado' })) === JSON.stringify({ action: 'blocked', reason: 'not_awaiting' }), 'cancelado: bloqueado');
c.ok(JSON.stringify(d({ orderStatus: 'preparando' })) === JSON.stringify({ action: 'blocked', reason: 'not_awaiting' }), 'em preparo: bloqueado');
c.ok(JSON.stringify(d({ expiresAt: new Date(now.getTime() - 1) })) === JSON.stringify({ action: 'blocked', reason: 'expired' }), 'expirado: bloqueado');
c.ok(JSON.stringify(d({ expiresAt: new Date(now.getTime()) })) === JSON.stringify({ action: 'blocked', reason: 'expired' }), 'expira no instante exato: bloqueado');
c.ok(d({ expiresAt: null }).action === 'proceed', 'sem prazo gravado: não bloqueia por prazo');
c.ok(JSON.stringify(d({ paymentStatus: 'processando' })) === JSON.stringify({ action: 'blocked', reason: 'in_flight' }), 'tentativa em andamento: bloqueia a concorrente (duplo clique)');
c.ok(JSON.stringify(d({ cardAttempts: MAX_CARD_ATTEMPTS, paymentStatus: 'recusado' })) === JSON.stringify({ action: 'blocked', reason: 'too_many_attempts' }), 'excedeu tentativas: bloqueado');
c.ok(d({ cardAttempts: MAX_CARD_ATTEMPTS - 1, paymentStatus: 'recusado' }).action === 'proceed', 'última tentativa permitida');
c.ok(d({ paymentStatus: 'pendente', mpPaymentId: '123' }).action === 'check_existing', 'cobrança anterior em aberto: consultar o MP antes');
c.ok(decideAfterExistingPayment('paid') === 'return_paid', 'existente paga: devolve pago, não cobra de novo');
c.ok(decideAfterExistingPayment('processing') === 'return_processing', 'existente em análise/3DS: devolve processando, não cobra de novo');
c.ok(decideAfterExistingPayment('failed') === 'proceed', 'existente recusada: libera nova tentativa');
c.ok(decideAfterExistingPayment('reversed') === 'blocked_reversed', 'existente estornada: bloqueia');

// ---- 5) Eventos de pagamento (webhook/polling) ---------------------------------------
console.log('\n[5] planPaymentEvent');
const cardOrder = { orderStatus: 'aguardando_pagamento', paymentMethod: 'cartao', paymentStatus: 'pendente', mpPaymentId: '111' };
const pixOrder = { orderStatus: 'aguardando_pagamento', paymentMethod: 'pix', paymentStatus: 'pendente', mpPaymentId: '222' };
const ev = (paymentId: string | null, outcome: 'paid' | 'processing' | 'failed' | 'reversed', mpStatus: string | null = null) => ({ paymentId, outcome, mpStatus });

let p = planPaymentEvent(cardOrder, ev('111', 'paid', 'approved'));
c.ok(p.effects.join() === 'mark_paid' && p.next.status === 'pendente' && p.next.paymentStatus === 'pago', 'cartão aprovado: marca pago');
p = planPaymentEvent(cardOrder, ev('111', 'failed', 'rejected'));
c.ok(p.effects.length === 0 && p.next.paymentStatus === 'recusado' && p.next.status === undefined, 'CARTÃO recusado: NÃO cancela o pedido (permite nova tentativa)');
p = planPaymentEvent(pixOrder, ev('222', 'failed', 'rejected'));
c.ok(p.effects.join() === 'cancel_order' && p.next.status === 'cancelado', 'PIX recusado/cancelado: cancela o pedido');
p = planPaymentEvent(cardOrder, ev('111', 'processing', 'in_process'));
c.ok(p.effects.length === 0 && Object.keys(p.next).length === 0, 'em análise/3DS: nada muda');
p = planPaymentEvent(cardOrder, ev('999', 'failed', 'rejected'));
c.ok(p.effects.length === 0 && Object.keys(p.next).length === 0, 'recusa de tentativa ANTIGA é ignorada (não cancela nem marca o pedido)');
p = planPaymentEvent(cardOrder, ev('999', 'paid', 'approved'));
c.ok(p.effects.join() === 'refund_duplicate', 'aprovação de tentativa que não é a do pedido: ESTORNA a duplicada');
p = planPaymentEvent({ ...cardOrder, orderStatus: 'cancelado', paymentStatus: 'falhou' }, ev('111', 'paid', 'approved'));
c.ok(p.effects.join() === 'refund_orphan', 'pago DEPOIS de cancelado/expirado: estorna (dinheiro órfão)');
p = planPaymentEvent({ ...cardOrder, orderStatus: 'cancelado', paymentStatus: 'estornado' }, ev('111', 'paid', 'approved'));
c.ok(p.effects.length === 0, 'já estornado: não estorna de novo');
p = planPaymentEvent({ ...cardOrder, orderStatus: 'pendente', paymentStatus: 'pago' }, ev('111', 'paid', 'approved'));
c.ok(p.effects.length === 0, 'webhook repetido de pedido já pago: nada a fazer');
p = planPaymentEvent({ ...cardOrder, orderStatus: 'preparando', paymentStatus: 'pago' }, ev('111', 'reversed', 'refunded'));
c.ok(p.next.paymentStatus === 'estornado', 'estorno feito no painel do MP: registra estornado');
p = planPaymentEvent({ ...cardOrder, orderStatus: 'entregue', paymentStatus: 'pago' }, ev('111', 'reversed', 'charged_back'));
c.ok(p.next.paymentStatus === 'chargeback', 'chargeback: registra chargeback');
p = planPaymentEvent({ ...cardOrder, orderStatus: 'pendente', paymentStatus: 'pago', mpPaymentId: null }, ev('111', 'reversed', 'refunded'));
c.ok(p.next.paymentStatus === 'estornado', 'pedido sem id gravado ainda aceita estorno do pagamento');

// ---- 6) Concorrência / duplicidade (simulação) -------------------------------------------
console.log('\n[6] concorrência e idempotência (simulação do UPDATE ... WHERE atômico)');
// Modelo do banco: a transição aguardando -> pago só vale UMA vez (o UPDATE com
// WHERE status='aguardando_pagamento' devolve affected=1 para um só concorrente).
function makeDb() {
  const row = { status: 'aguardando_pagamento', paymentStatus: 'pendente', mpPaymentId: '111', paymentMethod: 'cartao' };
  const log: PaymentEffect[] = [];
  return {
    row,
    log,
    async claimPaid(): Promise<boolean> {
      await Promise.resolve(); // cede a vez, como uma ida ao banco
      if (row.status !== 'aguardando_pagamento') return false;
      row.status = 'pendente';
      row.paymentStatus = 'pago';
      return true;
    },
  };
}
async function deliver(db: ReturnType<typeof makeDb>, paymentId: string) {
  // snapshot ANTES da corrida (webhook e polling leram o pedido ao mesmo tempo)
  const snapshot = { orderStatus: 'aguardando_pagamento', paymentMethod: 'cartao', paymentStatus: 'pendente', mpPaymentId: '111' };
  const plan = planPaymentEvent(snapshot, ev(paymentId, 'paid', 'approved'));
  for (const effect of plan.effects) {
    if (effect === 'mark_paid') {
      if (await db.claimPaid()) db.log.push('mark_paid'); // só quem ganha credita cashback / notifica
    } else {
      db.log.push(effect);
    }
  }
}
async function main() {
  const db1 = makeDb();
  await Promise.all([deliver(db1, '111'), deliver(db1, '111')]);
  c.ok(db1.log.filter((e) => e === 'mark_paid').length === 1, 'webhook + polling simultâneos: efeitos (cashback/notificação) rodam UMA vez');
  const db2 = makeDb();
  await Promise.all(Array.from({ length: 25 }, () => deliver(db2, '111')));
  c.ok(db2.log.filter((e) => e === 'mark_paid').length === 1, '25 entregas simultâneas do mesmo webhook: ainda UMA vez');
  c.ok(db2.row.status === 'pendente' && db2.row.paymentStatus === 'pago', 'estado final correto (pendente/pago)');
  const db3 = makeDb();
  await deliver(db3, '111');
  await deliver(db3, '111');
  c.ok(db3.log.filter((e) => e === 'mark_paid').length === 1, 'webhook reenviado depois: nenhum efeito extra');

  // Pagamento duplicado de cartão: 3 chamadas iguais com o mesmo token geram UMA chave.
  const keys = new Set([1, 2, 3].map(() => cardIdempotencyKey('ped-1', 'tok_X')));
  c.ok(keys.size === 1, 'três envios do mesmo token: uma única chave de idempotência');

  // Cenários de pagamento (resultado final esperado pelo cliente).
  console.log('\n[7] cenários de pagamento');
  const scenario = (mpStatus: string, detail: string | null) => {
    const outcome = classifyMpStatus(mpStatus);
    const plan = planPaymentEvent(cardOrder, ev('111', outcome, mpStatus));
    return { outcome, plan, code: outcome === 'failed' ? classifyRejection(detail) : null };
  };
  let s = scenario('approved', 'accredited');
  c.ok(s.plan.effects.join() === 'mark_paid', 'SUCESSO: aprovado -> pago');
  s = scenario('rejected', 'cc_rejected_insufficient_amount');
  c.ok(s.code === 'insufficient_funds' && s.plan.next.paymentStatus === 'recusado' && s.plan.next.status === undefined, 'FALTA DE SALDO: recusado, pedido segue aguardando');
  s = scenario('rejected', 'cc_rejected_high_risk');
  c.ok(s.code === 'high_risk' && s.plan.next.paymentStatus === 'recusado', 'FRAUDE: recusado com mensagem genérica');
  s = scenario('in_process', 'pending_review_manual');
  c.ok(s.outcome === 'processing' && s.plan.effects.length === 0, 'EM ANÁLISE: aguarda, não libera o pedido');
  s = scenario('pending', 'pending_challenge');
  c.ok(s.outcome === 'processing', '3DS pendente: aguarda o desafio');
  s = scenario('charged_back', null);
  c.ok(s.outcome === 'reversed', 'CHARGEBACK: classificado como revertido');

  process.exit(c.finish());
}
void main();
