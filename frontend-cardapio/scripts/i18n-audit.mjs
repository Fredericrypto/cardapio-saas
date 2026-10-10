// Lista, por arquivo, os textos em português que ainda estão FIXOS no JSX do
// app do cliente (sem passar por t()). Heurística: texto de JSX com letra
// acentuada/palavra comum entre > e <, e atributos de texto (placeholder,
// aria-label, title, label, message...). Uso: node scripts/i18n-audit.mjs [--files]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../src/', import.meta.url).pathname;
const SKIP = [/\/i18n\//, /\.test\./, /\/types\//];
const ATTR = /\b(placeholder|aria-label|title|label|message|confirmLabel|cancelLabel|alt)=["']([^"'{}]*[A-Za-zÀ-ú]{3,}[^"'{}]*)["']/g;
const TEXT = />\s*([^<>{}\n][^<>{}]*[A-Za-zÀ-ú]{3,}[^<>{}]*)\s*</g;
const NOISE = /^(\s*[A-Z0-9_./:-]+\s*|[\d\s.,%R$•·—–-]+)$/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(p) && !SKIP.some((r) => r.test(p))) out.push(p);
  }
  return out;
}

const rows = [];
for (const file of walk(ROOT)) {
  const src = readFileSync(file, 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  let count = 0;
  const samples = [];
  for (const re of [ATTR, TEXT]) {
    re.lastIndex = 0;
    for (const m of src.matchAll(re)) {
      const text = (m[2] ?? m[1]).trim();
      if (!text || NOISE.test(text) || /^[a-z]+[A-Z]/.test(text) || /=>|\bconst\b|\breturn\b/.test(text)) continue;
      count++;
      if (samples.length < 3) samples.push(text.slice(0, 60));
    }
  }
  if (count > 0) rows.push({ file: file.replace(ROOT, ''), count, samples });
}
rows.sort((a, b) => b.count - a.count);
const total = rows.reduce((s, r) => s + r.count, 0);
console.log(`Textos fixos restantes (estimativa): ${total} em ${rows.length} arquivos`);
for (const r of rows.slice(0, 40)) console.log(String(r.count).padStart(4), r.file, '|', r.samples.join(' | '));
