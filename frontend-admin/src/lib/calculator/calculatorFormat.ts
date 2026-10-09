// Formatação da calculadora. Nunca devolve "NaN"/"Infinity": valor inválido vira "—".
import { roundTo } from './calculatorMath';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const PERCENT = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const DECIMAL = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 4 });

export const NO_VALUE = '—';

// -0 e -0,001 não podem aparecer como "-R$ 0,00".
const clean = (v: number, decimals: number): number => roundTo(v, decimals) + 0;

export function formatBRL(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_VALUE;
  return BRL.format(clean(value, 2));
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_VALUE;
  return `${PERCENT.format(clean(value, 2))}%`;
}

export function formatDecimal(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_VALUE;
  return DECIMAL.format(clean(value, 4));
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return NO_VALUE;
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
