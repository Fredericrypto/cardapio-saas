import assert from 'node:assert/strict';
import {
  detectBrand,
  formatCardNumber,
  formatExpiry,
  luhnValid,
  maskNumber,
  maxCardDigits,
  onlyDigits,
} from '../src/lib/cardBrand';

// Completa um prefixo até `length` dígitos com um dígito verificador de Luhn
// válido (gera números de TESTE; não são cartões reais).
function withLuhn(prefix: string, length: number): string {
  const body = prefix.padEnd(length - 1, '0');
  for (let check = 0; check <= 9; check += 1) {
    const candidate = `${body}${check}`;
    if (luhnValid(candidate)) return candidate;
  }
  throw new Error('sem dígito verificador possível');
}

// 1) Cada marca (números públicos de teste de gateways + BINs gerados).
assert.equal(detectBrand('4111111111111111'), 'visa');
assert.equal(detectBrand('4'), 'visa', 'Visa já pelo primeiro dígito');
assert.equal(detectBrand('4012888888881881'), 'visa');
assert.equal(detectBrand('5555555555554444'), 'mastercard');
assert.equal(detectBrand('378282246310005'), 'amex');
assert.equal(detectBrand('341111111111111'), 'amex');
assert.equal(detectBrand('30569309025904'), 'diners');
assert.equal(detectBrand('36227206271667'), 'diners');
assert.equal(detectBrand('38520000023237'), 'diners');
assert.equal(detectBrand('6062825624254001'), 'hipercard');
assert.equal(detectBrand('3841001111222233'), 'hipercard');
assert.equal(detectBrand('6362970000457013'), 'elo');
assert.equal(detectBrand('5067001234567890'), 'elo');
assert.equal(detectBrand('5090001234567890'), 'elo');
assert.equal(detectBrand('4011781234567890'), 'elo', 'Elo vence Visa quando o BIN de 6 dígitos é do Elo');
assert.equal(detectBrand('6500351234567890'), 'elo');
assert.equal(detectBrand('6516521234567890'), 'elo');

// 2) Desconhecida / vazia / lixo.
assert.equal(detectBrand(''), 'unknown');
assert.equal(detectBrand('abc'), 'unknown');
assert.equal(detectBrand('9999999999999999'), 'unknown');
assert.equal(detectBrand('6011111111111117'), 'unknown', 'Discover não está no escopo');
assert.equal(detectBrand('2'), 'unknown', 'prefixo 2 sozinho ainda é ambíguo');
assert.equal(detectBrand('22'), 'unknown');
assert.equal(detectBrand('5'), 'unknown');

// 3) Faixas do Mastercard: 51-55 e 2221-2720 (bordas incluídas).
for (const prefix of ['51', '52', '53', '54', '55']) assert.equal(detectBrand(withLuhn(prefix, 16)), 'mastercard', prefix);
for (const prefix of ['50', '56', '57']) assert.notEqual(detectBrand(withLuhn(prefix, 16)), 'mastercard', prefix);
assert.equal(detectBrand('2221000000000009'), 'mastercard', 'início da faixa 2221');
assert.equal(detectBrand('2720999999999996'), 'mastercard', 'fim da faixa 2720');
assert.equal(detectBrand('2500000000000000'), 'mastercard');
assert.equal(detectBrand('2220999999999999'), 'unknown', '2220 está fora');
assert.equal(detectBrand('2721000000000000'), 'unknown', '2721 está fora');
assert.equal(detectBrand('2223'), 'mastercard', 'com 4 dígitos a faixa já é decisiva');

// 4) Bordas das faixas de Elo.
assert.equal(detectBrand('506699'), 'elo');
assert.equal(detectBrand('506778'), 'elo');
assert.notEqual(detectBrand('506779'), 'elo');
assert.notEqual(detectBrand('506698'), 'elo');
assert.equal(detectBrand('401178'), 'elo');
assert.equal(detectBrand('401179'), 'elo');
assert.notEqual(detectBrand('401180'), 'elo');

// 5) Entrada com espaços, hífens e letras.
assert.equal(detectBrand('4111 1111 1111 1111'), 'visa');
assert.equal(detectBrand('  5555-5555-5555-4444  '), 'mastercard');
assert.equal(detectBrand('37x8 2822 4631 0005'), 'amex');
assert.equal(onlyDigits('4a1b1-1 x'), '4111');

// 6) Luhn.
assert.equal(luhnValid('4111111111111111'), true);
assert.equal(luhnValid('4111 1111 1111 1111'), true, 'ignora espaços');
assert.equal(luhnValid('5555555555554444'), true);
assert.equal(luhnValid('378282246310005'), true);
assert.equal(luhnValid('4111111111111112'), false, 'dígito verificador errado');
assert.equal(luhnValid('4111-1111-1111-111x'), false, 'letra some e o número fica curto (15 dígitos inválidos)');
assert.equal(luhnValid(''), false);
assert.equal(luhnValid('4111'), false, 'incompleto');
assert.equal(luhnValid('0'.repeat(20)), false, 'longo demais');
assert.equal(luhnValid(withLuhn('4', 16)), true);
assert.equal(luhnValid(withLuhn('34', 15)), true);

// 7) Formatação por marca: Amex 4-6-5, demais 4-4-4-4; corta o excesso.
assert.equal(formatCardNumber('4111111111111111'), '4111 1111 1111 1111');
assert.equal(formatCardNumber('378282246310005'), '3782 822463 10005');
assert.equal(formatCardNumber('3782'), '3782');
assert.equal(formatCardNumber('37828'), '3782 8');
assert.equal(formatCardNumber('3782822463'), '3782 822463');
assert.equal(formatCardNumber('37828224631000599999'), '3782 822463 10005', 'Amex corta em 15 dígitos');
assert.equal(formatCardNumber('41111111111111119999'), '4111 1111 1111 1111', 'demais cortam em 16 dígitos');
assert.equal(formatCardNumber('4111 abcd 1111'), '4111 1111');
assert.equal(formatCardNumber(''), '');
assert.equal(formatCardNumber('12345678'), '1234 5678', 'marca desconhecida usa 4-4-4-4');
assert.equal(maxCardDigits('amex'), 15);
assert.equal(maxCardDigits('visa'), 16);
assert.equal(maxCardDigits('unknown'), 16);

// 8) Máscara do desenho do cartão.
assert.equal(maskNumber(''), '\u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022');
assert.equal(maskNumber('4111'), '4111 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022');
assert.equal(maskNumber('4111 1111 1111 1111'), '4111 1111 1111 1111');
assert.equal(maskNumber('37'), '37\u2022\u2022 \u2022\u2022\u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022\u2022');
assert.equal(maskNumber('378282246310005'), '3782 822463 10005');
assert.equal(maskNumber('abc'), '\u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022');
assert.equal(maskNumber('4111111111111111').length, 19);

// 9) Validade MM/AA.
assert.equal(formatExpiry(''), '');
assert.equal(formatExpiry('1'), '1');
assert.equal(formatExpiry('12'), '12', 'sem barra automática (permite apagar)');
assert.equal(formatExpiry('123'), '12/3');
assert.equal(formatExpiry('1230'), '12/30');
assert.equal(formatExpiry('12/30'), '12/30');
assert.equal(formatExpiry('12305'), '12/30', 'corta em 4 dígitos');
assert.equal(formatExpiry('3'), '03', 'primeiro dígito > 1 completa o zero');
assert.equal(formatExpiry('35'), '03/5');
assert.equal(formatExpiry('13'), '12', 'mês limitado a 12');
assert.equal(formatExpiry('ab1c2d'), '12');

console.log('cardBrand: ok');
