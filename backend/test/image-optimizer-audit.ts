// Verificação do otimizador de imagens (precisa do pacote `sharp` instalado).
// Rodar: cd backend && npx ts-node test/image-optimizer-audit.ts
import assert from 'node:assert/strict';
import sharp = require('sharp');
import { optimizeImage, prepareImageUpload, imageTelemetry } from '../src/common/utils/image-optimizer';

let passed = 0;
async function check(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (err) {
    console.error(`  FALHOU ${name}\n${err instanceof Error ? err.stack : err}`);
    process.exitCode = 1;
  }
}

// "Foto" sintética: gradiente + ruído leve (comprime como foto, não como cor chapada).
async function photo(width: number, height: number, format: 'jpeg' | 'png', orientation?: number): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      const noise = (x * 7 + y * 13) % 17;
      raw[i] = (x * 255) / width + noise;
      raw[i + 1] = (y * 255) / height + noise;
      raw[i + 2] = ((x + y) * 255) / (width + height) + noise;
    }
  }
  let img = sharp(raw, { raw: { width, height, channels: 3 } });
  if (orientation) img = img.withMetadata({ orientation });
  return format === 'jpeg' ? img.jpeg({ quality: 95 }).toBuffer() : img.png().toBuffer();
}

async function main() {
  console.log('image-optimizer');

  await check('foto grande vira WebP bem menor e cabe no preset', async () => {
    const original = await photo(3200, 2400, 'jpeg');
    const r = await optimizeImage(original, 'image/jpeg', 'product');
    assert.equal(r.optimized, true);
    assert.equal(r.mimetype, 'image/webp');
    assert.equal(r.extension, 'webp');
    const meta = await sharp(r.buffer).metadata();
    assert.equal(meta.format, 'webp');
    assert.ok((meta.width ?? 0) <= 1280 && (meta.height ?? 0) <= 1280);
    assert.equal(Math.round(((meta.width ?? 0) / (meta.height ?? 1)) * 100), Math.round((3200 / 2400) * 100)); // proporção
    assert.ok(r.buffer.length < original.length * 0.3, `esperava <30% do original: ${r.buffer.length}/${original.length}`);
    console.log(`       ${(original.length / 1024).toFixed(0)} KB -> ${(r.buffer.length / 1024).toFixed(0)} KB`);
  });

  await check('nunca amplia imagem pequena', async () => {
    const original = await photo(300, 200, 'png');
    const r = await optimizeImage(original, 'image/png', 'banner');
    const meta = await sharp(r.buffer).metadata();
    assert.ok((meta.width ?? 0) <= 300);
  });

  await check('preserva transparência (PNG com alpha)', async () => {
    const original = await sharp({
      create: { width: 600, height: 600, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 0.4 } },
    }).png().toBuffer();
    const r = await optimizeImage(original, 'image/png', 'logo');
    const meta = await sharp(r.buffer).metadata();
    assert.equal(meta.hasAlpha, true);
    const { channels } = await sharp(r.buffer).stats();
    assert.equal(channels.length, 4);
  });

  await check('respeita orientação EXIF (gira os pixels)', async () => {
    const original = await photo(1600, 800, 'jpeg', 6); // 6 = girar 90° horário -> fica em pé
    const r = await optimizeImage(original, 'image/jpeg', { maxWidth: 4000, maxHeight: 4000, quality: 82 });
    const meta = await sharp(r.buffer).metadata();
    assert.ok((meta.height ?? 0) > (meta.width ?? 0), `esperava retrato, veio ${meta.width}x${meta.height}`);
  });

  await check('SVG passa intacto', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
    const r = await optimizeImage(svg, 'image/svg+xml', 'logo');
    assert.equal(r.optimized, false);
    assert.equal(r.buffer, svg);
    assert.equal(r.extension, 'svg');
  });

  await check('GIF animado passa intacto', async () => {
    const w = 64;
    const h = 64;
    const frames = Buffer.concat([0, 1, 2].map((f) => Buffer.alloc(w * h * 3, f * 100)));
    const gif = await sharp(frames, { raw: { width: w, height: h * 3, channels: 3, pageHeight: h } })
      .gif({ loop: 0, delay: [100, 100, 100] })
      .toBuffer();
    assert.ok(((await sharp(gif, { animated: true }).metadata()).pages ?? 1) > 1, 'GIF de teste deveria ser animado');
    const r = await optimizeImage(gif, 'image/gif', 'product');
    assert.equal(r.optimized, false);
    assert.equal(r.buffer, gif);
  });

  await check('mantém o original quando o WebP ficaria maior', async () => {
    // WebP já muito comprimido (q=20): reencodar a q=82 só engordaria o arquivo.
    const raw = await photo(400, 300, 'png');
    const heavy = await sharp(raw).webp({ quality: 20 }).toBuffer();
    const r = await optimizeImage(heavy, 'image/webp', 'product');
    assert.equal(r.optimized, false);
    assert.equal(r.buffer, heavy);
    assert.equal(r.extension, 'webp');
  });

  await check('arquivo corrompido ou não-imagem não derruba o upload', async () => {
    const junk = Buffer.from('isto nao e uma imagem');
    const a = await optimizeImage(junk, 'image/jpeg', 'product');
    assert.equal(a.optimized, false);
    assert.equal(a.buffer, junk);
    const b = await optimizeImage(junk, 'application/pdf', 'product');
    assert.equal(b.optimized, false);
  });

  console.log('telemetria e preparo de upload');

  await check('prepareImageUpload: troca extensão para .webp, registra antes/depois e loga', async () => {
    imageTelemetry.reset();
    const lines: string[] = [];
    imageTelemetry.setSink((l) => lines.push(l));
    const original = await photo(2400, 1800, 'jpeg');
    const out = await prepareImageUpload({ buffer: original, mimetype: 'image/jpeg', originalname: 'Foto Prato.final.JPG' }, 'product');
    assert.equal(out.optimized, true);
    assert.equal(out.mimetype, 'image/webp');
    assert.equal(out.originalname, 'Foto Prato.final.webp');
    assert.equal(out.size, out.buffer.length);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^Upload Produto: original .* -> final .* \(economia \d+\.\d%\)$/);
    const snap = imageTelemetry.snapshot();
    assert.equal(snap.byLabel['Produto'].uploads, 1);
    assert.equal(snap.byLabel['Produto'].originalBytes, original.length);
    assert.equal(snap.byLabel['Produto'].finalBytes, out.buffer.length);
    assert.ok((snap.total.savedPercent ?? 0) > 50);
    imageTelemetry.setSink(null);
  });

  await check('prepareImageUpload: original mantido não muda o nome e conta como "mantido"', async () => {
    imageTelemetry.reset();
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>');
    const out = await prepareImageUpload({ buffer: svg, mimetype: 'image/svg+xml', originalname: 'logo.svg' }, 'logo');
    assert.equal(out.optimized, false);
    assert.equal(out.originalname, 'logo.svg');
    const t = imageTelemetry.snapshot().byLabel['Logo'];
    assert.equal(t.keptOriginal, 1);
    assert.equal(t.optimized, 0);
    assert.equal(t.savedBytes, 0);
  });

  console.log(`\n${passed} verificações passaram${process.exitCode ? ' (COM FALHAS)' : ''}.`);
}

main();
