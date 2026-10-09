// Visor da calculadora: avaliador de expressões SEM eval() e SEM ponto flutuante
// (ponto fixo em BigInt, 10 casas), mais as regras do teclado (tela e físico).
//
// Regras:
//  - operadores + − × ÷, parênteses e % (x% = x ÷ 100);
//  - "200 + 10%" = 220 (percentual depois de + ou − é percentual DO valor à esquerda);
//  - divisão por zero e valores gigantes viram mensagem, nunca NaN/Infinity;
//  - parênteses abertos são fechados sozinhos no "=".
import type { KeypadHistoryEntry, KeypadState } from '../../types/managerCalculator';
import { divRound, parseScaled } from './calculatorMath';

const SCALE_DIGITS = 10;
const SCALE = BigInt(10) ** BigInt(SCALE_DIGITS);
const MAX_ABS = BigInt(10) ** BigInt(15) * SCALE;
const MAX_LENGTH = 200;
const SHOW_DECIMALS = 8;
const HISTORY_LIMIT = 30;

export type ExpressionResult = { ok: true; value: string } | { ok: false; message: string };

interface Node {
  v: bigint;
  pct: boolean; // terminou em "%"
}

class ExprError extends Error {}

type Token = { t: 'num'; v: bigint } | { t: 'op'; v: '+' | '-' | '*' | '/' | '%' | '(' | ')' };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src.charAt(i);
    if (/\d|\./.test(ch)) {
      let j = i;
      while (j < src.length && /[\d.]/.test(src.charAt(j))) j += 1;
      const text = src.slice(i, j);
      if ((text.match(/\./g) ?? []).length > 1) throw new ExprError('Número inválido.');
      const v = parseScaled(text, SCALE_DIGITS);
      if (v === null) throw new ExprError('Número inválido.');
      tokens.push({ t: 'num', v });
      i = j;
    } else if ('+-*/%()'.includes(ch)) {
      tokens.push({ t: 'op', v: ch as '+' | '-' | '*' | '/' | '%' | '(' | ')' });
      i += 1;
    } else {
      throw new ExprError('Caractere inválido.');
    }
  }
  return tokens;
}

function guard(v: bigint): bigint {
  if (v > MAX_ABS || v < -MAX_ABS) throw new ExprError('Valor muito grande.');
  return v;
}

function parse(tokens: Token[]): bigint {
  let pos = 0;
  const peekOp = (): string | null => {
    const tk = tokens[pos];
    return tk && tk.t === 'op' ? tk.v : null;
  };

  function expr(): Node {
    let acc = term();
    for (let op = peekOp(); op === '+' || op === '-'; op = peekOp()) {
      pos += 1;
      const right = term();
      // "200 + 10%" → 10% DE 200 (só quando a esquerda não é ela própria um percentual).
      const operand = right.pct && !acc.pct ? divRound(acc.v * right.v, SCALE) : right.v;
      acc = { v: guard(op === '+' ? acc.v + operand : acc.v - operand), pct: false };
    }
    return acc;
  }

  function term(): Node {
    let acc = unary();
    for (let op = peekOp(); op === '*' || op === '/'; op = peekOp()) {
      pos += 1;
      const right = unary();
      if (op === '*') {
        acc = { v: guard(divRound(acc.v * right.v, SCALE)), pct: false };
      } else {
        if (right.v === BigInt(0)) throw new ExprError('Divisão por zero.');
        acc = { v: guard(divRound(acc.v * SCALE, right.v)), pct: false };
      }
    }
    return acc;
  }

  function unary(): Node {
    const op = peekOp();
    if (op === '-' || op === '+') {
      pos += 1;
      const inner = unary();
      return { v: op === '-' ? -inner.v : inner.v, pct: inner.pct };
    }
    return postfix();
  }

  function postfix(): Node {
    let node = primary();
    while (peekOp() === '%') {
      pos += 1;
      node = { v: divRound(node.v, BigInt(100)), pct: true };
    }
    return node;
  }

  function primary(): Node {
    const tk = tokens[pos];
    if (!tk) throw new ExprError('Expressão incompleta.');
    if (tk.t === 'num') {
      pos += 1;
      return { v: guard(tk.v), pct: false };
    }
    if (tk.v === '(') {
      pos += 1;
      const inner = expr();
      if (peekOp() !== ')') throw new ExprError('Parênteses não balanceados.');
      pos += 1;
      return { v: inner.v, pct: false };
    }
    throw new ExprError('Expressão inválida.');
  }

  const result = expr();
  if (pos < tokens.length) throw new ExprError('Expressão inválida.');
  return result.v;
}

// Ponto fixo → texto com até 8 casas (arredondado), sem zeros sobrando: "0.3", "-12.5", "100".
function formatFixed(v: bigint): string {
  const drop = BigInt(10) ** BigInt(SCALE_DIGITS - SHOW_DECIMALS);
  const rounded = divRound(v, drop);
  const negative = rounded < BigInt(0);
  const abs = negative ? -rounded : rounded;
  const base = BigInt(10) ** BigInt(SHOW_DECIMALS);
  const whole = abs / base;
  const frac = (abs % base).toString().padStart(SHOW_DECIMALS, '0').replace(/0+$/, '');
  const text = frac ? `${whole}.${frac}` : `${whole}`;
  return negative && abs !== BigInt(0) ? `-${text}` : text;
}

export function evaluateExpression(source: string): ExpressionResult {
  try {
    let src = source.replace(/\s+/g, '').replace(/,/g, '.').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
    if (src === '') return { ok: false, message: '' };
    if (src.length > MAX_LENGTH) return { ok: false, message: 'Expressão longa demais.' };
    src = src.replace(/[+\-*/.]+$/, ''); // operador sobrando no fim
    const open = (src.match(/\(/g) ?? []).length;
    const close = (src.match(/\)/g) ?? []).length;
    if (close > open) return { ok: false, message: 'Parênteses não balanceados.' };
    src += ')'.repeat(open - close);
    if (src === '') return { ok: false, message: '' };
    return { ok: true, value: formatFixed(parse(tokenize(src))) };
  } catch (err) {
    return { ok: false, message: err instanceof ExprError ? err.message : 'Não foi possível calcular.' };
  }
}

// "1234567.5" → "1.234.567,5" (só exibição).
export function prettyNumber(value: string): string {
  const negative = value.startsWith('-');
  const [int = '0', frac] = (negative ? value.slice(1) : value).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}${grouped}${frac ? `,${frac}` : ''}`;
}

// ---------------------------------------------------------------------------
// Teclado
// ---------------------------------------------------------------------------
export type KeypadKey =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | '.' | '+' | '-' | '*' | '/' | '%' | '(' | ')'
  | '=' | 'back' | 'clear' | 'all';

export const EMPTY_KEYPAD: KeypadState = { expression: '', result: null, history: [] };

const OPERATORS = '+-*/';
const isOperator = (ch: string): boolean => ch !== '' && OPERATORS.includes(ch);
const isDigit = (ch: string): boolean => ch !== '' && /\d/.test(ch);

// Mapeia a tecla física para a tecla do teclado virtual (null = ignorar).
export function keyFromEvent(key: string): KeypadKey | null {
  if (/^[0-9]$/.test(key)) return key as KeypadKey;
  switch (key) {
    case '+': case '-': case '*': case '/': case '%': case '(': case ')':
      return key;
    case '.': case ',':
      return '.';
    case 'x': case 'X':
      return '*';
    case 'Enter': case '=':
      return '=';
    case 'Backspace':
      return 'back';
    case 'Escape':
      return 'clear';
    default:
      return null;
  }
}

// Número que está sendo digitado agora (para não aceitar dois pontos decimais).
function currentNumber(expr: string): string {
  const m = expr.match(/[\d.]*$/);
  return m ? m[0] : '';
}

export function pressKey(state: KeypadState, key: KeypadKey): KeypadState {
  if (key === 'all') return EMPTY_KEYPAD;
  if (key === 'clear') return { ...state, expression: '', result: null };

  if (key === '=') {
    if (state.expression === '') return state;
    const out = evaluateExpression(state.expression);
    if (!out.ok) return { ...state, result: out.message ? `Erro: ${out.message}` : null };
    const entry: KeypadHistoryEntry = { expression: state.expression, result: out.value };
    return {
      expression: state.expression,
      result: out.value,
      history: [entry, ...state.history].slice(0, HISTORY_LIMIT),
    };
  }

  // Depois de um "=" bem-sucedido: operador/% continua do resultado; qualquer outra
  // tecla começa uma conta nova. Depois de um ERRO a expressão é mantida para editar.
  let expr = state.expression;
  const hasResult = state.result !== null && !state.result.startsWith('Erro');
  if (hasResult) {
    expr = isOperator(key) || key === '%' ? (state.result as string) : '';
  }
  const withExpr = (next: string): KeypadState => ({ ...state, expression: next.slice(0, MAX_LENGTH), result: null });

  const last = expr.charAt(expr.length - 1);

  if (key === 'back') return withExpr(expr.slice(0, -1));

  if (isDigit(key)) {
    // Número colado em ")" ou "%" vira multiplicação implícita: (2)3 → (2)×3
    return withExpr(last === ')' || last === '%' ? `${expr}*${key}` : expr + key);
  }
  if (key === '.') {
    if (currentNumber(expr).includes('.')) return state.result === null ? state : withExpr(expr);
    return withExpr(isDigit(last) || last === '.' ? `${expr}.` : `${expr}0.`);
  }
  if (isOperator(key)) {
    if (expr === '' || last === '(') return key === '-' ? withExpr(expr + key) : state.result === null ? state : withExpr(expr);
    if (isOperator(last)) {
      // Troca o operador anterior (mantém "×−" para número negativo).
      if ((key === '-' && (last === '*' || last === '/')) ) return withExpr(expr + key);
      const base = isOperator(expr.charAt(expr.length - 2)) ? expr.slice(0, -2) : expr.slice(0, -1);
      return withExpr(base + key);
    }
    return withExpr(expr + key);
  }
  if (key === '%') {
    if (isDigit(last) || last === ')' || last === '%') return withExpr(expr + key);
    return state.result === null ? state : withExpr(expr);
  }
  if (key === '(') {
    // Número colado em "(" vira multiplicação implícita: 2( → 2×(
    return withExpr(isDigit(last) || last === ')' || last === '%' ? `${expr}*(` : `${expr}(`);
  }
  if (key === ')') {
    const open = (expr.match(/\(/g) ?? []).length;
    const close = (expr.match(/\)/g) ?? []).length;
    if (open <= close || isOperator(last) || last === '(' || last === '') return state.result === null ? state : withExpr(expr);
    return withExpr(expr + key);
  }
  return state;
}

// Para exibir a expressão com os símbolos bonitos.
export function displayExpression(expr: string): string {
  return expr.replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−').replace(/\./g, ',');
}
