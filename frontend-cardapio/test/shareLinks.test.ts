import assert from 'node:assert/strict';
import { buildShareUrl } from '../src/lib/shareLinks';
assert.equal(buildShareUrl('produto', 'pizzaria', 'abc-123', 'https://app.com'), 'https://app.com/pizzaria/produto/abc-123');
assert.equal(buildShareUrl('promocao', 'pizzaria', 'p-9', 'https://app.com'), 'https://app.com/pizzaria/promocao/p-9');
assert.equal(buildShareUrl('produto', 'a b', 'x/y', 'https://app.com'), 'https://app.com/a%20b/produto/x%2Fy');
console.log('shareLinks: ok');
