import assert from 'node:assert/strict';
import { isNewProduct, NEW_PRODUCT_DAYS } from '../src/lib/productBadges';

const DAY = 86_400_000;
const now = Date.parse('2026-10-14T12:00:00Z');
const ago = (ms: number) => new Date(now - ms).toISOString();

assert.equal(NEW_PRODUCT_DAYS, 7);
assert.equal(isNewProduct(ago(0), now), true, 'criado agora é novo');
assert.equal(isNewProduct(ago(2 * DAY), now), true);
assert.equal(isNewProduct(ago(7 * DAY - 1), now), true, 'faltando 1ms para 7 dias ainda é novo');
assert.equal(isNewProduct(ago(7 * DAY), now), false, 'com 7 dias completos deixa de ser novo');
assert.equal(isNewProduct(ago(30 * DAY), now), false);
assert.equal(isNewProduct(new Date(now + 5 * 60_000).toISOString(), now), true, 'relógio do aparelho atrasado: continua novo');
assert.equal(isNewProduct(undefined, now), false);
assert.equal(isNewProduct(null, now), false);
assert.equal(isNewProduct('', now), false);
assert.equal(isNewProduct('isto-nao-e-data', now), false);
console.log('productBadges: ok');
