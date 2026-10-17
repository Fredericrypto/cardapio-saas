import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ctaBorderColors, safeHex, CTA_FALLBACK_PRIMARY } from '../src/lib/ctaBorder';
import { accentOnLight } from '../src/lib/accentColor';

// luminância relativa (WCAG) só para verificar o contraste nos testes
const lum = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
};
const contrastOnWhite = (hex: string): number => 1.05 / (lum(hex) + 0.05);

// ---- cores ------------------------------------------------------------------
assert.equal(safeHex('#1E90FF', '#000'), '#1E90FF');
assert.equal(safeHex('#abc', '#000'), '#abc');
assert.equal(safeHex('red', '#000000'), '#000000', 'nome de cor não é aceito');
assert.equal(safeHex('#12345', '#000000'), '#000000');
assert.equal(safeHex('', '#111111'), '#111111');
assert.equal(safeHex(null, '#111111'), '#111111');
assert.equal(safeHex('#fff; background:url(x)', '#111111'), '#111111', 'sem injeção em style');

// tema claro: cores com bom contraste passam intactas
assert.deepEqual(ctaBorderColors('#7C3AED', '#1D4ED8', false), { brand: '#7C3AED', a: '#7C3AED', b: '#1D4ED8' });
// tema claro: secundária clara demais (amarelo/âmbar/branco) é escurecida p/ aparecer no fundo branco
const lightAmber = ctaBorderColors('#7C3AED', '#F59E0B', false);
assert.equal(lightAmber.brand, '#7C3AED');
assert.equal(lightAmber.a, '#7C3AED', 'primária escura não muda');
assert.notEqual(lightAmber.b, '#F59E0B');
assert.ok(contrastOnWhite(lightAmber.b) >= 3, `contraste ${contrastOnWhite(lightAmber.b)}`);
for (const pale of ['#FFFF00', '#FFFFFF', '#FDE68A', '#F5F5DC']) {
  const c = ctaBorderColors('#111111', pale, false).b;
  assert.ok(contrastOnWhite(c) >= 3, `${pale} -> ${c}`);
}
// mantém o matiz: continua sendo "a mesma cor, mais escura" (ordem dos canais preservada)
{
  const n = parseInt(lightAmber.b.slice(1), 16);
  assert.ok(((n >> 16) & 255) >= ((n >> 8) & 255) && ((n >> 8) & 255) >= (n & 255), 'âmbar continua âmbar');
}
// só a borda muda: o preenchimento usa a cor crua
assert.equal(ctaBorderColors('#FDE68A', '#FDE68A', false).brand, '#FDE68A');
assert.equal(accentOnLight('#102030'), '#102030');
assert.equal(accentOnLight('não é cor'), 'não é cor');
assert.ok(contrastOnWhite(accentOnLight('#FFFFFF')) >= 3);
const darkBrand = ctaBorderColors('#1B1464', '#0B2447', true); // marinho escuro
assert.equal(darkBrand.brand, '#1B1464', 'preenchimento usa a cor crua');
assert.notEqual(darkBrand.a, '#1B1464', 'borda no escuro é clareada para ser visível');
assert.notEqual(darkBrand.b, '#0B2447');
assert.deepEqual(ctaBorderColors('#FFD60A', '#FFFFFF', true), { brand: '#FFD60A', a: '#FFD60A', b: '#FFFFFF' }, 'cores claras passam intactas');
assert.equal(ctaBorderColors(undefined, undefined, false).brand, CTA_FALLBACK_PRIMARY);
assert.equal(ctaBorderColors('#7C3AED', 'lixo', false).b, '#7C3AED', 'secundária inválida cai na primária');

// A marcação do componente (disabled, hover, span) depende de TenantContext -> api.ts
// (import.meta.env), que não roda sob tsx; fica fora deste teste.
// ---- CSS: regras que o requisito exige --------------------------------------
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const start = css.indexOf('AnimatedGradientButton (components/AnimatedGradientButton.tsx)');
assert.ok(start > 0, 'bloco do botão encontrado');
// O bloco do botão é SÓ o `@layer components` dele: fatia até a chave que o fecha (casando as chaves),
// e não até o fim do arquivo — CSS de outras telas depois do layer (glows, sombras) não é do botão.
const layerStart = css.indexOf('@layer components', start);
const masked = css.slice(layerStart).replace(/\/\*[^]*?\*\//g, (m) => ' '.repeat(m.length)); // comentários não contam chaves
let depth = 0;
let layerEnd = -1;
for (let i = masked.indexOf('{'); i >= 0 && i < masked.length; i++) {
  if (masked[i] === '{') depth++;
  else if (masked[i] === '}' && --depth === 0) { layerEnd = layerStart + i + 1; break; }
}
assert.ok(layerEnd > layerStart, 'fim do @layer components encontrado');
const block = css.slice(layerStart, layerEnd);
assert.ok(block.startsWith('@layer components'), 'bloco dentro de @layer components');

// Em Tailwind v4, CSS fora de layer vence as utilitárias (absolute, flex...) e quebrava o layout.
// Tudo do botão tem que estar dentro do layer: nenhuma regra .cta-border fora dele.
const before = css.slice(0, css.indexOf('@layer components', start));
assert.ok(!/\.cta-border/.test(before.replace(/\/\*[^]*?\*\//g, '')), 'nenhuma regra .cta-border fora do layer');

for (const needle of [
  '@keyframes cta-border-spin',
  'conic-gradient',
  'will-change: transform',
  '.cta-border--off .cta-border__ring',
  '.cta-border:disabled',
  '.cta-border:focus-visible',
]) assert.ok(block.includes(needle), needle);

// Só a borda: nada de sombra/brilho no bloco do botão.
assert.ok(!/box-shadow|drop-shadow|blur\(/.test(block.replace(/\/\*[^]*?\*\//g, '')), 'sem glow/sombra');

// Dois cometas: o gradiente usa as duas cores e tem partes transparentes.
const grad = /conic-gradient\([^;]*\);/.exec(block)?.[0] ?? '';
assert.ok(grad.includes('var(--cta-a)') && grad.includes('var(--cta-b)'), 'duas cores do restaurante');
assert.ok((grad.match(/transparent/g) ?? []).length >= 3, 'caudas/trechos transparentes');

assert.ok(/prefers-reduced-motion: reduce\) \{\s*\.cta-border__ring \{\s*animation: none;/.test(block), 'reduced-motion desliga o giro');

// só transform é animado no giro (nada de layout/pintura)
const kf = /@keyframes cta-border-spin \{[^]*?\n  \}/.exec(block)?.[0] ?? '';
assert.ok(kf.length > 0, 'keyframes encontrado');
assert.ok(kf.includes('transform') && !/(width|height|top|left|background|box-shadow)/.test(kf));

console.log('ctaBorder: ok');
