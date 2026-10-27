import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SPRIG_HEIGHT, SPRIG_SRC, SPRIG_WIDTH } from '../src/lib/botanicalSprig';

// Contrato do ramo do perfil. Sem decodificador de imagem no Node, este teste garante o que da para
// garantir sem ele: WebP integro, COM canal alfa declarado, dimensoes iguais as constantes, tamanho
// dentro do limite e bytes identicos aos que o gerador validou pixel a pixel (hash). Para trocar a
// imagem, rode o gerador de novo: ele reescreve o WebP, as constantes e o .sha256 juntos.
const MAX_BYTES = 100 * 1024;
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)));
const buf = read(`../public${SPRIG_SRC}`);

assert.equal(buf.toString('ascii', 0, 4), 'RIFF', 'nao e RIFF');
assert.equal(buf.toString('ascii', 8, 12), 'WEBP', 'nao e WebP');
assert.equal(buf.readUInt32LE(4) + 8, buf.length, 'tamanho RIFF diverge do arquivo (truncado?)');

const kind = buf.toString('ascii', 12, 16);
let width: number;
let height: number;
let hasAlpha: boolean;
if (kind === 'VP8X') {
  hasAlpha = (buf[20] & 0x10) !== 0;
  width = 1 + buf.readUIntLE(24, 3);
  height = 1 + buf.readUIntLE(27, 3);
} else if (kind === 'VP8L') {
  assert.equal(buf[20], 0x2f, 'assinatura VP8L invalida');
  const bits = buf.readUInt32LE(21);
  width = (bits & 0x3fff) + 1;
  height = ((bits >>> 14) & 0x3fff) + 1;
  hasAlpha = ((bits >>> 28) & 1) === 1;
} else {
  throw new Error(`WebP deve ser VP8L (lossless) ou VP8X com alfa; veio "${kind.trim()}"`);
}

assert.ok(hasAlpha, 'o WebP nao declara canal alfa: a mascara viraria um retangulo');
assert.equal(width, SPRIG_WIDTH, 'largura diverge de SPRIG_WIDTH');
assert.equal(height, SPRIG_HEIGHT, 'altura diverge de SPRIG_HEIGHT');
assert.ok(buf.length <= MAX_BYTES, `ramo pesado demais: ${buf.length} bytes (limite ${MAX_BYTES})`);

const expected = read('./botanicalSprig.sha256').toString('utf8').trim();
const actual = createHash('sha256').update(buf).digest('hex');
assert.equal(actual, expected, 'o WebP mudou sem passar pelo gerador (hash diferente de botanicalSprig.sha256)');

console.log('botanicalSprig: ok');
