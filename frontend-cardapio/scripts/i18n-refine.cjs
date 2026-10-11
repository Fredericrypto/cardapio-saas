// Refinamento final do i18n do cardápio — EDITA NO LUGAR, ATÔMICO e IDEMPOTENTE:
//   1. "Promoções" em inglês vira "Deals" (e as frases com "promotions")
//   2. pronomes (EditProfilePage / CustomerProfilePage) via t()
//   3. datas com o locale ativo (pt-BR / en-US / es-ES); moeda continua pt-BR
//   4. motivos de recusa da verificação -> verification.reasons.<chave>
//   5. nomes/descrições de pratos e promoções passam por localizedText()
//   node scripts/i18n-refine.cjs          -> relatório (não grava)
//   node scripts/i18n-refine.cjs --write  -> grava; se faltar âncora, NÃO grava nada
const fs = require('fs');
const path = require('path');
const ts = require(process.env.TS_PATH || require.resolve('typescript', { paths: [process.cwd(), __dirname, path.resolve(__dirname, '../../frontend-admin')] }));

const ROOT = path.resolve(__dirname, '../src');
const WRITE = process.argv.includes('--write');
const TR = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'i18n-translations.json'), 'utf8'));
const OUT = new Map();
const problems = [];
const notes = [];
const read = (rel) => { const f = path.join(ROOT, rel); return OUT.has(f) ? OUT.get(f) : fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null; };
const put = (rel, content) => OUT.set(path.join(ROOT, rel), content);
const esc = (v) => v.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const relImport = (fileRel, target) => {
  const depth = fileRel.split('/').length - 1;
  return (depth === 0 ? './' : '../'.repeat(depth)) + target;
};
function addImport(content, line, marker) {
  if (content.includes(marker)) return content;
  const m = content.match(/^import /m);
  return m ? content.slice(0, m.index) + line + '\n' + content.slice(m.index) : line + '\n' + content;
}

// ---------- 1 + 2 + 4: dicionários ----------
const LANGS = [['pt-BR', 'pt'], ['en', 'en'], ['es', 'es']];
for (const [lang, col] of LANGS) {
  const rel = `i18n/dictionaries/${lang}.ts`;
  let d = read(rel);
  if (d == null) { problems.push(`dicionário ausente: ${rel}`); continue; }
  const marker = lang === 'pt-BR' ? '  // Erros genéricos\n' : "  'error.generic'";
  if (!d.includes(marker)) { problems.push(`âncora não encontrada em ${rel}`); continue; }
  let block = '';
  const add = (key, value) => { if (!d.includes(`'${key}'`)) block += `  '${key}': '${esc(value)}',\n`; };
  for (const [tok, v] of Object.entries(TR.pronouns)) add(`pronoun.${tok}`, v[col]);
  for (const [ptLabel, g] of Object.entries(TR.pronounGroups)) add(`pronoun.${g.key}`, col === 'pt' ? ptLabel : g[col]);
  for (const [k, v] of Object.entries(TR.verificationReasons)) add(`verification.reasons.${k}`, v[col]);
  for (const [k, v] of Object.entries(TR.cashback)) add(`cashback.${k}`, v[col]);
  if (block) d = d.replace(marker, () => block + '\n' + marker);
  if (lang === 'en') {
    const before = d;
    d = d
      .replace(/: 'Promotions',/g, ": 'Deals',")
      .replace(/: 'Hide promotions',/g, ": 'Hide deals',")
      .replace(/: 'Show promotions',/g, ": 'Show deals',")
      .replace(/: 'No promotions right now',/g, ": 'No deals right now',");
    if (d !== before) notes.push('en.ts: "Promotions" -> "Deals"');
  }
  put(rel, d);
}

// ---------- helpers gerados (arquivos nossos; sobrescrever é seguro) ----------
const ptMap = JSON.stringify(Object.fromEntries(Object.entries(TR.verificationReasons).map(([k, v]) => [v.pt, k])), null, 2);
put('i18n/verificationReason.ts', `import type { TranslationKey } from './dictionaries/pt-BR';
import { getDictionary } from './translate';
import { DEFAULT_LANGUAGE } from './languages';

// O backend grava o motivo de recusa em português (lista fechada). Aqui o texto
// volta à chave e sai no idioma do app; motivo desconhecido aparece como veio.
type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

const REASON_KEY_BY_TEXT: Record<string, string> = ${ptMap};

export function verificationReasonLabel(reason: string, t: Translate): string {
  const id = REASON_KEY_BY_TEXT[reason.trim()];
  if (!id) return reason;
  const key = \`verification.reasons.\${id}\` as TranslationKey;
  return key in getDictionary(DEFAULT_LANGUAGE) ? t(key) : reason;
}
`);
put('i18n/pronouns.ts', `import type { TranslationKey } from './dictionaries/pt-BR';
import { getDictionary } from './translate';
import { DEFAULT_LANGUAGE } from './languages';

// O backend guarda os pronomes como lista fechada em português ("ela/dela").
// A exibição segue o idioma do app (pt: ela/dela - en: she/her - es: ella/de ella).
type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

const GROUP_KEY_BY_LABEL: Record<string, string> = {
  'Tradicionais Femininos': 'groupFeminine',
  'Tradicionais Masculinos': 'groupMasculine',
};

function has(key: string): key is TranslationKey {
  return key in getDictionary(DEFAULT_LANGUAGE);
}

export function pronounLabel(token: string, t: Translate): string {
  const key = \`pronoun.\${token}\`;
  return has(key) ? t(key) : token;
}

export function pronounGroupLabel(label: string, t: Translate): string {
  const id = GROUP_KEY_BY_LABEL[label];
  const key = \`pronoun.\${id ?? ''}\`;
  return id && has(key) ? t(key) : label;
}

export function formatPronouns(value: string, t: Translate): string {
  return value
    .split('/')
    .map((token) => pronounLabel(token.trim(), t))
    .join('/');
}
`);
put('i18n/categoryLabel.ts', `import type { TranslationKey } from './dictionaries/pt-BR';
import { getDictionary } from './translate';
import { DEFAULT_LANGUAGE, readStoredLanguage } from './languages';

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

// Nome da categoria no idioma do app. Categorias do CATÁLOGO (têm \`key\`) vêm
// do dicionário (\`category.<key>\`); categorias personalizadas do restaurante
// (sem key) e qualquer chave sem tradução mostram o nome cadastrado, intacto.
export function categoryLabel(category: { key: string | null; name: string }, t: Translate): string {
  if (!category.key) return category.name;
  const key = \`category.\${category.key}\` as TranslationKey;
  return key in getDictionary(DEFAULT_LANGUAGE) ? t(key) : category.name;
}

// Nome/descrição de prato, promoção etc. com fallback transparente:
// idioma ativo -> pt-BR -> pt -> qualquer valor. Hoje o banco guarda texto
// simples (devolvido como está); quando houver traduções por idioma
// ({ 'pt-BR': '...', en: '...' }) o helper já as usa, sem mexer nas telas.
export type LocalizedValue = string | Partial<Record<string, string>> | null | undefined;

export function localizedText(value: LocalizedValue, language: string = readStoredLanguage()): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return value[language] ?? value['pt-BR'] ?? value.pt ?? Object.values(value).find(Boolean) ?? '';
}
`);

// ---------- languages.ts: locale ativo para datas ----------
{
  const rel = 'i18n/languages.ts';
  let c = read(rel);
  if (c == null) problems.push('i18n/languages.ts ausente');
  else if (!c.includes('activeDateLocale')) {
    c = c.trimEnd() + `

// Locale das DATAS no idioma ativo (lido do armazenamento a cada chamada, então
// funciona também em funções fora de componentes). Moeda NUNCA usa isto: R$ fica pt-BR.
export function activeDateLocale(): string {
  return LANGUAGE_OPTIONS.find((o) => o.code === readStoredLanguage())?.dateLocale ?? 'pt-BR';
}
`;
    put(rel, c);
  }
}

// ---------- 2 + 4 + 5: trocas pontuais (âncoras) ----------
function swap(rel, pairs, imports = []) {
  let c = read(rel);
  if (c == null) { problems.push(`arquivo ausente: ${rel}`); return; }
  let changed = false;
  for (const [from, to, required = true] of pairs) {
    if (c.includes(to) && !c.includes(from)) continue; // já aplicado
    if (!c.includes(from)) { if (required) problems.push(`âncora não encontrada em ${rel}: ${from}`); continue; }
    c = c.split(from).join(to);
    changed = true;
  }
  for (const [line, marker] of imports) c = addImport(c, line.replace('@', relImport(rel, 'i18n')), marker);
  if (changed) put(rel, c);
}
const imp = (names, file) => [`import { ${names} } from '@/${file}';`, file];
swap('pages/EditProfilePage.tsx', [
  ['{group.label}</p>', '{pronounGroupLabel(group.label, t)}</p>'],
  ['{option}\n                        </button>', '{pronounLabel(option, t)}\n                        </button>'],
  ['{customer.pronouns}</p>', '{formatPronouns(customer.pronouns, t)}</p>'],
], [[`import { formatPronouns, pronounGroupLabel, pronounLabel } from '@/pronouns';`, 'i18n/pronouns']]);
swap('pages/CustomerProfilePage.tsx', [
  ['{customer.pronouns}</span>', '{formatPronouns(customer.pronouns, t)}</span>'],
  ['{customer.verificationRejectionReason}</p>', '{verificationReasonLabel(customer.verificationRejectionReason, t)}</p>'],
], [
  [`import { formatPronouns } from '@/pronouns';`, 'i18n/pronouns'],
  [`import { verificationReasonLabel } from '@/verificationReason';`, 'i18n/verificationReason'],
]);
// '@/x' -> caminho relativo correto
for (const f of [...OUT.keys()]) {
  const rel = path.relative(ROOT, f);
  if (!/\.tsx?$/.test(rel)) continue;
  OUT.set(f, OUT.get(f).replace(/from '@\/([\w/]+)'/g, (m, t) => `from '${relImport(rel, 'i18n/' + t.replace(/^i18n\//, ''))}'`));
}

// pratos e promoções: nome/descrição passam por localizedText()
const dish = (obj) => [
  [`{${obj}.name}`, `{localizedText(${obj}.name)}`, false],
  [`alt={${obj}.name}`, `alt={localizedText(${obj}.name)}`, false],
  [`title={${obj}.name}`, `title={localizedText(${obj}.name)}`, false],
  [`{${obj}.description}`, `{localizedText(${obj}.description)}`, false],
];
const promo = (obj) => [
  [`{${obj}.title}`, `{localizedText(${obj}.title)}`, false],
  [`alt={${obj}.title}`, `alt={localizedText(${obj}.title)}`, false],
  [`title={${obj}.title}`, `title={localizedText(${obj}.title)}`, false],
  [`{${obj}.description}`, `{localizedText(${obj}.description)}`, false],
];
for (const [rel, pairs] of [
  ['components/ProductCard.tsx', dish('product')],
  ['pages/ProductDetailPage.tsx', dish('product')],
  ['components/PromoCards.tsx', promo('promo')],
]) {
  const before = read(rel);
  swap(rel, pairs);
  let c = read(rel);
  if (c && c !== before) {
    c = addImport(c, `import { localizedText } from '${relImport(rel, 'i18n/categoryLabel')}';`, 'i18n/categoryLabel');
    put(rel, c);
  } else if (c && !c.includes('localizedText(')) problems.push(`nenhum ponto de nome/descrição encontrado em ${rel}`);
}


// ---------- cashback: abas, descrições vindas do backend, validade e datas ----------
const cashDesc = JSON.stringify({
  'Cashback do pedido': 'desc.order', 'Prêmio de fidelidade': 'desc.loyalty',
  'Ajuste do restaurante': 'desc.adjustment', 'Usado em um pedido': 'desc.usedInOrder',
}, null, 2);
put('i18n/cashbackDescription.ts', `import type { TranslationKey } from './dictionaries/pt-BR';
import { getDictionary } from './translate';
import { DEFAULT_LANGUAGE } from './languages';

// O backend devolve a origem do cashback em português ("Cashback do pedido").
// Aqui o texto vira chave e sai no idioma do app; texto desconhecido fica como veio.
type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

const KEY_BY_TEXT: Record<string, string> = ${cashDesc};

export function cashbackDescriptionLabel(text: string, t: Translate): string {
  const id = KEY_BY_TEXT[text.trim()];
  const key = \`cashback.\${id ?? ''}\`;
  return id && key in getDictionary(DEFAULT_LANGUAGE) ? t(key as TranslationKey) : text;
}
`);

swap('pages/CustomerCashbackPage.tsx', [
  ["{ key: 'disponiveis', label: 'Disponíveis' }", "{ key: 'disponiveis', labelKey: 'cashback.tab.available' }"],
  ["{ key: 'expirados', label: 'Expirados' }", "{ key: 'expirados', labelKey: 'cashback.tab.expired' }"],
  ["{ key: 'utilizados', label: 'Utilizados' }", "{ key: 'utilizados', labelKey: 'cashback.tab.used' }"],
  ['{ key: CashbackTab; label: string }[]', '{ key: CashbackTab; labelKey: TranslationKey }[]'],
  ['{TABS.map((t) => {', '{TABS.map((tabItem) => {'],
  ['categorized[t.key].length', 'categorized[tabItem.key].length'],
  ['tab === t.key;', 'tab === tabItem.key;'],
  ['key={t.key}', 'key={tabItem.key}'],
  ['setTab(t.key)', 'setTab(tabItem.key)'],
  ['{t.label}', '{t(tabItem.labelKey)}'],
  ['{entry.description} · ganho em {formatDateBR(entry.createdAt)}', "{cashbackDescriptionLabel(entry.description, t)} · {t('cashback.earnedOn')} {formatDateBR(entry.createdAt)}"],
  ['<p className="text-xs text-gray-400 truncate">{entry.description}</p>', '<p className="text-xs text-gray-400 truncate">{cashbackDescriptionLabel(entry.description, t)}</p>'],
  ['formatCashbackExpiry(entry.expiresAt, now)', 'formatCashbackExpiry(entry.expiresAt, now, undefined, t)'],
  ['formatDateTimeBR(entry.createdAt)', 'formatDateTimeBR(entry.createdAt, undefined, t)'],
  ['formatDateTimeBR(entry.expiresAt)', 'formatDateTimeBR(entry.expiresAt, undefined, t)'],
]);
{
  const rel = 'pages/CustomerCashbackPage.tsx';
  let c = read(rel);
  if (c) {
    c = addImport(c, `import { cashbackDescriptionLabel } from '${relImport(rel, 'i18n/cashbackDescription')}';`, 'i18n/cashbackDescription');
    c = addImport(c, `import type { TranslationKey } from '${relImport(rel, 'i18n/dictionaries/pt-BR')}';`, "i18n/dictionaries/pt-BR'");
    put(rel, c);
  }
}
swap('lib/cashbackFormat.ts', [
  ["export function formatDateBR(iso: string, timeZone: string = STORE_TIME_ZONE): string {\n  const p = parts(new Date(iso), timeZone);\n  return `${p.day}/${p.month}/${p.year}`;\n}",
   "export function formatDateBR(iso: string, timeZone: string = STORE_TIME_ZONE): string {\n  const p = parts(new Date(iso), timeZone);\n  // Ordem da data pelo idioma ativo (en: MM/DD/YYYY). O fuso continua o da loja.\n  return activeDateLocale().startsWith('en') ? `${p.month}/${p.day}/${p.year}` : `${p.day}/${p.month}/${p.year}`;\n}"],
  ["export function formatDateTimeBR(iso: string, timeZone: string = STORE_TIME_ZONE): string {\n  return `${formatDateBR(iso, timeZone)} às ${formatTimeBR(iso, timeZone)}`;\n}",
   "export function formatDateTimeBR(iso: string, timeZone: string = STORE_TIME_ZONE, t?: Translate): string {\n  const at = t ? t('cashback.at') : 'às';\n  return `${formatDateBR(iso, timeZone)} ${at} ${formatTimeBR(iso, timeZone)}`;\n}"],
  ["  now: number = Date.now(),\n  timeZone: string = STORE_TIME_ZONE,\n): string {\n  const ms = new Date(expiresAtIso).getTime() - now;\n  if (ms <= 0) return `Venceu dia ${formatDateTimeBR(expiresAtIso, timeZone)}`;",
   "  now: number = Date.now(),\n  timeZone: string = STORE_TIME_ZONE,\n  t?: Translate,\n): string {\n  const ms = new Date(expiresAtIso).getTime() - now;\n  if (ms <= 0) {\n    const date = formatDateTimeBR(expiresAtIso, timeZone, t);\n    return t ? t('cashback.expiredOn', { date }) : `Venceu dia ${date}`;\n  }"],
  ["    return h > 0 ? `Vence em ${h}h ${m}min` : `Vence em ${m} min`;\n  }\n  return `Vence dia ${formatDateTimeBR(expiresAtIso, timeZone)}`;",
   "    if (t) return h > 0 ? t('cashback.expiresInHm', { h, m }) : t('cashback.expiresInM', { m });\n    return h > 0 ? `Vence em ${h}h ${m}min` : `Vence em ${m} min`;\n  }\n  const date = formatDateTimeBR(expiresAtIso, timeZone, t);\n  return t ? t('cashback.expiresOn', { date }) : `Vence dia ${date}`;"],
]);
{
  const rel = 'lib/cashbackFormat.ts';
  let c = read(rel);
  if (c) {
    c = addImport(c, `import { activeDateLocale } from '${relImport(rel, 'i18n/languages')}';`, 'activeDateLocale }');
    c = addImport(c, `import type { TranslationKey } from '${relImport(rel, 'i18n/dictionaries/pt-BR')}';`, "i18n/dictionaries/pt-BR'");
    if (!c.includes('type Translate =')) {
      c = c.replace(/\n(export const STORE_TIME_ZONE)/, () => `\ntype Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;\n\n$1`.replace('$1', 'export const STORE_TIME_ZONE'));
    }
    put(rel, c);
  }
}

// ---------- 3: datas no locale ativo (AST) ----------
const SKIP = new Set(['lib/cashbackFormat.ts', 'lib/schedule.ts', 'lib/openingHours.ts']);
const DATE_KEYS = /\b(day|month|year|hour|minute|weekday|dateStyle|timeStyle)\b/;
const NOT_DATE = /\b(currency|percent|unit|Fraction)/;
function walk(dir, acc = []) {
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    if (fs.statSync(p).isDirectory()) { if (n !== 'i18n') walk(p, acc); }
    else if (/\.tsx?$/.test(p) && !/\.test\./.test(p)) acc.push(p);
  }
  return acc;
}
let dateEdits = 0;
for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file);
  if (SKIP.has(rel)) continue;
  const text = read(rel);
  if (!text.includes("'pt-BR'")) continue;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, rel.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edits = [];
  (function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const name = node.expression.name.text;
      const [a0, a1] = node.arguments;
      if (a0 && ts.isStringLiteral(a0) && a0.text === 'pt-BR') {
        const opts = a1 ? a1.getText() : '';
        if (name === 'toLocaleDateString' || name === 'toLocaleTimeString' || (name === 'toLocaleString' && DATE_KEYS.test(opts) && !NOT_DATE.test(opts))) {
          edits.push([a0.getStart(), a0.getEnd()]);
        }
      }
    }
    if (ts.isNewExpression(node) && node.expression.getText() === 'Intl.DateTimeFormat') {
      const a0 = node.arguments && node.arguments[0];
      if (a0 && ts.isStringLiteral(a0) && a0.text === 'pt-BR') edits.push([a0.getStart(), a0.getEnd()]);
    }
    ts.forEachChild(node, visit);
  })(sf);
  if (!edits.length) continue;
  let out = text;
  for (const [s, e] of edits.sort((a, b) => b[0] - a[0])) out = out.slice(0, s) + 'activeDateLocale()' + out.slice(e);
  out = addImport(out, `import { activeDateLocale } from '${relImport(rel, 'i18n/languages')}';`, 'activeDateLocale }');
  put(rel, out);
  dateEdits += edits.length;
}
notes.push(`datas: ${dateEdits} chamadas agora usam o locale ativo`);

// ---------- package.json: inclui o teste novo em test:logic ----------
{
  const pj = path.resolve(ROOT, '../package.json');
  const raw = fs.readFileSync(pj, 'utf8');
  const add = 'npx --yes tsx test/cashbackI18n.test.ts';
  if (!raw.includes(add)) {
    const re = /("test:logic":\s*"[^"]*?)"/;
    if (re.test(raw)) OUT.set(pj, raw.replace(re, (m, a) => `${a} && ${add}"`));
    else problems.push('package.json: script test:logic não encontrado');
  }
}

console.log(`${WRITE ? 'GRAVANDO' : 'RELATÓRIO'}: ${OUT.size} arquivos afetados`);
notes.forEach((n) => console.log(' -', n));
if (problems.length) {
  console.error('\nABORTADO (nada foi gravado):\n- ' + problems.join('\n- '));
  process.exit(1);
}
if (WRITE) {
  for (const [f, c] of OUT) fs.writeFileSync(f, c);
  console.log('OK: gravado. Rode: npm run build');
} else console.log('Nada gravado (use --write).');
