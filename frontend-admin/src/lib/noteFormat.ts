// Formatação das anotações: markdown simples, renderizado SEM HTML (o painel
// monta elementos React a partir dos blocos — nada digitado vira código).
//   **negrito**   _itálico_   __sublinhado__
//   - item de lista        - [ ] tarefa        - [x] tarefa feita

export interface Run {
  text: string;
  b?: boolean;
  i?: boolean;
  u?: boolean;
}

export type Block =
  | { kind: 'text'; line: number; runs: Run[] }
  | { kind: 'bullet'; line: number; runs: Run[] }
  | { kind: 'check'; line: number; checked: boolean; runs: Run[] }
  | { kind: 'blank'; line: number };

const isWord = (ch: string | undefined) => !!ch && /[\p{L}\p{N}]/u.test(ch);

export function parseInline(src: string, flags: Omit<Run, 'text'> = {}): Run[] {
  const out: Run[] = [];
  let buf = '';
  let i = 0;
  const flush = () => {
    if (buf) out.push({ text: buf, ...flags });
    buf = '';
  };
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === '**' || two === '__') {
      const end = src.indexOf(two, i + 2);
      if (end > i + 2) {
        flush();
        out.push(...parseInline(src.slice(i + 2, end), { ...flags, [two === '**' ? 'b' : 'u']: true }));
        i = end + 2;
        continue;
      }
    }
    // "_" só é itálico quando abre/fecha uma palavra (não quebra snake_case).
    if (src[i] === '_' && !isWord(src[i - 1])) {
      const end = src.indexOf('_', i + 1);
      if (end > i + 1 && !isWord(src[end + 1]) && src[end - 1] !== ' ') {
        flush();
        out.push(...parseInline(src.slice(i + 1, end), { ...flags, i: true }));
        i = end + 1;
        continue;
      }
    }
    buf += src[i];
    i++;
  }
  flush();
  return out;
}

const CHECK_RE = /^(\s*)[-*] \[( |x|X)\] ?(.*)$/;
const BULLET_RE = /^(\s*)[-*] (.*)$/;

export function parseNote(content: string): Block[] {
  return content.split('\n').map((raw, line): Block => {
    const check = CHECK_RE.exec(raw);
    if (check) return { kind: 'check', line, checked: check[2].toLowerCase() === 'x', runs: parseInline(check[3]) };
    const bullet = BULLET_RE.exec(raw);
    if (bullet) return { kind: 'bullet', line, runs: parseInline(bullet[2]) };
    if (raw.trim() === '') return { kind: 'blank', line };
    return { kind: 'text', line, runs: parseInline(raw) };
  });
}

// Marca/desmarca a tarefa da linha `line` (usado ao clicar na caixa do card).
export function toggleCheckLine(content: string, line: number): string {
  const lines = content.split('\n');
  const raw = lines[line];
  const m = raw !== undefined ? CHECK_RE.exec(raw) : null;
  if (!m) return content;
  lines[line] = `${m[1]}- [${m[2] === ' ' ? 'x' : ' '}] ${m[3]}`;
  return lines.join('\n');
}

export function progress(content: string): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const b of parseNote(content)) {
    if (b.kind === 'check') {
      total++;
      if (b.checked) done++;
    }
  }
  return { done, total };
}

// ----------------------------------------------------------- edição (textarea)
export interface EditResult {
  value: string;
  selStart: number;
  selEnd: number;
}

// Envolve a seleção com o marcador (ou remove, se já estiver envolvida).
export function toggleWrap(value: string, start: number, end: number, marker: string): EditResult {
  const m = marker.length;
  const before = value.slice(Math.max(0, start - m), start);
  const after = value.slice(end, end + m);
  if (before === marker && after === marker) {
    return {
      value: value.slice(0, start - m) + value.slice(start, end) + value.slice(end + m),
      selStart: start - m,
      selEnd: end - m,
    };
  }
  const selected = value.slice(start, end) || 'texto';
  const next = value.slice(0, start) + marker + selected + marker + value.slice(end);
  return { value: next, selStart: start + m, selEnd: start + m + selected.length };
}

// Liga/desliga o prefixo ("- " ou "- [ ] ") em todas as linhas da seleção.
export function toggleLinePrefix(value: string, start: number, end: number, kind: 'bullet' | 'check'): EditResult {
  const collapsed = start === end;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const nl = value.indexOf('\n', end);
  const lineEnd = nl === -1 ? value.length : nl;
  const lines = value.slice(lineStart, lineEnd).split('\n');
  const strip = (l: string) => l.replace(/^\s*[-*] \[( |x|X)\] ?/, '').replace(/^\s*[-*] /, '');
  const hasKind = lines.every((l) => (kind === 'check' ? CHECK_RE.test(l) : BULLET_RE.test(l) && !CHECK_RE.test(l)));
  const out = lines.map((l) => (hasKind ? strip(l) : `${kind === 'check' ? '- [ ] ' : '- '}${strip(l)}`));
  const block = out.join('\n');
  const blockEnd = lineStart + block.length;
  return {
    value: value.slice(0, lineStart) + block + value.slice(lineEnd),
    // Cursor simples: vai para o fim da linha (assim a próxima letra digitada
    // NÃO apaga o prefixo). Seleção de várias linhas: mantém o bloco marcado.
    selStart: collapsed ? blockEnd : lineStart,
    selEnd: blockEnd,
  };
}

// Enter dentro de uma lista continua a lista; Enter numa linha de lista vazia a encerra.
export function continueList(value: string, caret: number): EditResult | null {
  const lineStart = value.lastIndexOf('\n', caret - 1) + 1;
  const line = value.slice(lineStart, caret);
  const check = CHECK_RE.exec(line);
  const bullet = check ? null : BULLET_RE.exec(line);
  const prefix = check ? `${check[1]}- [ ] ` : bullet ? `${bullet[1]}- ` : null;
  if (!prefix) return null;
  const body = check ? check[3] : bullet![2];
  if (body.trim() === '') {
    // linha de lista vazia: remove o prefixo e sai da lista
    const next = value.slice(0, lineStart) + value.slice(caret);
    return { value: next, selStart: lineStart, selEnd: lineStart };
  }
  const insert = `\n${prefix}`;
  const next = value.slice(0, caret) + insert + value.slice(caret);
  const pos = caret + insert.length;
  return { value: next, selStart: pos, selEnd: pos };
}
