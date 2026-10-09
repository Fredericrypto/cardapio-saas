import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { ArrowLeft, Calculator, Check, Copy } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useManagerCalculator } from '../../contexts/ManagerCalculatorContext';
import { displayExpression, evaluateExpression, keyFromEvent, prettyNumber } from '../../lib/calculator/calculatorExpression';
import type { KeypadKey } from '../../lib/calculator/calculatorExpression';
import { ConfirmDialog } from './ConfirmDialog';

interface KeyDef {
  key: KeypadKey;
  label: string;
  tone: 'digit' | 'operator' | 'symbol' | 'danger' | 'equals';
  span?: number;
  aria: string;
}

// Números neutros; operadores e símbolos com cor própria (traço fino, suave nos dois temas).
const TONES: Record<KeyDef['tone'], string> = {
  digit: 'bg-white border border-gray-200 text-gray-900 hover:bg-gray-50',
  operator: 'bg-gray-50 border border-gray-200 text-sky-600 dark:text-sky-300 hover:bg-gray-100',
  symbol: 'bg-gray-50 border border-gray-200 text-violet-600 dark:text-violet-300 hover:bg-gray-100',
  danger: 'bg-red-50 border border-red-200 text-red-600 hover:bg-red-100',
  equals: 'border border-transparent text-white hover:opacity-90',
};

const KEYS: KeyDef[] = [
  { key: 'all', label: 'AC', tone: 'danger', aria: 'Limpar tudo (visor e histórico)' },
  { key: 'clear', label: 'C', tone: 'danger', aria: 'Limpar a conta atual' },
  { key: '(', label: '(', tone: 'symbol', aria: 'Abrir parêntese' },
  { key: ')', label: ')', tone: 'symbol', aria: 'Fechar parêntese' },
  { key: '7', label: '7', tone: 'digit', aria: '7' },
  { key: '8', label: '8', tone: 'digit', aria: '8' },
  { key: '9', label: '9', tone: 'digit', aria: '9' },
  { key: '/', label: '÷', tone: 'operator', aria: 'Dividir' },
  { key: '4', label: '4', tone: 'digit', aria: '4' },
  { key: '5', label: '5', tone: 'digit', aria: '5' },
  { key: '6', label: '6', tone: 'digit', aria: '6' },
  { key: '*', label: '×', tone: 'operator', aria: 'Multiplicar' },
  { key: '1', label: '1', tone: 'digit', aria: '1' },
  { key: '2', label: '2', tone: 'digit', aria: '2' },
  { key: '3', label: '3', tone: 'digit', aria: '3' },
  { key: '-', label: '−', tone: 'operator', aria: 'Subtrair' },
  { key: '0', label: '0', tone: 'digit', aria: '0' },
  { key: '.', label: ',', tone: 'digit', aria: 'Vírgula decimal' },
  { key: '%', label: '%', tone: 'symbol', aria: 'Porcentagem' },
  { key: '+', label: '+', tone: 'operator', aria: 'Somar' },
  { key: 'back', label: '', tone: 'symbol', aria: 'Apagar o último caractere' },
  { key: '=', label: '=', tone: 'equals', span: 3, aria: 'Calcular' },
];

export function DisplayAndKeypad() {
  const { tenant } = useAuth();
  const { keypad, pressKeypad } = useManagerCalculator();
  const [confirmClear, setConfirmClear] = useState(false);
  const [copied, setCopied] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Teclado físico logo ao abrir (sem roubar o foco de um campo que já esteja sendo editado).
  useEffect(() => {
    if (document.activeElement === document.body) boxRef.current?.focus();
  }, []);

  // Teclado físico: vale SÓ enquanto o foco está neste painel. Teclas tratadas aqui não
  // sobem para o resto do app (nenhum atalho global dispara por engano).
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
    const key = keyFromEvent(e.key);
    if (!key) return;
    e.preventDefault();
    e.stopPropagation();
    pressKeypad(key);
  }

  function press(key: KeypadKey) {
    if (key === 'all') {
      setConfirmClear(true);
      return;
    }
    pressKeypad(key);
    boxRef.current?.focus({ preventScroll: true });
  }

  const hasResult = keypad.result !== null && !keypad.result.startsWith('Erro');
  const live = keypad.result === null && keypad.expression !== '' ? evaluateExpression(keypad.expression) : null;
  const preview = live && live.ok ? prettyNumber(live.value) : '';
  const main = hasResult ? prettyNumber(keypad.result as string) : keypad.result ?? preview;

  async function copyResult() {
    if (!hasResult) return;
    try {
      await navigator.clipboard.writeText((keypad.result as string).replace('.', ','));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* navegador sem permissão de área de transferência */
    }
  }

  return (
    <>
    <div
      ref={boxRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      aria-label="Calculadora: use o teclado numérico ou os botões"
      className="bg-white border border-gray-100 rounded-2xl p-4 flex flex-col gap-3 outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
          <Calculator size={14} strokeWidth={1.25} />
          Calculadora
        </p>
        <button
          type="button"
          onClick={() => void copyResult()}
          disabled={!hasResult}
          aria-label="Copiar resultado"
          title="Copiar resultado"
          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30"
        >
          {copied ? <Check size={14} strokeWidth={1.5} /> : <Copy size={14} strokeWidth={1.5} />}
        </button>
      </div>

      <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 min-h-[92px] flex flex-col justify-end items-end gap-1 overflow-hidden" aria-live="polite">
        <p className="text-sm font-mono text-gray-500 break-all text-right max-w-full">{displayExpression(keypad.expression) || '0'}</p>
        <p
          className={`font-mono text-3xl leading-tight break-all text-right max-w-full ${
            keypad.result?.startsWith('Erro') ? 'text-red-500 text-base' : hasResult ? 'text-gray-900 font-semibold' : 'text-gray-400'
          }`}
        >
          {main || '\u00A0'}
        </p>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {KEYS.map((k) => (
          <button
            key={k.key}
            type="button"
            onClick={() => press(k.key)}
            aria-label={k.aria}
            style={k.tone === 'equals' ? { backgroundColor: tenant?.primaryColor ?? '#3d3846' } : undefined}
            className={`h-12 rounded-xl text-lg font-mono flex items-center justify-center transition-colors select-none ${TONES[k.tone]} ${k.span === 3 ? 'col-span-3' : ''}`}
          >
            {k.key === 'back' ? <ArrowLeft size={18} strokeWidth={1.25} /> : k.label}
          </button>
        ))}
      </div>

      <p className="text-[11px] text-gray-400 leading-snug">
        Teclado físico: 0–9, + − * /, Enter (=), Backspace (apagar) e Esc (limpar a conta). Clique no painel para ativá-lo.
        <br />
        Exemplo: 200 + 10% = 220.
      </p>

      {keypad.history.length > 0 && (
        <ul className="flex flex-col divide-y divide-gray-100 border-t border-gray-100 pt-1">
          {keypad.history.slice(0, 4).map((h, idx) => (
            <li key={`${h.expression}-${idx}`} className="flex items-center justify-between gap-3 py-1.5 text-[11px] font-mono text-gray-400">
              <span className="truncate">{displayExpression(h.expression)}</span>
              <span className="shrink-0 text-gray-600">= {prettyNumber(h.result)}</span>
            </li>
          ))}
        </ul>
      )}

    </div>

      {confirmClear && (
        <ConfirmDialog
          title="Limpar a calculadora?"
          message="O visor e o histórico de contas serão apagados. Suas simulações e rascunhos salvos não são afetados."
          confirmLabel="Limpar"
          onCancel={() => setConfirmClear(false)}
          onConfirm={() => {
            pressKeypad('all');
            setConfirmClear(false);
            boxRef.current?.focus({ preventScroll: true });
          }}
        />
      )}
    </>
  );
}
