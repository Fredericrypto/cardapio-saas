// Aplica a cobertura i18n do cardápio EDITANDO OS ARQUIVOS NO LUGAR (nunca
// substitui arquivo inteiro): troca textos fixos em português por t('chave') via
// AST do TypeScript, insere `const { t } = useI18n()` nos componentes, grava as
// chaves nos 3 dicionários e traduz categorias do catálogo (`category.<key>`).
//   node scripts/i18n-apply.cjs          -> só relatório (não grava nada)
//   node scripts/i18n-apply.cjs --write  -> grava, ATOMICAMENTE: se faltar
//                                           tradução ou âncora, não grava nada.
// Idempotente: rodar de novo não encontra mais nada para trocar.
// O que não dá para trocar com segurança (constantes de módulo etc.) vai para
// scripts/i18n-skipped.txt.
const fs = require('fs');
const path = require('path');
const ts = require(process.env.TS_PATH || require.resolve('typescript', { paths: [process.cwd(), __dirname, path.resolve(__dirname, '../../frontend-admin')] }));
const TR = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'i18n-translations.json'), 'utf8'));

const ROOT = path.resolve(__dirname, '../src');
const WRITE = process.argv.includes('--write');
const ATTRS = new Set(['placeholder', 'aria-label', 'title', 'label', 'message', 'confirmLabel', 'cancelLabel', 'alt', 'description', 'hint', 'subtitle', 'emptyText', 'loadingText']);
const SKIP_DIRS = ['i18n', 'types'];
const SKIP_FILES = new Set(['ErrorBoundary.tsx', 'BuildMark.tsx']);

// ---- dicionário existente (pt-BR) para reaproveitar chaves ----
const dictPath = path.join(ROOT, 'i18n/dictionaries/pt-BR.ts');
const dictSrc = fs.readFileSync(dictPath, 'utf8');
const textToKey = new Map();
const usedKeys = new Set();
for (const m of dictSrc.matchAll(/^\s*'([\w.]+)':\s*\n?\s*'((?:[^'\\]|\\.)*)',?$/gm)) {
  usedKeys.add(m[1]);
  const text = m[2].replace(/\\'/g, "'");
  if (!textToKey.has(text)) textToKey.set(text, m[1]);
}
const OUTPUTS = new Map(); // arquivo -> novo conteúdo (gravado só no fim)
const newEntries = new Map(); // key -> pt text
const skipped = [];
let replacedCount = 0;

const slug = (s) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\{(\w+)\}/g, ' $1 ').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').slice(0, 4).join('_') || 'text';
const camel = (s) => s.replace(/\.tsx?$/, '').replace(/^./, (c) => c.toLowerCase());

function keyFor(text, scope) {
  if (textToKey.has(text)) return textToKey.get(text);
  let base = `${scope}.${slug(text)}`;
  let key = base;
  let n = 2;
  while (usedKeys.has(key)) key = `${base}_${n++}`;
  usedKeys.add(key);
  textToKey.set(text, key);
  newEntries.set(key, text);
  return key;
}

const CSS_TOKEN = /^(?:[a-z0-9-]+:)*(?:-?[a-z]+(?:-[\w/.\[\]%#()+-]+)+|flex|grid|block|hidden|relative|absolute|fixed|sticky|inline|inline-flex|rounded|border|shadow|truncate|transition|underline|italic|uppercase|tabular-nums|shrink-0|solid|transparent|\d+(?:\.\d+)?(?:px|rem|em|%)|max\(.*|env\(.*|min\(.*)$/;
const isCssLike = (text) => {
  const toks = text.replace(/\{\w+\}/g, ' ').split(/\s+/).filter(Boolean);
  if (toks.length === 0) return true;
  const css = toks.filter((t) => CSS_TOKEN.test(t) || /^[A-Z_]{4,}$/.test(t)).length;
  return css / toks.length >= 0.5;
};
const NO_TRANSLATE = /^(Pix|WhatsApp|Telegram|Instagram|Facebook|YouTube|TikTok|Messenger|X \(Twitter\)|CPF|UF|CEP|OK|Ref:?)$/;
const hasLetters = (s) => /[A-Za-zÀ-ú]{2,}/.test(s);
const looksUi = (s) => {
  const t = s.trim();
  if (!hasLetters(t) || isCssLike(t) || NO_TRANSLATE.test(t)) return false;
  if (!/[A-Za-zÀ-ú]{2,}/.test(t.replace(/\{\w+\}/g, ''))) return false;
  if (/^[a-z][\w-]*$/.test(t)) return false; // identificadores/classes
  if (/^(https?:|\/|#|\.|[\w-]+\/[\w-/]+$)/.test(t)) return false;
  if (/^[\w.-]+@[\w.-]+$/.test(t)) return false;
  if (/^[A-Z0-9_]+$/.test(t)) return false; // CONSTANTES
  if (/^[a-z]+(-[a-z]+)+$/.test(t)) return false; // css-ish
  if (/^[a-z]+[A-Z]\w*$/.test(t)) return false; // camelCase
  return /[À-ú]/.test(t) || /\s/.test(t) || /^[A-ZÀ-Ú][a-zà-ú]{3,}$/.test(t);
};

const SKIP_CALLEES = /^(navigate|fetch|require|console\.\w+|localStorage\.\w+|sessionStorage\.\w+|JSON\.\w+|Number|String|RegExp|\w+\.(includes|startsWith|endsWith|indexOf|replace|split|match|test|get|set|has|add|delete|querySelector\w*|getAttribute|setAttribute|addEventListener|removeEventListener|toLocale\w+|padStart|padEnd|localeCompare|format|createElement|postMessage)|use(State|Ref|Memo|Callback|Effect|Context)|createContext|Error|setTimeout|encodeURIComponent|decodeURIComponent|new URL|apiFetch|api\.\w+|axios\.\w+|customerApi\w*)$/;

function processFile(file) {
  const rel = path.relative(ROOT, file);
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const scope = camel(path.basename(file));
  const edits = []; // {start,end,text}
  const hookTargets = new Map(); // fn node -> true

  const nameOfFn = (fn) => {
    if (fn.name && ts.isIdentifier(fn.name)) return fn.name.text;
    const p = fn.parent;
    if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
    if (p && ts.isCallExpression(p)) { // forwardRef(function X) / memo(() =>)
      const pp = p.parent;
      if (pp && ts.isVariableDeclaration(pp) && ts.isIdentifier(pp.name)) return pp.name.text;
    }
    return null;
  };
  const isComponent = (n) => /^[A-Z]/.test(n) || /^use[A-Z]/.test(n);
  function findComponent(node) {
    let cur = node.parent;
    let outer = null;
    while (cur) {
      if (ts.isClassLike(cur)) return { cls: true };
      if (ts.isFunctionLike(cur)) {
        const nm = nameOfFn(cur);
        if (nm && isComponent(nm)) outer = cur;
      }
      cur = cur.parent;
    }
    return outer ? { fn: outer } : null;
  }
  function shadowsT(node, comp) {
    let cur = node.parent;
    while (cur && cur !== comp.parent) {
      if (ts.isFunctionLike(cur)) {
        for (const p of cur.parameters) if (ts.isIdentifier(p.name) && p.name.text === 't') return true;
      }
      if ((ts.isBlock(cur) || ts.isSourceFile(cur))) {
        for (const st of cur.statements) {
          if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) {
            if (ts.isIdentifier(d.name) && d.name.text === 't') return true;
          }
        }
      }
      cur = cur.parent;
    }
    return false;
  }

  function hasHook(fn) {
    return fn.body && fn.getText().includes('useI18n()');
  }

  function request(node, ptText, params, start, end, wrap) {
    // valor padrão de parâmetro (`emptyLabel = '...'`) roda antes do corpo: sem hook, sem t()
    for (let up = node.parent; up; up = up.parent) {
      if (ts.isParameter(up)) { skipped.push(`${rel}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1} [valor padrão de parâmetro]: ${ptText}`); return; }
      if (ts.isFunctionLike(up) || ts.isSourceFile(up)) break;
    }
    const comp = findComponent(node);
    if (!comp || comp.cls) { skipped.push(`${rel}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}: ${ptText}`); return; }
    if (shadowsT(node, comp.fn)) { skipped.push(`${rel}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1} [t sombreado]: ${ptText}`); return; }
    if (!ts.isBlock(comp.fn.body)) { skipped.push(`${rel}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1} [arrow sem bloco]: ${ptText}`); return; }
    const key = keyFor(ptText, scope);
    const args = params && params.length ? `, { ${params.map((p) => `${p.name}: ${p.expr}`).join(', ')} }` : '';
    const call = `t('${key}'${args})`;
    edits.push({ start, end, text: wrap ? `{${call}}` : call });
    hookTargets.set(comp.fn, true);
    replacedCount++;
  }

  function templateToText(node) {
    // retorna {text, params} ou null
    if (ts.isNoSubstitutionTemplateLiteral(node)) return { text: node.text, params: [] };
    const params = [];
    let out = node.head.text;
    const used = new Set();
    for (const span of node.templateSpans) {
      const e = span.expression;
      let name = ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : `v${params.length}`;
      while (used.has(name)) name += '2';
      used.add(name);
      const exprText = e.getText();
      if (exprText.includes('\n') || exprText.length > 90) return null;
      params.push({ name, expr: exprText });
      out += `{${name}}` + span.literal.text;
    }
    return { text: out, params };
  }

  function visit(node) {
    // não mexer em imports/types/enum/case/propriedades-chave
    if (ts.isImportDeclaration(node) || ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;

    if (ts.isJsxText(node)) {
      const raw = node.getText();
      const trimmed = raw.replace(/\s+/g, ' ').trim();
      if (looksUi(trimmed) || (hasLetters(trimmed) && !/[{}<>=]/.test(trimmed) && /^[A-ZÀ-Ú(]/.test(trimmed))) {
        const parent = node.parent;
        const sibs = parent.children || [];
        const idx = sibs.indexOf(node);
        const prevExpr = sibs.slice(0, idx).some((c) => ts.isJsxExpression(c));
        const nextExpr = sibs.slice(idx + 1).some((c) => ts.isJsxExpression(c));
        if (prevExpr && nextExpr) { skipped.push(`${rel}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1} [texto no meio de expressões]: ${trimmed}`); }
        else {
          const lead = raw.length - raw.trimStart().length;
          const tail = raw.length - raw.trimEnd().length;
          request(node, trimmed, null, node.getStart() + lead, node.getEnd() - tail, true);
        }
      }
      return;
    }
    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText();
      const init = node.initializer;
      if (ATTRS.has(name) && init && ts.isStringLiteral(init) && looksUi(init.text)) {
        request(init, init.text, null, init.getStart(), init.getEnd(), true);
      } else if (init && ts.isJsxExpression(init) && init.expression) {
        if (ATTRS.has(name)) visit(init.expression);
        else forEachChildSkip(init.expression);
      }
      return;
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
      const p = node.parent;
      if (!p) return;
      // contextos a ignorar
      if (ts.isPropertyAssignment(p) && p.name === node) return;
      if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isCaseClause(p) || ts.isLiteralTypeNode(p) || ts.isElementAccessExpression(p)) return;
      if (ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(p.operatorToken.kind)) return;
      if (ts.isCallExpression(p) && p.arguments.includes(node) && SKIP_CALLEES.test(p.expression.getText())) return;
      if (ts.isJsxAttribute(p) || ts.isNewExpression(p)) return;
      if (ts.isPropertyAssignment(p)) {
        const pn = p.name.getText();
        if (/^(className|style|key|type|id|href|src|to|path|color|background|fontFamily|transition|boxShadow|border\w*|width|height|display|position|variant|kind|status|mode|role|name|target|rel|method)$/.test(pn)) return;
      }
      if (ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        if (ts.isTaggedTemplateExpression(p)) return;
        const conv = templateToText(node);
        if (!conv) return;
        if (!looksUi(conv.text.replace(/\{\w+\}/g, '').trim() || '') && !/[À-ú]/.test(conv.text)) {
          if (ts.isTemplateExpression(node)) ts.forEachChild(node, visit);
          return;
        }
        if (/(^|[\s'"])(\.\/|\/)[\w-]/.test(conv.text) || /className|px |rgba?\(|translate|#[0-9a-f]{3,6}/i.test(conv.text)) { if (ts.isTemplateExpression(node)) ts.forEachChild(node, visit); return; }
        request(node, conv.text, conv.params, node.getStart(), node.getEnd(), false);
        return;
      }
      if (looksUi(node.text)) {
        // dentro de JSX expression -> sem chaves extras
        request(node, node.text, null, node.getStart(), node.getEnd(), false);
      }
      return;
    }
    ts.forEachChild(node, visit);
  }
  function forEachChildSkip(n) { visit(n); }

  ts.forEachChild(sf, visit);
  if (edits.length === 0) return 0;

  // hook insertion edits
  for (const fn of hookTargets.keys()) {
    if (hasHook(fn)) continue;
    const body = fn.body;
    const insertAt = body.getStart() + 1;
    edits.push({ start: insertAt, end: insertAt, text: '\n  const { t } = useI18n();' });
  }
  // aplica de trás pra frente
  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  let out = text;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  // import
  if (!/useI18n\b.*from/.test(out.split('\n').slice(0, 60).join('\n'))) {
    const depth = rel.split(path.sep).length - 1;
    const importPath = (depth === 0 ? './' : '../'.repeat(depth)) + 'i18n/I18nContext';
    const m = out.match(/^import /m);
    const imp = `import { useI18n } from '${importPath}';\n`;
    out = m ? out.slice(0, m.index) + imp + out.slice(m.index) : imp + out;
  }
  OUTPUTS.set(file, out);
  return edits.length;
}

function walk(dir, acc = []) {
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    if (fs.statSync(p).isDirectory()) { if (!SKIP_DIRS.includes(n)) walk(p, acc); }
    else if (p.endsWith('.tsx') && !SKIP_FILES.has(n)) acc.push(p);
  }
  return acc;
}

const perFile = [];
for (const f of walk(ROOT)) {
  const n = processFile(f);
  if (n) perFile.push([path.relative(ROOT, f), n]);
}

// ---- categorias do catálogo: helper + chaves + pontos de uso (âncoras) ----
const CAT_USES = [
  ['components/CategoryChips.tsx', 'label={category.name}', 'label={categoryLabel(category, t)}'],
  ['pages/MenuPage.tsx', '>{category.name}</span>', '>{categoryLabel(category, t)}</span>'],
  ['pages/PromotionDetailPage.tsx', '.map((c) => c.name)', '.map((c) => categoryLabel(c, t))'],
];
const problems = [];
for (const [rel, from, to] of CAT_USES) {
  const file = path.join(ROOT, rel);
  let content = OUTPUTS.get(file) ?? fs.readFileSync(file, 'utf8');
  if (content.includes(to)) continue;
  if (!content.includes(from)) { problems.push(`âncora não encontrada em ${rel}: ${from}`); continue; }
  content = content.replace(from, () => to);
  const depth = rel.split('/').length - 1;
  const imp = `import { categoryLabel } from '${depth === 0 ? './' : '../'.repeat(depth)}i18n/categoryLabel';\n`;
  if (!content.includes('i18n/categoryLabel')) content = content.replace(/^import /m, () => imp + 'import ');
  if (!content.includes('useI18n()')) problems.push(`${rel} usa categoryLabel mas não tem useI18n() no componente`);
  OUTPUTS.set(file, content);
}

// ---- dicionários ----
const LANGS = [['pt-BR', null], ['en', 0], ['es', 1]];
const esc = (v) => v.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const keepWs = (pt, tr) => pt.slice(0, pt.length - pt.trimStart().length) + tr.trim() + pt.slice(pt.trimEnd().length);
const missing = [];
for (const [key, pt] of newEntries) if (!TR.texts[pt.trim()]) missing.push(`${key}: ${pt}`);
if (missing.length) problems.push(`faltam traduções (${missing.length}):\n  ` + missing.join('\n  '));

const catKeys = Object.keys(TR.categories);
const dictOut = new Map();
for (const [lang, idx] of LANGS) {
  const p = path.join(ROOT, `i18n/dictionaries/${lang}.ts`);
  let d = fs.readFileSync(p, 'utf8');
  const marker = lang === 'pt-BR' ? '  // Erros genéricos\n' : "  'error.generic'";
  if (!d.includes(marker)) { problems.push(`âncora não encontrada em ${lang}.ts: ${marker.trim()}`); continue; }
  let block = '';
  for (const [key, pt] of newEntries) {
    const tr = TR.texts[pt.trim()];
    if (!tr) continue;
    block += `  '${key}': '${esc(idx === null ? pt : keepWs(pt, tr[idx]))}',\n`;
  }
  for (const ck of catKeys) {
    if (d.includes(`'category.${ck}'`)) continue;
    const c = TR.categories[ck];
    block += `  'category.${ck}': '${esc(idx === null ? c.pt : idx === 0 ? c.en : c.es)}',\n`;
  }
  // função, não string: o texto traz "$" (R$) e String.replace interpretaria "$'"
  if (block) d = d.replace(marker, () => block + '\n' + marker);
  dictOut.set(p, d);
}

const helperPath = path.join(ROOT, 'i18n/categoryLabel.ts');
const helper = `import type { TranslationKey } from './dictionaries/pt-BR';
import { getDictionary } from './translate';
import { DEFAULT_LANGUAGE } from './languages';

// Nome da categoria no idioma do app. Categorias do CATÁLOGO (têm \`key\`) vêm
// do dicionário (\`category.<key>\`); categorias personalizadas do restaurante
// (sem key) e qualquer chave sem tradução mostram o nome cadastrado, intacto.
type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

export function categoryLabel(category: { key: string | null; name: string }, t: Translate): string {
  if (!category.key) return category.name;
  const key = \`category.\${category.key}\` as TranslationKey;
  return key in getDictionary(DEFAULT_LANGUAGE) ? t(key) : category.name;
}

// Texto de dado dinâmico com traduções opcionais ({ 'pt-BR': ..., en: ... }).
// Hoje o banco guarda só texto simples, então cai direto no valor original.
export function localizedText(value: string | Partial<Record<string, string>>, language: string): string {
  if (typeof value === 'string') return value;
  return value[language] ?? value['pt-BR'] ?? value.pt ?? Object.values(value).find(Boolean) ?? '';
}
`;

console.log(`${WRITE ? 'GRAVANDO' : 'RELATÓRIO'}: ${replacedCount} trocas, ${newEntries.size} chaves novas, ${skipped.length} puladas, ${catKeys.length} categorias`);
for (const [f, n] of perFile.sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(String(n).padStart(4), f);
fs.writeFileSync(path.resolve(__dirname, 'i18n-skipped.txt'), skipped.join('\n'));

if (problems.length) {
  console.error('\nABORTADO (nada foi gravado):\n- ' + problems.join('\n- '));
  process.exit(1);
}
if (WRITE) {
  for (const [f, c] of OUTPUTS) fs.writeFileSync(f, c);
  for (const [f, c] of dictOut) fs.writeFileSync(f, c);
  if (!fs.existsSync(helperPath)) fs.writeFileSync(helperPath, helper);
  console.log('OK: arquivos gravados. Rode: npm run build');
} else {
  console.log('Nada gravado (use --write).');
}
