// Auditoria do catálogo de notificações multilíngue. Não usa banco.
import { PUSH_MESSAGE_KEYS, renderPushMessage, translateRejectionReason } from '../src/common/i18n/push-messages';
import { normalizeLanguage, SUPPORTED_LANGUAGES } from '../src/common/i18n/languages';
import { createChecker } from './helpers';

const { ok, finish } = createChecker();

ok(SUPPORTED_LANGUAGES.length === 3 && normalizeLanguage('xx') === 'pt-BR' && normalizeLanguage(undefined) === 'pt-BR', 'idioma desconhecido cai em pt-BR');
ok(normalizeLanguage('en') === 'en' && normalizeLanguage('es') === 'es', 'en e es são aceitos');

for (const key of PUSH_MESSAGE_KEYS) {
  const copies = SUPPORTED_LANGUAGES.map((l) => renderPushMessage(key, l, { amount: 'R$ 1,00', reason: 'x', text: 't', count: 1, required: 2 }));
  ok(copies.every((c) => c.title.length > 0 && c.body.length > 0 && !/\{\w+\}/.test(c.title + c.body)), `${key}: 3 idiomas completos, sem placeholder sobrando`);
}
const en = renderPushMessage('cashback_earned', 'en', { amount: 'R$ 12,50' });
ok(en.body.includes('R$ 12,50') && !en.body.includes('$12.50') && !/USD|US\$/.test(en.body), 'moeda continua em Reais na versão em inglês');
const es = renderPushMessage('payment_confirmed_order', 'es', { amount: 'R$ 30,00' });
ok(es.body.includes('R$ 30,00'), 'moeda continua em Reais na versão em espanhol');
const promo = renderPushMessage('new_promotion', 'en', { text: 'Pizza em dobro' });
ok(promo.title === 'New promotion!' && promo.body === 'Pizza em dobro', 'texto de promoção (dado do restaurante) não é traduzido');
ok(translateRejectionReason('multiplas_pessoas', 'es').includes('más de una persona') && translateRejectionReason('inexistente', 'en') === 'inexistente', 'motivos de recusa traduzidos; chave desconhecida volta como veio');
process.exit(finish());
