// Auditoria da galeria de fotos do item — regras PURAS (sem banco).
// Uso:  npm run test:product-images-pure
import {
  MAX_PRODUCT_IMAGES,
  remainingSlots,
  replaceCover,
  resolveProductImages,
  sanitizeImageList,
} from '../src/modules/products/product-images';
import { createChecker } from './helpers';

const { ok, finish } = createChecker();
const eq = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

console.log('1) Limite');
ok(MAX_PRODUCT_IMAGES === 5, 'o máximo é 5 fotos por item');
ok(remainingSlots(0) === 5 && remainingSlots(3) === 2 && remainingSlots(5) === 0, 'vagas restantes: 0→5, 3→2, 5→0');
ok(remainingSlots(9) === 0, 'vagas nunca ficam negativas');

console.log('2) sanitizeImageList');
ok(eq(sanitizeImageList([]), []), 'lista vazia continua vazia');
ok(eq(sanitizeImageList(['  https://a/1.jpg  ', 'https://a/2.jpg']), ['https://a/1.jpg', 'https://a/2.jpg']), 'tira espaços das pontas');
ok(eq(sanitizeImageList(['', '   ', 'https://a/1.jpg']), ['https://a/1.jpg']), 'descarta vazios e só espaços');
ok(eq(sanitizeImageList(['https://a/1.jpg', 'https://a/2.jpg', 'https://a/1.jpg']), ['https://a/1.jpg', 'https://a/2.jpg']), 'remove repetida mantendo a PRIMEIRA ocorrência');
ok(eq(sanitizeImageList(['https://a/2.jpg', 'https://a/1.jpg']), ['https://a/2.jpg', 'https://a/1.jpg']), 'não reordena (a ordem é do dono)');
ok(eq(sanitizeImageList(['https://a/1.jpg', ' https://a/1.jpg ']), ['https://a/1.jpg']), 'repetida só difere por espaço: conta como a mesma');

console.log('3) resolveProductImages (dado antigo e backup restaurado)');
ok(eq(resolveProductImages(['https://a/1.jpg', 'https://a/2.jpg'], 'https://a/1.jpg'), ['https://a/1.jpg', 'https://a/2.jpg']), 'images preenchida vence');
ok(eq(resolveProductImages([], 'https://a/capa.jpg'), ['https://a/capa.jpg']), 'images vazia + capa antiga = galeria de 1 foto');
ok(eq(resolveProductImages(null, 'https://a/capa.jpg'), ['https://a/capa.jpg']), 'images nula + capa antiga = galeria de 1 foto');
ok(eq(resolveProductImages(undefined, null), []), 'sem nada = sem foto');
ok(eq(resolveProductImages([], '   '), []), 'capa só com espaços não conta como foto');
ok(eq(resolveProductImages([], null), []), 'sem foto nenhuma');
const seven = ['1', '2', '3', '4', '5', '6', '7'].map((n) => `https://a/${n}.jpg`);
ok(resolveProductImages(seven, null).length === 5, 'nunca devolve mais que 5 (defesa)');
ok(eq(resolveProductImages(seven, null), seven.slice(0, 5)), 'ao cortar, mantém as 5 primeiras (a capa nunca sai)');
ok(eq(resolveProductImages(['https://a/novo.jpg'], 'https://a/velha.jpg'), ['https://a/novo.jpg']), 'se images existe, a capa antiga não é misturada');

console.log('4) replaceCover (escrita no formato antigo imageUrl)');
ok(eq(replaceCover([], 'https://a/1.jpg'), ['https://a/1.jpg']), 'sem fotos: vira a única');
ok(eq(replaceCover(['https://a/1.jpg', 'https://a/2.jpg', 'https://a/3.jpg'], 'https://a/nova.jpg'), ['https://a/nova.jpg', 'https://a/2.jpg', 'https://a/3.jpg']), 'troca só a capa e preserva o resto na ordem');
ok(eq(replaceCover(['https://a/1.jpg', 'https://a/2.jpg'], 'https://a/2.jpg'), ['https://a/2.jpg']), 'nova capa igual a uma existente não duplica');
ok(eq(replaceCover(['https://a/1.jpg', 'https://a/2.jpg'], ''), ['https://a/2.jpg']), 'capa vazia remove a capa e a próxima assume');
ok(eq(replaceCover(['https://a/1.jpg'], null), []), 'capa nula remove a única foto');
ok(eq(replaceCover(['https://a/1.jpg', 'https://a/2.jpg'], '  https://a/3.jpg '), ['https://a/3.jpg', 'https://a/2.jpg']), 'espaços da nova capa são ignorados');

console.log('5) Propriedade: sanitize bate com uma implementação independente (2000 listas aleatórias)');
let seed = 12345;
const rnd = (n: number): number => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed % n;
};
const pool = ['', ' ', 'u1', ' u1', 'u2', 'u3 ', 'u4', 'u5', 'u6', 'u1 '];
let mismatches = 0;
let invariantBreaks = 0;
for (let i = 0; i < 2000; i++) {
  const len = rnd(9);
  const raw: string[] = [];
  for (let j = 0; j < len; j++) raw.push(pool[rnd(pool.length)]);
  const got = sanitizeImageList(raw);
  // independente: trim -> filtra vazios -> mantém a primeira ocorrência por indexOf
  const trimmed = raw.map((x) => x.trim()).filter((x) => x.length > 0);
  const expected = trimmed.filter((x, idx) => trimmed.indexOf(x) === idx);
  if (!eq(got, expected)) mismatches++;
  if (new Set(got).size !== got.length || got.some((x) => x !== x.trim() || x === '')) invariantBreaks++;
  // replaceCover nunca duplica nem passa de (resto + 1)
  const cover = pool[rnd(pool.length)];
  const replaced = replaceCover(got, cover);
  if (new Set(replaced).size !== replaced.length || replaced.length > got.length + 1) invariantBreaks++;
  if (cover.trim() !== '' && replaced[0] !== cover.trim()) invariantBreaks++;
}
ok(mismatches === 0, 'sanitizeImageList = implementação independente em 2000 casos');
ok(invariantBreaks === 0, 'invariantes (sem repetidas/vazios; capa nova sempre na frente) em 2000 casos');

process.exit(finish());
