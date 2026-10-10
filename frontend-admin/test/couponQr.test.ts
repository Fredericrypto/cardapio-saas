import assert from 'node:assert/strict';
import { extractCouponCode } from '../src/lib/couponQr';

assert.equal(extractCouponCode('  ABCD-1234-EF56\n'), 'ABCD-1234-EF56');
assert.equal(extractCouponCode('https://app.exemplo.com/verificar?code=ABCD-1234'), 'ABCD-1234');
assert.equal(extractCouponCode('https://app.exemplo.com/cupom/ABCD-1234/'), 'ABCD-1234');
assert.equal(extractCouponCode(''), null);
assert.equal(extractCouponCode('   '), null);
assert.equal(extractCouponCode('<script>alert(1)</script>'), null, 'HTML nunca vira código');
assert.equal(extractCouponCode('dois codigos aqui'), null, 'espaço no meio não é código');
assert.equal(extractCouponCode('A'.repeat(500)), null, 'tamanho absurdo é recusado');
assert.equal(extractCouponCode('http://'), null);
console.log('couponQr: OK');
