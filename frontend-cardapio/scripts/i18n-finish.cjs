// Etapa final do i18n do cardápio — constantes de módulo, regras de promoção,
// gênero e frases partidas. EDITA NO LUGAR, ATÔMICO (se faltar âncora, não grava
// nada) e IDEMPOTENTE.
//   node scripts/i18n-finish.cjs          -> relatório
//   node scripts/i18n-finish.cjs --write  -> grava
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../src');
const WRITE = process.argv.includes('--write');
const OUT = new Map();
const problems = [];
const done = [];
const read = (rel) => { const f = path.join(ROOT, rel); return OUT.has(f) ? OUT.get(f) : fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null; };
const put = (rel, c) => OUT.set(path.join(ROOT, rel), c);
const esc = (v) => v.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const relImport = (fileRel, target) => ((fileRel.split('/').length - 1) === 0 ? './' : '../'.repeat(fileRel.split('/').length - 1)) + target;
function addImport(c, line, marker) {
  if (c.includes(marker)) return c;
  const m = c.match(/^import /m);
  return m ? c.slice(0, m.index) + line + '\n' + c.slice(m.index) : line + '\n' + c;
}

// ---------------- chaves (pt / en / es) ----------------
const K = {
  'status.awaitingPix': ['Aguardando Pix', 'Awaiting Pix', 'Esperando Pix'],
  'status.pending': ['Pendente', 'Pending', 'Pendiente'],
  'status.confirmed': ['Confirmado', 'Confirmed', 'Confirmado'],
  'status.preparing': ['Preparando', 'Preparing', 'Preparando'],
  'status.ready': ['Pronto', 'Ready', 'Listo'],
  'status.delivered': ['Entregue', 'Delivered', 'Entregado'],
  'status.cancelled': ['Cancelado', 'Cancelled', 'Cancelado'],
  'status.open': ['Em aberto', 'Open', 'Abierta'],
  'status.closing': ['Fechando', 'Closing', 'Cerrando'],
  'status.closed': ['Fechada', 'Closed', 'Cerrada'],
  'payment.pix': ['Pix', 'Pix', 'Pix'],
  'payment.card': ['Cartão', 'Card', 'Tarjeta'],
  'payment.cash': ['Dinheiro', 'Cash', 'Efectivo'],
  'pixKey.email': ['E-mail', 'Email', 'Correo electrónico'],
  'pixKey.phone': ['Celular', 'Mobile', 'Celular'],
  'pixKey.cpf': ['CPF', 'CPF', 'CPF'],
  'pixKey.random': ['Chave aleatória', 'Random key', 'Clave aleatoria'],
  'gender.male': ['Masculino', 'Male', 'Masculino'],
  'gender.female': ['Feminino', 'Female', 'Femenino'],
  'gender.other': ['Outro', 'Other', 'Otro'],
  'gender.unspecified': ['Prefiro não dizer', 'Prefer not to say', 'Prefiero no decirlo'],
  'addons.chooseUpTo': ['Escolha até {max}', 'Choose up to {max}', 'Elige hasta {max}'],
  'addons.chooseOne': ['Escolha 1', 'Choose 1', 'Elige 1'],
  'addons.chooseN': ['Escolha {min}', 'Choose {min}', 'Elige {min}'],
  'addons.chooseRange': ['Escolha de {min} a {max}', 'Choose {min} to {max}', 'Elige de {min} a {max}'],
  'promotions.min_amount_remaining': ['Faltam R$ {missing} pro pedido mínimo de R$ {minimum}.', 'R$ {missing} short of the R$ {minimum} minimum order.', 'Faltan R$ {missing} para el pedido mínimo de R$ {minimum}.'],
  'promotions.reason.alreadyUsed': ['Você já usou essa promoção.', 'You already used this promotion.', 'Ya usaste esta promoción.'],
  'promotions.reason.noEligibleItems': ['Nenhum item do seu carrinho é elegível pra essa promoção.', 'None of the items in your cart are eligible for this promotion.', 'Ningún artículo de tu carrito es elegible para esta promoción.'],
  'promotions.reason.noItemsLeft': ['Nenhum item sobrou no carrinho pra esse cupom depois dos outros aplicados.', 'No items left in the cart for this coupon after the others were applied.', 'No quedan artículos en el carrito para este cupón después de aplicar los otros.'],
  'promotions.reason.noDiscount': ['Essa promoção não gera desconto pra esse carrinho.', 'This promotion gives no discount for this cart.', 'Esta promoción no genera descuento para este carrito.'],
  'peopleOrders.ainda_nao_pediu_nada': ['Ainda não pediu nada', 'Has not ordered anything yet', 'Aún no ha pedido nada'],
  'address.street': ['Rua', 'Street', 'Calle'],
  'cart.distanceAndFee': ['Distância: {km} km · Taxa de entrega: R$ {fee}', 'Distance: {km} km · Delivery fee: R$ {fee}', 'Distancia: {km} km · Tarifa de entrega: R$ {fee}'],
  'cart.payOnDelivery': ['{method} na entrega', '{method} on delivery', '{method} en la entrega'],
  'cart.payOnPickup': ['{method} na retirada', '{method} on pickup', '{method} en la recogida'],
  'closing.availableBalance': ['Saldo disponível: R$ {amount}', 'Available balance: R$ {amount}', 'Saldo disponible: R$ {amount}'],
  'pix.countdownNotification': ['Pedido aguardando pagamento Pix • faltam {minutes}:{seconds}', 'Order awaiting Pix payment • {minutes}:{seconds} left', 'Pedido esperando el pago por Pix • faltan {minutes}:{seconds}'],
};
for (const [lang, idx] of [['pt-BR', 0], ['en', 1], ['es', 2]]) {
  const rel = `i18n/dictionaries/${lang}.ts`;
  let d = read(rel);
  if (d == null) { problems.push(`ausente: ${rel}`); continue; }
  const marker = lang === 'pt-BR' ? '  // Erros genéricos\n' : "  'error.generic'";
  if (!d.includes(marker)) { problems.push(`âncora não encontrada em ${rel}`); continue; }
  let block = '';
  for (const [k, v] of Object.entries(K)) if (!d.includes(`'${k}'`)) block += `  '${k}': '${esc(v[idx])}',\n`;
  if (block) d = d.replace(marker, () => block + '\n' + marker);
  put(rel, d);
}

// ---------------- helper compartilhado ----------------
put('i18n/labels.ts', `import type { TranslationKey } from './dictionaries/pt-BR';

// Rótulos de dados que o backend devolve como código (status, forma de pagamento,
// tipo de chave Pix, gênero) e regras de seleção de adicionais — todos no idioma
// do app. Código desconhecido aparece como veio.
type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

const ORDER_STATUS: Record<string, TranslationKey> = {
  aguardando_pagamento: 'status.awaitingPix',
  pendente: 'status.pending',
  confirmado: 'status.confirmed',
  preparando: 'status.preparing',
  pronto: 'status.ready',
  entregue: 'status.delivered',
  cancelado: 'status.cancelled',
};
const SESSION_STATUS: Record<string, TranslationKey> = {
  aberta: 'status.open',
  fechamento_solicitado: 'status.closing',
  fechada: 'status.closed',
};
const PAYMENT: Record<string, TranslationKey> = { pix: 'payment.pix', cartao: 'payment.card', dinheiro: 'payment.cash' };
const PIX_KEY: Record<string, TranslationKey> = {
  email: 'pixKey.email',
  telefone: 'pixKey.phone',
  cpf: 'pixKey.cpf',
  aleatoria: 'pixKey.random',
};
const GENDER: Record<string, TranslationKey> = {
  masculino: 'gender.male',
  feminino: 'gender.female',
  outro: 'gender.other',
  prefiro_nao_dizer: 'gender.unspecified',
};

const pick = (map: Record<string, TranslationKey>, code: string | null | undefined, t: Translate): string => {
  if (!code) return '';
  const key = map[code];
  return key ? t(key) : code;
};

export const orderStatusLabel = (status: string | null | undefined, t: Translate) => pick(ORDER_STATUS, status, t);
export const sessionStatusLabel = (status: string | null | undefined, t: Translate) => pick(SESSION_STATUS, status, t);
export const paymentMethodLabel = (method: string | null | undefined, t: Translate) => pick(PAYMENT, method, t);
export const pixKeyTypeLabel = (type: string | null | undefined, t: Translate) => pick(PIX_KEY, type, t);
export const genderLabel = (value: string | null | undefined, t: Translate) => pick(GENDER, value, t);

// Regra do grupo de adicionais: nada quando é livre (0 a 1), "Escolha até N" quando
// opcional com teto, "Escolha N" quando obrigatório fixo, ou a faixa.
export function addonGroupHint(minSelect: number, maxSelect: number, t: Translate): string | null {
  if (minSelect === 0 && maxSelect <= 1) return null;
  if (minSelect === 0) return t('addons.chooseUpTo', { max: maxSelect });
  if (minSelect === maxSelect) return minSelect === 1 ? t('addons.chooseOne') : t('addons.chooseN', { min: minSelect });
  return t('addons.chooseRange', { min: minSelect, max: maxSelect });
}

// Motivo de inelegibilidade de promoção (lib/promotionEligibility.ts devolve o
// código + valores; o texto sai aqui, no idioma do app).
export type PromoReasonCode = 'already_used' | 'min_order' | 'no_eligible_items' | 'no_items_left' | 'no_discount';
export interface PromoReasonSource {
  reason: string | null;
  reasonCode?: PromoReasonCode;
  reasonParams?: { missing: string; minimum: string };
}
export function promotionReasonLabel(source: PromoReasonSource | null | undefined, t: Translate): string | null {
  if (!source) return null;
  switch (source.reasonCode) {
    case 'already_used': return t('promotions.reason.alreadyUsed');
    case 'min_order':
      return source.reasonParams ? t('promotions.min_amount_remaining', source.reasonParams) : source.reason;
    case 'no_eligible_items': return t('promotions.reason.noEligibleItems');
    case 'no_items_left': return t('promotions.reason.noItemsLeft');
    case 'no_discount': return t('promotions.reason.noDiscount');
    default: return source.reason;
  }
}
`);

// ---------------- trocas ----------------
function swap(rel, pairs, imports = [], doneMarker = null) {
  let c = read(rel);
  if (c == null) { problems.push(`arquivo ausente: ${rel}`); return; }
  if (doneMarker && c.includes(doneMarker)) return; // já aplicado: idempotente
  const before = c;
  for (const [from, to, required = true] of pairs) {
    const rx = from instanceof RegExp;
    const has = rx ? from.test(c) : c.includes(from);
    if (!has) { if (required && !(typeof to === 'string' && to && c.includes(to))) problems.push(`âncora não encontrada em ${rel}: ${rx ? from : from.slice(0, 80)}`); continue; }
    c = rx ? c.replace(from, to) : c.split(from).join(to);
  }
  if (c !== before) {
    for (const [line, marker] of imports) c = addImport(c, line.replace('@', relImport(rel, 'i18n')), marker);
    put(rel, c);
    done.push(rel);
  }
}
const LBL = (names) => [`import { ${names} } from '@/labels';`, 'i18n/labels'];
const lblImport = (names) => [`import { ${names} } from '@/labels';`, 'i18n/labels'];

swap('pages/MyAccountPage.tsx', [
  [/const STATUS_LABELS: Record<string, string> = \{[^}]*\};\n\n?/, ''],
  [/STATUS_LABELS\[order\.status\] \?\? order\.status/g, 'orderStatusLabel(order.status, t)'],
], [lblImport('orderStatusLabel')], "i18n/labels'");
swap('components/ReceiptContentStandalone.tsx', [
  [/const STATUS_LABELS: Record<string, string> = \{[^}]*\};\n\n?/, ''],
  ['STATUS_LABELS[order.status] ?? order.status', 'orderStatusLabel(order.status, t)'],
], [lblImport('orderStatusLabel')], "i18n/labels'");
swap('pages/OrderHistoryPage.tsx', [
  ['Record<string, { label: string; bg: string; color: string }>', 'Record<string, { bg: string; color: string }>'],
  [/\{ label: '[^']*', bg:/g, '{ bg:'],
  [/\n\s*label: item\.sessionStatus,/, ''],
  [/\n\s*label: item\.status,/, ''],
  ['{statusStyle.label}', '{__LABEL__}'],
], [lblImport('orderStatusLabel, sessionStatusLabel')], "i18n/labels'");
{
  const rel = 'pages/OrderHistoryPage.tsx';
  let c = read(rel);
  if (c && c.includes('{__LABEL__}')) {
    c = c.replace('{__LABEL__}', '{sessionStatusLabel(item.sessionStatus, t)}').replace('{__LABEL__}', '{orderStatusLabel(item.status, t)}');
    put(rel, c);
  }
}
swap('components/ClosingPaymentSheet.tsx', [
  [/const PAYMENT_METHODS: \{ value: 'pix' \| 'cartao' \| 'dinheiro'; label: string \}\[\] = \[[^\]]*\];/, "const PAYMENT_METHODS: { value: 'pix' | 'cartao' | 'dinheiro' }[] = [{ value: 'pix' }, { value: 'cartao' }, { value: 'dinheiro' }];"],
  ['{method.label}', '{paymentMethodLabel(method.value, t)}'],
  ["Saldo disponível: R$ {cashbackBalance.toFixed(2).replace('.', ',')}", "{t('closing.availableBalance', { amount: cashbackBalance.toFixed(2).replace('.', ',') })}"],
], [lblImport('paymentMethodLabel')], "i18n/labels'");
swap('pages/CartPage.tsx', [
  [/const PAYMENT_METHOD_LABELS: Record<string, string> = \{[^}]*\};\n\n?/, ''],
  ['{PAYMENT_METHOD_LABELS[orderSnapshot.paymentMethod]}', '{paymentMethodLabel(orderSnapshot.paymentMethod, t)}'],
  ['<span>{PAYMENT_METHOD_LABELS[method]}</span>', '<span>{paymentMethodLabel(method, t)}</span>'],
  ["{PAYMENT_METHOD_LABELS[paymentMethod]} na {orderType === 'entrega' ? 'entrega' : 'retirada'}", "{t(orderType === 'entrega' ? 'cart.payOnDelivery' : 'cart.payOnPickup', { method: paymentMethodLabel(paymentMethod, t) })}"],
  [/\{t\('cartPage\.distancia'\)\} \{quote\.distanceKm\.toFixed\(1\)\} km · Taxa de entrega: R\$\{' '\}\s*\{quote\.fee\.toFixed\(2\)\.replace\('\.', ','\)\}/, "{t('cart.distanceAndFee', { km: quote.distanceKm.toFixed(1), fee: quote.fee.toFixed(2).replace('.', ',') })}"],
], [lblImport('paymentMethodLabel, promotionReasonLabel')], "i18n/labels'");
swap('pages/CustomerPixWalletPage.tsx', [
  [/const PIX_KEY_TYPE_LABELS: Record<string, string> = \{[^}]*\};\n\n?/, ''],
  ["{PIX_KEY_TYPE_LABELS[customer.pixKeyType ?? ''] ?? customer.pixKeyType}", '{pixKeyTypeLabel(customer.pixKeyType, t)}'],
], [lblImport('pixKeyTypeLabel')], "i18n/labels'");
swap('pages/EditProfilePage.tsx', [
  [/const GENDER_OPTIONS: \{ value: string; label: string \}\[\] = \[[^\]]*\];/, "const GENDER_OPTIONS: { value: string }[] = [\n  { value: 'masculino' },\n  { value: 'feminino' },\n  { value: 'outro' },\n  { value: 'prefiro_nao_dizer' },\n];"],
  ['{option.label}', '{genderLabel(option.value, t)}'],
], [lblImport('genderLabel')], "i18n/labels'");
swap('pages/ProductDetailPage.tsx', [
  [/function groupHint\(minSelect: number, maxSelect: number\): string \| null \{[\s\S]*?\n\}\n\n?/, ''],
  [/groupHint\(([^()]*)\)/g, 'addonGroupHint($1, t)'],
], [lblImport('addonGroupHint')], "i18n/labels'");
swap('components/PeopleOrders.tsx', [
  ["  emptyLabel = 'Ainda não pediu nada',\n", '  emptyLabel,\n'],
  ['>{emptyLabel}</p>', ">{emptyLabel ?? t('peopleOrders.ainda_nao_pediu_nada')}</p>"],
], [], "emptyLabel ?? t(");
swap('components/PixWaitingPanel.tsx', [
  ["body: `Pedido aguardando pagamento Pix • faltam ${minutes}:${seconds.toString().padStart(2, '0')}`,", "body: translate(readStoredLanguage(), 'pix.countdownNotification', { minutes, seconds: seconds.toString().padStart(2, '0') }),"],
], [
  ["import { readStoredLanguage } from '@/languages';", 'readStoredLanguage }'],
  ["import { translate } from '@/translate';", "{ translate } from"],
], "pix.countdownNotification");
swap('pages/CartPage.tsx', [['placeholder="Rua"', "placeholder={t('address.street')}"]], [], "t('address.street')");
swap('pages/SavedAddressPage.tsx', [['placeholder="Rua"', "placeholder={t('address.street')}"]], [], "t('address.street')");
// abas / "ganho em" do cashback, se o refino ainda não os tratou
swap('pages/CustomerCashbackPage.tsx', [
  ["label: 'Disponíveis'", "labelKey: 'cashback.tab.available'", false],
], []);

// ---------------- regras de promoção (lib + consumidores) ----------------
swap('lib/promotionEligibility.ts', [
  ["export interface PromotionEligibility {\n  isEligible: boolean;\n  discountAmount: number;\n  reason: string | null;", "export interface PromotionEligibility {\n  isEligible: boolean;\n  discountAmount: number;\n  reason: string | null;\n  reasonCode?: PromoReasonCode;\n  reasonParams?: { missing: string; minimum: string };"],
  ["export interface SinglePromoResult {\n  discountAmount: number;\n  isEligible: boolean;\n  reason: string | null;", "export interface SinglePromoResult {\n  discountAmount: number;\n  isEligible: boolean;\n  reason: string | null;\n  reasonCode?: PromoReasonCode;\n  reasonParams?: { missing: string; minimum: string };"],
  ["reason: 'Você já usou essa promoção.', discountedQuantityByLine: empty", "reason: 'Você já usou essa promoção.', reasonCode: 'already_used', discountedQuantityByLine: empty"],
  ["isEligible: false, reason: 'Você já usou essa promoção.' }", "isEligible: false, reason: 'Você já usou essa promoção.', reasonCode: 'already_used' }"],
  [/reason: `Faltam R\$ \$\{missing\.toFixed\(2\)\.replace\('\.', ','\)\} pro pedido mínimo de R\$ \$\{promo\.minOrderValue\.toFixed\(2\)\.replace\('\.', ','\)\}\.`,/g,
   "reason: `Faltam R$ ${missing.toFixed(2).replace('.', ',')} pro pedido mínimo de R$ ${promo.minOrderValue.toFixed(2).replace('.', ',')}.`,\n      reasonCode: 'min_order',\n      reasonParams: { missing: missing.toFixed(2).replace('.', ','), minimum: promo.minOrderValue.toFixed(2).replace('.', ',') },"],
  ["reason: 'Nenhum item do seu carrinho é elegível pra essa promoção.',\n      discountedQuantityByLine: empty", "reason: 'Nenhum item do seu carrinho é elegível pra essa promoção.',\n      reasonCode: 'no_eligible_items',\n      discountedQuantityByLine: empty"],
  ["reason: 'Essa promoção não gera desconto pra esse carrinho.', discountedQuantityByLine: empty", "reason: 'Essa promoção não gera desconto pra esse carrinho.', reasonCode: 'no_discount', discountedQuantityByLine: empty"],
  ["        reason:\n          promos.length > 1\n            ? 'Nenhum item sobrou no carrinho pra esse cupom depois dos outros aplicados.'\n            : 'Nenhum item do seu carrinho é elegível pra essa promoção.',", "        reason:\n          promos.length > 1\n            ? 'Nenhum item sobrou no carrinho pra esse cupom depois dos outros aplicados.'\n            : 'Nenhum item do seu carrinho é elegível pra essa promoção.',\n        reasonCode: promos.length > 1 ? 'no_items_left' : 'no_eligible_items',"],
  ["        reason: 'Essa promoção não gera desconto pra esse carrinho.',\n      });", "        reason: 'Essa promoção não gera desconto pra esse carrinho.',\n        reasonCode: 'no_discount',\n      });"],
], [], "reasonCode: 'min_order'");
{
  const rel = 'lib/promotionEligibility.ts';
  let c = read(rel);
  if (c) { c = addImport(c, `import type { PromoReasonCode } from '${relImport(rel, 'i18n/labels')}';`, 'PromoReasonCode }'); put(rel, c); }
}
swap('pages/CartPage.tsx', [
  ["result?.reason ?? t('cartPage.nao_elegivel_pra_esse')", "promotionReasonLabel(result, t) ?? t('cartPage.nao_elegivel_pra_esse')"],
  ["(result?.reason ?? t('cartPage.nao_elegivel_pra_esse'))", "(promotionReasonLabel(result, t) ?? t('cartPage.nao_elegivel_pra_esse'))"],
], [], "promotionReasonLabel(");
swap('pages/PromotionDetailPage.tsx', [
  ['{eligibility.reason}\n', '{promotionReasonLabel(eligibility, t)}\n'],
], [lblImport('promotionReasonLabel')], "promotionReasonLabel(");

// '@/x' -> relativo
for (const f of [...OUT.keys()]) {
  const rel = path.relative(ROOT, f);
  if (!/\.tsx?$/.test(rel)) continue;
  OUT.set(f, OUT.get(f).replace(/from '@\/(\w+)'/g, (m, t) => `from '${relImport(rel, 'i18n/' + t)}'`));
}

// package.json: inclui o teste novo em test:logic
{
  const pj = path.resolve(ROOT, '../package.json');
  const raw = fs.readFileSync(pj, 'utf8');
  const add = 'npx --yes tsx test/labels.test.ts';
  if (!raw.includes(add)) {
    const re = /("test:logic":\s*"[^"]*?)"/;
    if (re.test(raw)) OUT.set(pj, raw.replace(re, (m, a) => `${a} && ${add}"`));
    else problems.push('package.json: script test:logic não encontrado');
  }
}

console.log(`${WRITE ? 'GRAVANDO' : 'RELATÓRIO'}: ${OUT.size} arquivos afetados`);
done.forEach((f) => console.log(' -', f));
if (problems.length) {
  console.error('\nABORTADO (nada foi gravado):\n- ' + problems.join('\n- '));
  process.exit(1);
}
if (WRITE) { for (const [f, c] of OUT) fs.writeFileSync(f, c); console.log('OK: gravado. Rode: npm run build'); }
else console.log('Nada gravado (use --write).');
